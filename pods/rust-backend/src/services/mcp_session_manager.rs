use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::mcp_session::McpSession;
use crate::error::AppError;

/// Manages a pool of MCP sessions with automatic cleanup
pub struct McpSessionManager {
    sessions: Arc<RwLock<HashMap<String, McpSession>>>,
    running: Arc<std::sync::atomic::AtomicBool>,
}

impl McpSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Start the session manager and its periodic cleanup task
    pub fn start(&self) {
        self.running.store(true, std::sync::atomic::Ordering::SeqCst);

        let sessions = Arc::clone(&self.sessions);
        let running = Arc::clone(&self.running);

        tokio::spawn(async move {
            tracing::info!("MCP session cleanup task started");
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(300)).await; // 5 min

                if !running.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }

                let now = Utc::now();
                let mut to_remove = Vec::new();

                {
                    let sessions = sessions.read().await;
                    for (id, session) in sessions.iter() {
                        let idle_secs = (now - session.last_used).num_seconds();
                        if idle_secs > 1800 { // 30 minutes
                            tracing::info!(
                                connection_id = %id,
                                idle_secs = idle_secs,
                                "Marking MCP session for cleanup (idle)"
                            );
                            to_remove.push(id.clone());
                        }
                    }
                }

                if !to_remove.is_empty() {
                    let mut sessions = sessions.write().await;
                    for id in to_remove {
                        if let Some(mut session) = sessions.remove(&id) {
                            session.cleanup().await;
                        }
                    }
                }
            }
            tracing::info!("MCP session cleanup task stopped");
        });
    }

    /// Get an existing connected session, or create a new one
    pub async fn get_or_create_stdio(
        &self,
        connection_id: &str,
        command: &str,
        args: &[String],
        env_vars: Option<&HashMap<String, String>>,
    ) -> Result<(), AppError> {
        // Check if we already have a connected session
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(connection_id) {
                if session.connected {
                    return Ok(());
                }
            }
        }

        // Remove old disconnected session if exists
        {
            let mut sessions = self.sessions.write().await;
            if let Some(mut old) = sessions.remove(connection_id) {
                old.cleanup().await;
            }
        }

        // Create new session
        let mut session = McpSession::new(connection_id, "stdio");
        session.connect_stdio(command, args, env_vars).await?;

        let mut sessions = self.sessions.write().await;
        sessions.insert(connection_id.to_string(), session);
        Ok(())
    }

    /// Get an existing connected HTTP session, or create a new one
    pub async fn get_or_create_http(
        &self,
        connection_id: &str,
        base_url: &str,
        api_key: Option<&str>,
    ) -> Result<(), AppError> {
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(connection_id) {
                if session.connected {
                    return Ok(());
                }
            }
        }

        {
            let mut sessions = self.sessions.write().await;
            if let Some(mut old) = sessions.remove(connection_id) {
                old.cleanup().await;
            }
        }

        let mut session = McpSession::new(connection_id, "http");
        session.connect_http(base_url, api_key).await?;

        let mut sessions = self.sessions.write().await;
        sessions.insert(connection_id.to_string(), session);
        Ok(())
    }

    /// List tools for a session
    /// Takes session out of the map, releases the lock, operates, then puts it back.
    pub async fn list_tools(
        &self,
        connection_id: &str,
        use_cache: bool,
    ) -> Result<Vec<crate::models::mcp_tools::MCPToolInfo>, AppError> {
        // Take the session out so we don't hold the write lock during the RPC call
        let mut session = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(connection_id)
                .ok_or_else(|| AppError::NotFound(format!(
                    "No active MCP session for connection '{}'", connection_id
                )))?
        }; // write lock released here

        if !session.connected {
            // Put it back before returning error
            let mut sessions = self.sessions.write().await;
            sessions.insert(connection_id.to_string(), session);
            return Err(AppError::Internal(format!(
                "MCP session '{}' is not connected", connection_id
            )));
        }

        let result = session.list_tools(use_cache).await;

        // Put session back regardless of result
        let mut sessions = self.sessions.write().await;
        sessions.insert(connection_id.to_string(), session);

        result
    }

    /// Execute a tool on a session
    /// Takes session out of the map, releases the lock, operates, then puts it back.
    pub async fn call_tool(
        &self,
        connection_id: &str,
        tool_name: &str,
        arguments: Option<serde_json::Map<String, serde_json::Value>>,
    ) -> Result<serde_json::Value, AppError> {
        // Take the session out so we don't hold the write lock during the RPC call
        let mut session = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(connection_id)
                .ok_or_else(|| AppError::NotFound(format!(
                    "No active MCP session for connection '{}'", connection_id
                )))?
        }; // write lock released here

        if !session.connected {
            let mut sessions = self.sessions.write().await;
            sessions.insert(connection_id.to_string(), session);
            return Err(AppError::Internal(format!(
                "MCP session '{}' is not connected", connection_id
            )));
        }

        let result = session.call_tool(tool_name, arguments).await;

        // Put session back regardless of result
        let mut sessions = self.sessions.write().await;
        sessions.insert(connection_id.to_string(), session);

        result
    }

    /// Get session capabilities
    pub async fn get_capabilities(&self, connection_id: &str) -> Option<(bool, bool, bool)> {
        let sessions = self.sessions.read().await;
        sessions.get(connection_id).map(|s| s.get_capabilities())
    }

    /// Check if a session is connected
    pub async fn is_connected(&self, connection_id: &str) -> bool {
        let sessions = self.sessions.read().await;
        sessions.get(connection_id).map(|s| s.connected).unwrap_or(false)
    }

    /// Get tools count for a session (from cache)
    pub async fn tools_count(&self, connection_id: &str) -> i64 {
        let sessions = self.sessions.read().await;
        sessions.get(connection_id)
            .map(|s| s.tools_cache.len() as i64)
            .unwrap_or(0)
    }

    /// Remove a specific session
    #[allow(dead_code)]
    pub async fn remove_session(&self, connection_id: &str) {
        let mut sessions = self.sessions.write().await;
        if let Some(mut session) = sessions.remove(connection_id) {
            session.cleanup().await;
        }
    }

    /// List all active sessions info
    #[allow(dead_code)]
    pub async fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.read().await;
        sessions.iter().map(|(id, s)| SessionInfo {
            connection_id: id.clone(),
            transport_type: s.transport_type.clone(),
            connected: s.connected,
            last_used: s.last_used,
            tools_count: s.tools_cache.len(),
        }).collect()
    }

    /// Shutdown all sessions
    pub async fn stop(&self) {
        self.running.store(false, std::sync::atomic::Ordering::SeqCst);

        let mut sessions = self.sessions.write().await;
        for (id, mut session) in sessions.drain() {
            tracing::info!(connection_id = %id, "Shutting down MCP session");
            session.cleanup().await;
        }
        tracing::info!("All MCP sessions shut down");
    }
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct SessionInfo {
    pub connection_id: String,
    pub transport_type: String,
    pub connected: bool,
    pub last_used: chrono::DateTime<chrono::Utc>,
    pub tools_count: usize,
}
