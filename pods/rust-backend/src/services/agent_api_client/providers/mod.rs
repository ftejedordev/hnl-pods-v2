pub mod anthropic;
pub mod openai;
pub mod openrouter;
pub mod custom;
pub mod claude_cli;

use serde_json::Value;

/// Response from an LLM API call
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct LLMApiResponse {
    pub success: bool,
    pub content: String,
    pub tool_calls: Option<Vec<Value>>,
    pub model_used: Option<String>,
    pub usage: Option<Value>,
    pub error: Option<String>,
    pub latency_ms: i64,
}

impl LLMApiResponse {
    pub fn error(msg: &str, latency_ms: i64) -> Self {
        Self {
            success: false,
            content: String::new(),
            tool_calls: None,
            model_used: None,
            usage: None,
            error: Some(msg.to_string()),
            latency_ms,
        }
    }
}
