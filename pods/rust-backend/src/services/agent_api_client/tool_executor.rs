use serde_json::{json, Value};
use std::collections::HashMap;

use crate::services::mcp_session_manager::McpSessionManager;

/// Execute a tool call by routing to the correct MCP session
pub async fn execute_tool_call(
    mcp_manager: &McpSessionManager,
    tool_to_connection_map: &HashMap<String, String>,
    tool_call: &Value,
) -> Value {
    let function_name = tool_call
        .get("function")
        .and_then(|f| f.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let function_args = tool_call
        .get("function")
        .and_then(|f| f.get("arguments"))
        .cloned()
        .unwrap_or(json!({}));

    // Parse args if they're a JSON string
    let args_map: Option<serde_json::Map<String, Value>> = if function_args.is_string() {
        serde_json::from_str(function_args.as_str().unwrap_or("{}")).ok()
    } else if function_args.is_object() {
        function_args.as_object().cloned()
    } else {
        None
    };

    // Route to the correct MCP connection
    let connection_id = match tool_to_connection_map.get(function_name) {
        Some(id) => id.clone(),
        None => {
            return json!({
                "tool_name": function_name,
                "arguments": function_args,
                "success": false,
                "error": format!("No MCP connection found for tool '{}'", function_name),
            });
        }
    };

    match mcp_manager.call_tool(&connection_id, function_name, args_map).await {
        Ok(result) => {
            json!({
                "tool_name": function_name,
                "arguments": function_args,
                "result": result.get("content").cloned().unwrap_or(json!([])),
                "connection_id": connection_id,
                "success": true,
            })
        }
        Err(e) => {
            json!({
                "tool_name": function_name,
                "arguments": function_args,
                "success": false,
                "error": format!("Tool execution failed: {}", e),
                "connection_id": connection_id,
            })
        }
    }
}

/// Extract text content from a tool result for feeding back to the LLM
pub fn extract_tool_result_text(tool_result: &Value) -> String {
    if let Some(true) = tool_result.get("success").and_then(|v| v.as_bool()) {
        if let Some(result_data) = tool_result.get("result") {
            if let Some(arr) = result_data.as_array() {
                if let Some(first) = arr.first() {
                    if first.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(text) = first.get("text").and_then(|v| v.as_str()) {
                            return text.to_string();
                        }
                    }
                }
                return serde_json::to_string(result_data).unwrap_or_default();
            }
            return serde_json::to_string(result_data).unwrap_or_default();
        }
    }
    // Include error info
    serde_json::to_string(tool_result).unwrap_or_default()
}
