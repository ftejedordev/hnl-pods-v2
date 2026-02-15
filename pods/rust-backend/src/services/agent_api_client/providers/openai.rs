use reqwest::Client;
use serde_json::{json, Value};
use std::time::Instant;

use super::LLMApiResponse;
use crate::services::agent_api_client::message_formatter::{LLMMessage, format_for_openai, format_tools_openai};

const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";

pub async fn call_streaming(
    http_client: &Client,
    api_key: &str,
    model: &str,
    messages: &[LLMMessage],
    max_tokens: i64,
    temperature: f64,
    tools: Option<&[Value]>,
    organization_id: Option<&str>,
    stream_callback: Option<&mut (dyn FnMut(&str) + Send)>,
) -> LLMApiResponse {
    call_openai_compatible(
        http_client,
        OPENAI_API_URL,
        api_key,
        model,
        messages,
        max_tokens,
        temperature,
        tools,
        organization_id,
        None,
        None,
        false,
        stream_callback,
    ).await
}

/// Generic OpenAI-compatible streaming call (used by OpenAI, OpenRouter, Custom)
pub async fn call_openai_compatible(
    http_client: &Client,
    endpoint: &str,
    api_key: &str,
    model: &str,
    messages: &[LLMMessage],
    max_tokens: i64,
    temperature: f64,
    tools: Option<&[Value]>,
    organization_id: Option<&str>,
    http_referer: Option<&str>,
    x_title: Option<&str>,
    is_xai: bool,
    mut stream_callback: Option<&mut (dyn FnMut(&str) + Send)>,
) -> LLMApiResponse {
    let start = Instant::now();

    let formatted_messages = format_for_openai(messages, is_xai);

    let mut payload = json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": formatted_messages,
        "stream": true,
    });

    if let Some(t) = tools {
        if !t.is_empty() {
            payload["tools"] = json!(t);
            payload["tool_choice"] = json!("auto");
        }
    }

    let mut request = http_client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key));

    if let Some(org) = organization_id {
        request = request.header("OpenAI-Organization", org);
    }
    if let Some(referer) = http_referer {
        request = request.header("HTTP-Referer", referer);
    }
    if let Some(title) = x_title {
        request = request.header("X-Title", title);
    }

    let response = match request.json(&payload).send().await {
        Ok(r) => r,
        Err(e) => return LLMApiResponse::error(&format!("HTTP request failed: {}", e), start.elapsed().as_millis() as i64),
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return LLMApiResponse::error(
            &format!("API error {}: {}", status, body),
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

        if let Some(m) = chunk.get("model").and_then(|v| v.as_str()) {
            model_used = Some(m.to_string());
        }

        if let Some(choices) = chunk.get("choices").and_then(|v| v.as_array()) {
            if let Some(choice) = choices.first() {
                if let Some(delta) = choice.get("delta") {
                    // Content delta
                    if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                        full_content.push_str(content);
                        if let Some(ref mut cb) = stream_callback {
                            cb(content);
                        }
                    }

                    // Tool calls delta
                    if let Some(tcs) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                        for tc_delta in tcs {
                            let index = tc_delta.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                            // Ensure tool_calls list has enough slots
                            while tool_calls.len() <= index {
                                tool_calls.push(json!({
                                    "id": null,
                                    "type": "function",
                                    "function": {
                                        "name": null,
                                        "arguments": ""
                                    }
                                }));
                            }

                            if let Some(id) = tc_delta.get("id").and_then(|v| v.as_str()) {
                                tool_calls[index]["id"] = json!(id);
                            }

                            if let Some(func) = tc_delta.get("function") {
                                if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                                    tool_calls[index]["function"]["name"] = json!(name);
                                }
                                if let Some(args) = func.get("arguments").and_then(|v| v.as_str()) {
                                    let existing = tool_calls[index]["function"]["arguments"]
                                        .as_str()
                                        .unwrap_or("");
                                    tool_calls[index]["function"]["arguments"] = json!(format!("{}{}", existing, args));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Parse accumulated arguments from JSON strings
    for tc in &mut tool_calls {
        if let Some(func) = tc.get_mut("function") {
            if let Some(args_str) = func.get("arguments").and_then(|v| v.as_str()) {
                if let Ok(parsed) = serde_json::from_str::<Value>(args_str) {
                    func["arguments"] = parsed;
                }
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

pub fn format_tools(tools: &[crate::models::mcp_tools::MCPToolInfo]) -> Vec<Value> {
    format_tools_openai(tools)
}
