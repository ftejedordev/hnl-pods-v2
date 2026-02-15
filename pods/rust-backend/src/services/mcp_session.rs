use chrono::{DateTime, Utc};
use rmcp::{
    ServiceExt,
    model::CallToolRequestParams,
    transport::{ConfigureCommandExt, TokioChildProcess},
};
use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashMap;
use std::time::Instant;
use tokio::process::Command;

use crate::error::AppError;
use crate::models::mcp_tools::{MCPToolInfo, MCPToolSchema};
use crate::utils::command_utils::{normalize_mcp_command, fix_stdio_args};

type McpClient = rmcp::service::RunningService<rmcp::RoleClient, ()>;

/// Individual MCP session wrapping an rmcp client
#[allow(dead_code)]
pub struct McpSession {
    pub connection_id: String,
    pub transport_type: String,
    client: Option<McpClient>,
    pub connected: bool,
    pub last_used: DateTime<Utc>,
    pub tools_cache: Vec<MCPToolInfo>,
}

impl McpSession {
    pub fn new(connection_id: &str, transport_type: &str) -> Self {
        Self {
            connection_id: connection_id.to_string(),
            transport_type: transport_type.to_string(),
            client: None,
            connected: false,
            last_used: Utc::now(),
            tools_cache: Vec::new(),
        }
    }

    /// Connect via stdio transport (child process)
    pub async fn connect_stdio(
        &mut self,
        command: &str,
        args: &[String],
        env_vars: Option<&HashMap<String, String>>,
    ) -> Result<(), AppError> {
        let (cmd, fixed_args) = normalize_mcp_command(command, args);
        let fixed_args = fix_stdio_args(&fixed_args);

        // Resolve command to full path (critical on Windows where npx is npx.cmd)
        let resolved_cmd = which::which(&cmd).map_err(|_| {
            AppError::BadRequest(format!(
                "Command '{}' not found in PATH. Make sure it is installed.",
                cmd
            ))
        })?;

        tracing::info!(
            connection_id = %self.connection_id,
            command = %cmd,
            resolved = %resolved_cmd.display(),
            args = ?fixed_args,
            "Connecting MCP session via stdio"
        );

        let env_clone = env_vars.cloned();
        let args_clone = fixed_args.clone();

        let transport = TokioChildProcess::new(
            Command::new(&resolved_cmd).configure(move |c| {
                for arg in &args_clone {
                    c.arg(arg);
                }
                // Inject common Node.js paths into PATH
                if let Ok(current_path) = std::env::var("PATH") {
                    let extra_paths = get_node_paths();
                    if !extra_paths.is_empty() {
                        let separator = if cfg!(windows) { ";" } else { ":" };
                        let new_path = format!(
                            "{}{}{}",
                            extra_paths.join(separator),
                            separator,
                            current_path
                        );
                        c.env("PATH", new_path);
                    }
                }
                // Set user-provided env vars
                if let Some(ref vars) = env_clone {
                    for (k, v) in vars {
                        c.env(k, v);
                    }
                }
            }),
        ).map_err(|e| AppError::Internal(format!("Failed to spawn MCP process: {}", e)))?;

        let service = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            ().serve(transport),
        )
        .await
        .map_err(|_| AppError::Internal(format!(
            "MCP stdio handshake timed out after 30s for '{}'", self.connection_id
        )))?
        .map_err(|e| AppError::Internal(format!("MCP handshake failed: {}", e)))?;

        tracing::info!(
            connection_id = %self.connection_id,
            server_info = ?service.peer_info(),
            "MCP stdio session connected"
        );

