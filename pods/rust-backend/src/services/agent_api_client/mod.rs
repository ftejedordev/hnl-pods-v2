pub mod providers;
pub mod tool_executor;
pub mod message_formatter;

use bson::oid::ObjectId;
use mongodb::bson::doc;
use reqwest::Client as HttpClient;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::auth::encryption::{decrypt_api_key, FernetCipher};
use crate::db::collections::*;
use crate::models::llm::LLMProvider;
use crate::models::mcp_tools::MCPToolInfo;
use crate::services::mcp_session_manager::McpSessionManager;

use message_formatter::LLMMessage;
use providers::LLMApiResponse;

/// Main agent API client for orchestrating LLM calls with tool use
pub struct AgentApiClient {
    mongo_client: mongodb::Client,
    cipher: FernetCipher,
    http_client: HttpClient,
    mcp_manager: Arc<McpSessionManager>,
    /// Maps tool names to MCP connection IDs for routing
    pub tool_to_connection_map: HashMap<String, String>,
}

impl AgentApiClient {
    pub fn new(
        mongo_client: mongodb::Client,
        cipher: FernetCipher,
        mcp_manager: Arc<McpSessionManager>,
    ) -> Self {
        Self {
            mongo_client,
            cipher,
            http_client: HttpClient::new(),
            mcp_manager,
            tool_to_connection_map: HashMap::new(),
        }
    }

    fn db(&self) -> mongodb::Database {
        self.mongo_client.database(DB_NAME)
    }

    pub async fn get_agent_by_id(&self, agent_id: &str) -> Option<bson::Document> {
        let collection = self.db().collection::<bson::Document>(AGENTS);
        if let Ok(oid) = ObjectId::parse_str(agent_id) {
            collection.find_one(doc! { "_id": oid }).await.ok().flatten()
        } else {
            collection.find_one(doc! { "_id": agent_id }).await.ok().flatten()
        }
    }

    pub async fn get_llm_by_id(&self, llm_id: &str) -> Option<bson::Document> {
        let collection = self.db().collection::<bson::Document>(LLMS);
        if let Ok(oid) = ObjectId::parse_str(llm_id) {
            collection.find_one(doc! { "_id": oid }).await.ok().flatten()
        } else {
            collection.find_one(doc! { "_id": llm_id }).await.ok().flatten()
        }
    }

    /// Discover tools from all MCP connections for an agent and populate routing map
    pub async fn get_available_tools_for_agent(
        &mut self,
        agent_data: &bson::Document,
    ) -> Vec<MCPToolInfo> {
        self.tool_to_connection_map.clear();
        let mut all_tools = Vec::new();

        let mcp_connections = agent_data.get_array("mcp_connections").ok()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
            .unwrap_or_default();

        let collection = self.db().collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

        for conn_id_str in &mcp_connections {
            // Load connection from DB
            let conn = if let Ok(oid) = ObjectId::parse_str(conn_id_str) {
                collection.find_one(doc! { "_id": oid }).await.ok().flatten()
            } else {
                collection.find_one(doc! { "_id": conn_id_str }).await.ok().flatten()
            };

            let conn = match conn {
                Some(c) => c,
                None => {
                    // Try system default
                    match collection.find_one(doc! { "_id": conn_id_str, "is_default": true }).await.ok().flatten() {
                        Some(c) => c,
                        None => continue,
                    }
                }
            };

            if !conn.get_bool("is_active").unwrap_or(true) {
                continue;
            }

            let transport_type = conn.get_str("transport_type").unwrap_or("http");

            // Ensure session is connected
            let connect_result = match transport_type {
                "stdio" => {
                    let command = conn.get_str("stdio_command").unwrap_or("").to_string();
                    let args: Vec<String> = conn.get_array("stdio_args").ok()
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    self.mcp_manager.get_or_create_stdio(conn_id_str, &command, &args, None).await
                }
                "http" => {
                    let base_url = conn.get_str("base_url").unwrap_or("").to_string();
                    let api_key = conn.get_str("api_key").ok().and_then(|encrypted| {
                        decrypt_api_key(&self.cipher, encrypted).ok()
                    });
                    self.mcp_manager.get_or_create_http(conn_id_str, &base_url, api_key.as_deref()).await
                }
                _ => continue,
            };

            if let Err(e) = connect_result {
                tracing::warn!(connection_id = %conn_id_str, error = %e, "Failed to connect MCP session for tool discovery");
                continue;
            }

            // Discover tools
            match self.mcp_manager.list_tools(conn_id_str, true).await {
                Ok(tools) => {
                    for tool in &tools {
                        self.tool_to_connection_map.insert(tool.name.clone(), conn_id_str.clone());
                    }
                    all_tools.extend(tools);
                }
                Err(e) => {
                    tracing::warn!(connection_id = %conn_id_str, error = %e, "Failed to discover tools");
                }
            }
        }

        all_tools
    }

