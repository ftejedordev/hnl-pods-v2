use serde_json::{json, Value};

/// A message in the LLM conversation
#[derive(Debug, Clone)]
pub struct LLMMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<Value>>,
    pub tool_call_id: Option<String>,
}

impl LLMMessage {
    pub fn system(content: &str) -> Self {
        Self { role: "system".into(), content: content.into(), tool_calls: None, tool_call_id: None }
    }
    pub fn user(content: &str) -> Self {
        Self { role: "user".into(), content: content.into(), tool_calls: None, tool_call_id: None }
    }
    pub fn assistant(content: &str, tool_calls: Option<Vec<Value>>) -> Self {
        Self { role: "assistant".into(), content: content.into(), tool_calls, tool_call_id: None }
    }
    pub fn tool(content: &str, tool_call_id: &str) -> Self {
        Self { role: "tool".into(), content: content.into(), tool_calls: None, tool_call_id: Some(tool_call_id.into()) }
    }
}

/// Format messages for Anthropic API
/// Anthropic requires system message separate from messages list
pub fn format_for_anthropic(messages: &[LLMMessage]) -> (Option<String>, Vec<Value>) {
    let mut system_prompt = None;
    let mut formatted = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            system_prompt = Some(msg.content.clone());
            continue;
        }

        if msg.role == "assistant" {
            let mut content_blocks: Vec<Value> = Vec::new();
            if !msg.content.is_empty() {
                content_blocks.push(json!({"type": "text", "text": msg.content}));
            }
            if let Some(ref tool_calls) = msg.tool_calls {
                for tc in tool_calls {
                    if let (Some(id), Some(name)) = (
                        tc.get("id").and_then(|v| v.as_str()),
                        tc.get("function").and_then(|f| f.get("name")).and_then(|v| v.as_str()),
                    ) {
                        let input = tc.get("function")
                            .and_then(|f| f.get("arguments"))
                            .cloned()
                            .unwrap_or(json!({}));
                        content_blocks.push(json!({
                            "type": "tool_use",
                            "id": id,
                            "name": name,
                            "input": input,
                        }));
                    }
                }
            }
            formatted.push(json!({"role": "assistant", "content": content_blocks}));
        } else if msg.role == "tool" {
            formatted.push(json!({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": msg.tool_call_id.as_deref().unwrap_or(""),
                    "content": msg.content,
                }]
            }));
        } else {
            formatted.push(json!({"role": msg.role, "content": msg.content}));
        }
    }

    (system_prompt, formatted)
}

/// Format messages for OpenAI-compatible APIs (OpenAI, OpenRouter, Custom)
pub fn format_for_openai(messages: &[LLMMessage], is_xai: bool) -> Vec<Value> {
    let mut formatted: Vec<Value> = Vec::new();
    let mut i = 0;

    while i < messages.len() {
        let msg = &messages[i];

        if msg.role == "assistant" {
            let mut assistant_msg = json!({
                "role": "assistant",
                "content": if msg.content.is_empty() { Value::Null } else { json!(msg.content) },
            });

            if let Some(ref tool_calls) = msg.tool_calls {
                let formatted_tcs: Vec<Value> = tool_calls.iter().map(|tc| {
                    let args = tc.get("function")
                        .and_then(|f| f.get("arguments"))
                        .cloned()
                        .unwrap_or(json!({}));
                    let args_str = if args.is_string() {
                        args.as_str().unwrap_or("{}").to_string()
                    } else {
                        serde_json::to_string(&args).unwrap_or_else(|_| "{}".to_string())
                    };
                    json!({
                        "id": tc.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                        "type": "function",
                        "function": {
                            "name": tc.get("function").and_then(|f| f.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
                            "arguments": args_str,
                        }
                    })
                }).collect();
                assistant_msg["tool_calls"] = json!(formatted_tcs);
            }

            formatted.push(assistant_msg);
        } else if msg.role == "tool" {
            if is_xai {
                // xAI doesn't support "tool" role - combine consecutive tool results
                let mut tool_results = Vec::new();
                while i < messages.len() && messages[i].role == "tool" {
                    tool_results.push(messages[i].content.clone());
                    i += 1;
                }
                let combined = format!("Tool results:\n{}", tool_results.join("\n---\n"));
                formatted.push(json!({"role": "user", "content": combined}));
                continue;
            } else {
                formatted.push(json!({
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": msg.tool_call_id.as_deref().unwrap_or(""),
                }));
            }
        } else {
            formatted.push(json!({"role": msg.role, "content": msg.content}));
        }

        i += 1;
    }

    formatted
}

/// Format MCP tools to OpenAI tool format
pub fn format_tools_openai(tools: &[crate::models::mcp_tools::MCPToolInfo]) -> Vec<Value> {
    tools.iter().map(|tool| {
        json!({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": {
                    "type": "object",
                    "properties": tool.input_schema.properties,
                    "required": tool.input_schema.required,
                }
            }
        })
    }).collect()
}

/// Format MCP tools to Anthropic tool format
pub fn format_tools_anthropic(tools: &[crate::models::mcp_tools::MCPToolInfo]) -> Vec<Value> {
    tools.iter().map(|tool| {
        json!({
            "name": tool.name,
            "description": tool.description,
            "input_schema": {
                "type": "object",
                "properties": tool.input_schema.properties,
                "required": tool.input_schema.required,
            }
        })
    }).collect()
}
