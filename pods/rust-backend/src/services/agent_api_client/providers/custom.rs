use reqwest::Client;
use serde_json::Value;

use super::LLMApiResponse;
use crate::services::agent_api_client::message_formatter::LLMMessage;
use crate::services::agent_api_client::providers::openai;

pub async fn call_streaming(
    http_client: &Client,
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    messages: &[LLMMessage],
    max_tokens: i64,
    temperature: f64,
    tools: Option<&[Value]>,
    stream_callback: Option<&mut (dyn FnMut(&str) + Send)>,
) -> LLMApiResponse {
    let endpoint = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));

    openai::call_openai_compatible(
        http_client,
        &endpoint,
        api_key.unwrap_or(""),
        model,
        messages,
        max_tokens,
        temperature,
        tools,
        None,
        None,
        None,
        false,
        stream_callback,
    ).await
}