        self.client = Some(service);
        self.connected = true;
        self.last_used = Utc::now();
        Ok(())
    }

    /// Connect via streamable HTTP transport
    pub async fn connect_http(
        &mut self,
        base_url: &str,
        api_key: Option<&str>,
    ) -> Result<(), AppError> {
        use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
        use rmcp::transport::StreamableHttpClientTransport;

        tracing::info!(
            connection_id = %self.connection_id,
            base_url = %base_url,
            "Connecting MCP session via HTTP"
        );

        let config = if let Some(key) = api_key {
            StreamableHttpClientTransportConfig::with_uri(base_url)
                .auth_header(format!("Bearer {}", key))
        } else {
            StreamableHttpClientTransportConfig::with_uri(base_url)
        };

        let transport = StreamableHttpClientTransport::from_config(config);

        let service = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            ().serve(transport),
        )
        .await
        .map_err(|_| AppError::Internal(format!(
            "MCP HTTP handshake timed out after 30s for '{}'", self.connection_id
        )))?
        .map_err(|e| AppError::Internal(format!("MCP HTTP handshake failed: {}", e)))?;

        tracing::info!(
            connection_id = %self.connection_id,
            server_info = ?service.peer_info(),
            "MCP HTTP session connected"
        );

        self.client = Some(service);
        self.connected = true;
        self.last_used = Utc::now();
        Ok(())
    }

    /// List tools from the MCP server
    pub async fn list_tools(&mut self, use_cache: bool) -> Result<Vec<MCPToolInfo>, AppError> {
        if use_cache && !self.tools_cache.is_empty() {
            self.last_used = Utc::now();
            return Ok(self.tools_cache.clone());
        }

        let client = self.client.as_ref()
            .ok_or_else(|| AppError::Internal("MCP session not connected".to_string()))?;

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            client.list_tools(Default::default()),
        )
        .await
        .map_err(|_| AppError::Internal("Tool discovery timed out after 30s".to_string()))?
        .map_err(|e| AppError::Internal(format!("Failed to list tools: {}", e)))?;

        let now = Utc::now();
        let tools: Vec<MCPToolInfo> = result.tools.iter().map(|tool| {
            // input_schema is a serde_json::Map<String, Value> (JSON Schema object)
            let schema = &tool.input_schema;
            let properties: HashMap<String, Value> = schema.get("properties")
                .and_then(|v| v.as_object())
                .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                .unwrap_or_default();

            let required: Vec<String> = schema.get("required")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            let input_schema = MCPToolSchema {
                schema_type: "object".to_string(),
                properties,
                required,
            };

            MCPToolInfo {
                name: tool.name.to_string(),
                description: tool.description.as_deref().unwrap_or("").to_string(),
                input_schema,
                discovered_at: Some(now),
            }
        }).collect();

        self.tools_cache = tools.clone();
        self.last_used = Utc::now();
        Ok(tools)
    }

    /// Execute a tool on the MCP server
    pub async fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: Option<serde_json::Map<String, Value>>,
    ) -> Result<Value, AppError> {
        let client = self.client.as_ref()
            .ok_or_else(|| AppError::Internal("MCP session not connected".to_string()))?;

        let start = Instant::now();

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            client.call_tool(CallToolRequestParams {
                meta: None,
                name: Cow::Owned(tool_name.to_string()),
                arguments,
                task: None,
            }),
        )
        .await
        .map_err(|_| AppError::Internal(format!("Tool execution timed out after 120s: {}", tool_name)))?
        .map_err(|e| AppError::Internal(format!("Tool execution failed: {}", e)))?;

        let elapsed = start.elapsed().as_millis() as i64;

        self.last_used = Utc::now();

        // Convert result content to JSON
        // Content in rmcp 0.15 is Annotated<RawContent>; serialize to Value
        let output_parts: Vec<Value> = result.content.iter().map(|content| {
            serde_json::to_value(content).unwrap_or(serde_json::json!({"type": "unknown"}))
        }).collect();

        let is_error = result.is_error.unwrap_or(false);

        Ok(serde_json::json!({
            "content": output_parts,
            "is_error": is_error,
            "execution_time_ms": elapsed,
        }))
    }

    /// Get server capabilities
    pub fn get_capabilities(&self) -> (bool, bool, bool) {
        if let Some(client) = &self.client {
            if let Some(info) = client.peer_info() {
                let caps = &info.capabilities;
                return (
                    caps.tools.is_some(),
                    caps.resources.is_some(),
                    caps.prompts.is_some(),
                );
            }
        }
        (false, false, false)
    }

    /// Cleanup/shutdown the session
    pub async fn cleanup(&mut self) {
        if let Some(client) = self.client.take() {
            if let Err(e) = client.cancel().await {
                tracing::warn!(
                    connection_id = %self.connection_id,
                    error = %e,
                    "Error during MCP session cleanup"
                );
            }
        }
        self.connected = false;
        self.tools_cache.clear();
        tracing::info!(connection_id = %self.connection_id, "MCP session cleaned up");
    }
}

impl Drop for McpSession {
    fn drop(&mut self) {
        if self.connected {
            tracing::warn!(
                connection_id = %self.connection_id,
                "MCP session dropped while still connected"
            );
        }
    }
}

/// Get common Node.js installation paths for the current platform
fn get_node_paths() -> Vec<String> {
    let mut paths = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(pf) = std::env::var("ProgramFiles") {
            paths.push(format!("{}\\nodejs", pf));
        }
        if let Ok(la) = std::env::var("LOCALAPPDATA") {
            paths.push(format!("{}\\Programs\\node", la));
        }
        if let Ok(ad) = std::env::var("APPDATA") {
            paths.push(format!("{}\\npm", ad));
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            paths.push(format!("{}\\.local\\bin", home));
        }
    }

    #[cfg(target_os = "macos")]
    {
        paths.push("/usr/local/bin".to_string());
        paths.push("/opt/homebrew/bin".to_string());
        if let Ok(home) = std::env::var("HOME") {
            // nvm
            paths.push(format!("{}/.nvm/versions/node", home));
            paths.push(format!("{}/.local/bin", home));
        }
    }

    #[cfg(target_os = "linux")]
    {
        paths.push("/usr/local/bin".to_string());
        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.nvm/versions/node", home));
            paths.push(format!("{}/.local/bin", home));
        }
    }

    paths
}
