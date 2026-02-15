use reqwest::Client;
use serde_json::Value;

use super::LLMApiResponse;
use crate::services::agent_api_client::message_formatter::LLMMessage;
use crate::services::agent_api_client::providers::openai;

const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

pub async fn call_streaming(
    http_client: &Client,
    api_key: &str,
    model: &str,
    messages: &[LLMMessage],
    max_tokens: i64,
    temperature: f64,
    tools: Option<&[Value]>,
    site_url: Option<&str>,
    app_name: Option<&str>,
    stream_callback: Option<&mut (dyn FnMut(&str) + Send)>,
) -> LLMApiResponse {
    let is_xai = model.starts_with("x-ai/");

    openai::call_openai_compatible(
        http_client,
        OPENROUTER_API_URL,
        api_key,
        model,
        messages,
        max_tokens,
        temperature,
        tools,
        None,
        site_url,
        app_name,
        is_xai,
        stream_callback,
    ).await
}
