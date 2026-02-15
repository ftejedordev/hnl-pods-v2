use reqwest::Client;
use serde_json::{json, Value};
use std::time::Instant;

use super::LLMApiResponse;
use crate::services::agent_api_client::message_formatter::{LLMMessage, format_for_anthropic, format_tools_anthropic};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";

pub async fn call_streaming(
    http_client: &Client,
    api_key: &str,
    model: &str,
    messages: &[LLMMessage],
    max_tokens: i64,
    temperature: f64,
    tools: Option<&[Value]>,
    anthropic_version: &str,
    mut stream_callback: Option<&mut (dyn FnMut(&str) + Send)>,
) -> LLMApiResponse {
    let start = Instant::now();

    let (system_prompt, formatted_messages) = format_for_anthropic(messages);

    let mut payload = json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": formatted_messages,
        "stream": true,
    });

    if let Some(sp) = &system_prompt {
        payload["system"] = json!(sp);
    }
    if let Some(t) = tools {
        if !t.is_empty() {
            payload["tools"] = json!(t);
        }
    }

    let response = match http_client
        .post(ANTHROPIC_API_URL)
        .header("Content-Type", "application/json")
        .header("x-api-key", api_key)
        .header("anthropic-version", anthropic_version)
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return LLMApiResponse::error(&format!("HTTP request failed: {}", e), start.elapsed().as_millis() as i64),
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return LLMApiResponse::error(
            &format!("Anthropic API error {}: {}", status, body),
            start.elapsed().as_millis() as i64,
        );
    }

    // Parse SSE stream
    let mut full_content = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();
    let mut model_used = None;

    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => return LLMApiResponse::error(&format!("Failed to read response: {}", e), start.elapsed().as_millis() as i64),
    };

    let text = String::from_utf8_lossy(&bytes);

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if !line.starts_with("data: ") {
            continue;
        }
        let data = &line[6..];
        if data == "[DONE]" {
            break;
        }

        let chunk: Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let chunk_type = chunk.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if let Some(m) = chunk.get("message").and_then(|m| m.get("model")).and_then(|v| v.as_str()) {
            model_used = Some(m.to_string());
        }

        match chunk_type {
            "content_block_start" => {
                if let Some(cb) = chunk.get("content_block") {
                    if cb.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                        tool_calls.push(json!({
                            "id": cb.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                            "type": "function",
                            "function": {
                                "name": cb.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                                "arguments": {},
                                "_partial": "",
                            }
                        }));
                    }
                }
            }
            "content_block_delta" => {
                if let Some(delta) = chunk.get("delta") {
                    let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    match delta_type {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                                full_content.push_str(text);
                                if let Some(ref mut cb) = stream_callback {
                                    cb(text);
                                }
                            }
                        }
                        "input_json_delta" => {
                            if let Some(partial) = delta.get("partial_json").and_then(|v| v.as_str()) {
                                if let Some(last_tc) = tool_calls.last_mut() {
                                    if let Some(func) = last_tc.get_mut("function") {
                                        let existing = func.get("_partial")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        func["_partial"] = json!(format!("{}{}", existing, partial));
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    // Parse accumulated tool arguments
    for tc in &mut tool_calls {
        if let Some(func) = tc.get_mut("function") {
            if let Some(partial) = func.get("_partial").and_then(|v| v.as_str()) {
                if !partial.is_empty() {
                    if let Ok(parsed) = serde_json::from_str::<Value>(partial) {
                        func["arguments"] = parsed;
                    }
                }
            }
            // Remove temporary field
            if let Some(obj) = func.as_object_mut() {
                obj.remove("_partial");
            }
        }
    }

    let latency = start.elapsed().as_millis() as i64;

    LLMApiResponse {
        success: true,
        content: full_content,
        tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
        model_used,
        usage: None,
        error: None,
        latency_ms: latency,
    }
}

/// Convert MCP tools to Anthropic format
pub fn format_tools(tools: &[crate::models::mcp_tools::MCPToolInfo]) -> Vec<Value> {
    format_tools_anthropic(tools)
}