    /// Main orchestration: execute an agent step with LLM + tool use loop
    pub async fn execute_agent_step(
        &mut self,
        agent_id: &str,
        step_description: &str,
        parameters: &Value,
        conversation_history: Option<Vec<LLMMessage>>,
        mut event_callback: Option<Box<dyn FnMut(&str, Value) + Send>>,
    ) -> Value {
        // Load agent
        let agent_data = match self.get_agent_by_id(agent_id).await {
            Some(a) => a,
            None => return json!({"success": false, "error": format!("Agent {} not found", agent_id)}),
        };

        let agent_name = agent_data.get_str("name").unwrap_or("Unknown").to_string();

        // Load LLM
        let llm_id = agent_data.get_str("llm_id").unwrap_or("").to_string();
        let llm_data = match self.get_llm_by_id(&llm_id).await {
            Some(l) => l,
            None => return json!({"success": false, "error": format!("LLM {} not found", llm_id)}),
        };

        // Discover tools
        let available_tools = self.get_available_tools_for_agent(&agent_data).await;

        // Build messages
        let mut messages = conversation_history.unwrap_or_default();

        // System prompt
        let system_prompt = agent_data.get_str("system_prompt").unwrap_or("").to_string();
        if !system_prompt.is_empty() {
            messages.insert(0, LLMMessage::system(&system_prompt));
        }

        // User message
        let task_content = parameters.get("task")
            .and_then(|v| v.as_str())
            .unwrap_or(step_description);
        messages.push(LLMMessage::user(task_content));

        // Extract LLM config
        let provider_str = llm_data.get_str("provider").unwrap_or("anthropic");
        let config = llm_data.get_document("config").ok().cloned().unwrap_or_default();
        let model_name = config.get_str("model_name").unwrap_or("claude-3-5-sonnet-20241022").to_string();
        let max_tokens = config.get_i64("max_tokens").unwrap_or(4000);
        let temperature = config.get_f64("temperature").unwrap_or(0.7);

        // Decrypt API key
        let api_key = llm_data.get_str("api_key").ok()
            .and_then(|encrypted| decrypt_api_key(&self.cipher, encrypted).ok())
            .unwrap_or_default();

        // Format tools for provider
        let provider = match provider_str {
            "anthropic" => LLMProvider::Anthropic,
            "openai" => LLMProvider::Openai,
            "openrouter" => LLMProvider::Openrouter,
            "custom" => LLMProvider::Custom,
            "claude_cli" => LLMProvider::ClaudeCli,
            _ => LLMProvider::Anthropic,
        };

        let tools_formatted = match provider {
            LLMProvider::Anthropic => providers::anthropic::format_tools(&available_tools),
            _ => providers::openai::format_tools(&available_tools),
        };

        let tools_ref: Option<&[Value]> = if tools_formatted.is_empty() {
            None
        } else {
            Some(&tools_formatted)
        };

        // Initial LLM call
        let mut current_response = self.call_llm(
            &provider, &api_key, &model_name, &messages, max_tokens, temperature,
            tools_ref, &config, &mut event_callback,
        ).await;

        if !current_response.success {
            return json!({
                "success": false,
                "error": current_response.error.unwrap_or_else(|| "LLM call failed".into()),
                "agent_id": agent_id,
                "agent_name": agent_name,
            });
        }

        // Emit initial response event
        if let Some(ref mut cb) = event_callback {
            cb("LLM_RESPONSE", json!({
                "content": current_response.content,
                "model": current_response.model_used,
                "agent_name": agent_name,
                "has_tool_calls": current_response.tool_calls.is_some(),
            }));
        }

        // Multi-round tool execution loop
        let max_tool_rounds = 20;
        let mut round_count = 0;
        let mut all_tool_results: Vec<Value> = Vec::new();

        while current_response.tool_calls.is_some() && round_count < max_tool_rounds {
            round_count += 1;

            let tool_calls = current_response.tool_calls.clone().unwrap_or_default();

            // Add assistant message with tool calls
            messages.push(LLMMessage::assistant(
                &current_response.content,
                Some(tool_calls.clone()),
            ));

            // Execute each tool call
            let mut round_tool_results = Vec::new();

            for (_i, tool_call) in tool_calls.iter().enumerate() {
                let tool_name = tool_call.get("function")
                    .and_then(|f| f.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                if let Some(ref mut cb) = event_callback {
                    cb("TOOL_CALL_STARTED", json!({
                        "tool_name": tool_name,
                        "round": round_count,
                        "agent_name": agent_name,
                    }));
                }

                let result = tool_executor::execute_tool_call(
                    &self.mcp_manager,
                    &self.tool_to_connection_map,
                    tool_call,
                ).await;

                if let Some(ref mut cb) = event_callback {
                    cb("TOOL_CALL_COMPLETED", json!({
                        "tool_name": tool_name,
                        "success": result.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
                        "round": round_count,
                    }));
                }

                round_tool_results.push(result.clone());
                all_tool_results.push(result);
            }

            // Add tool results as messages
            for (i, tool_result) in round_tool_results.iter().enumerate() {
                let tool_content = tool_executor::extract_tool_result_text(tool_result);
                let tool_call_id = tool_calls.get(i)
                    .and_then(|tc| tc.get("id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                messages.push(LLMMessage::tool(&tool_content, tool_call_id));
            }

            // Follow-up LLM call
            current_response = self.call_llm(
                &provider, &api_key, &model_name, &messages, max_tokens, temperature,
                tools_ref, &config, &mut event_callback,
            ).await;

            if !current_response.success {
                tracing::error!(agent_id = %agent_id, round = round_count, "LLM call failed in tool loop");
                break;
            }

            if let Some(ref mut cb) = event_callback {
                cb("LLM_RESPONSE", json!({
                    "content": current_response.content,
                    "model": current_response.model_used,
                    "agent_name": agent_name,
                    "round": round_count,
                    "has_tool_calls": current_response.tool_calls.is_some(),
                }));
            }
        }

        if round_count >= max_tool_rounds && current_response.tool_calls.is_some() {
            tracing::warn!(agent_id = %agent_id, "Reached max tool rounds ({})", max_tool_rounds);
        }

        json!({
            "success": true,
            "content": current_response.content,
            "model_used": current_response.model_used,
            "tool_results": all_tool_results,
            "tool_rounds": round_count,
            "agent_id": agent_id,
            "agent_name": agent_name,
        })
    }

    /// Dispatch LLM call to the correct provider
    async fn call_llm(
        &self,
        provider: &LLMProvider,
        api_key: &str,
        model: &str,
        messages: &[LLMMessage],
        max_tokens: i64,
        temperature: f64,
        tools: Option<&[Value]>,
        config: &bson::Document,
        event_callback: &mut Option<Box<dyn FnMut(&str, Value) + Send>>,
    ) -> LLMApiResponse {
        // Create a stream callback that emits events
        let _stream_cb: Option<Box<dyn FnMut(&str) + Send>> = if event_callback.is_some() {
            // We can't easily pass the event_callback through due to borrow checker,
            // so we collect chunks and emit them after the call.
            // For true streaming, this would need channels.
            None
        } else {
            None
        };

        match provider {
            LLMProvider::Anthropic => {
                let anthropic_version = config.get_str("anthropic_version").unwrap_or("2023-06-01");
                providers::anthropic::call_streaming(
                    &self.http_client,
                    api_key,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    anthropic_version,
                    None, // TODO: wire stream callback with channels for true streaming
                ).await
            }
            LLMProvider::Openai => {
                let org_id = config.get_str("organization_id").ok();
                providers::openai::call_streaming(
                    &self.http_client,
                    api_key,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    org_id,
                    None,
                ).await
            }
            LLMProvider::Openrouter => {
                let site_url = config.get_str("site_url").ok();
                let app_name = config.get_str("app_name").ok();
                providers::openrouter::call_streaming(
                    &self.http_client,
                    api_key,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    site_url,
                    app_name,
                    None,
                ).await
            }
            LLMProvider::Custom => {
                let base_url = config.get_str("base_url").unwrap_or("http://localhost:11434");
                let key = if api_key.is_empty() { None } else { Some(api_key) };
                providers::custom::call_streaming(
                    &self.http_client,
                    base_url,
                    key,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    None,
                ).await
            }
            LLMProvider::ClaudeCli => {
                providers::claude_cli::call_streaming(model, messages, None).await
            }
        }
    }
}
