use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LLMProvider {
    Anthropic,
    Openai,
    Openrouter,
    Custom,
    ClaudeCli,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LLMStatus {
    Active,
    Inactive,
    Error,
    Testing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    #[serde(default)]
    pub model_name: Option<String>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: Option<i64>,
    #[serde(default = "default_temperature")]
    pub temperature: Option<f64>,
    #[serde(default = "default_anthropic_version")]
    pub anthropic_version: Option<String>,
    #[serde(default)]
    pub organization_id: Option<String>,
    #[serde(default)]
    pub site_url: Option<String>,
    #[serde(default)]
    pub app_name: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    #[serde(default = "default_true")]
    pub verify_ssl: bool,
    #[serde(default)]
    pub available_models: Option<Vec<String>>,
}

impl Default for LLMConfig {
    fn default() -> Self {
        Self {
            model_name: None,
            max_tokens: Some(4096),
            temperature: Some(0.7),
            anthropic_version: Some("2023-06-01".to_string()),
            organization_id: None,
            site_url: None,
            app_name: None,
            base_url: None,
            headers: None,
            verify_ssl: true,
            available_models: None,
        }
    }
}

fn default_max_tokens() -> Option<i64> { Some(4096) }
fn default_temperature() -> Option<f64> { Some(0.7) }
fn default_anthropic_version() -> Option<String> { Some("2023-06-01".to_string()) }
fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMUsageStats {
    #[serde(default)]
    pub total_requests: i64,
    #[serde(default)]
    pub total_tokens: i64,
    #[serde(default)]
    pub total_cost: f64,
    #[serde(default)]
    pub last_used: Option<DateTime<Utc>>,
    #[serde(default)]
    pub requests_this_month: i64,
    #[serde(default)]
    pub tokens_this_month: i64,
    #[serde(default)]
    pub cost_this_month: f64,
}

impl Default for LLMUsageStats {
    fn default() -> Self {
        Self {
            total_requests: 0,
            total_tokens: 0,
            total_cost: 0.0,
            last_used: None,
            requests_this_month: 0,
            tokens_this_month: 0,
            cost_this_month: 0.0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMCreate {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub provider: LLMProvider,
    pub api_key: String,
    #[serde(default)]
    pub config: Option<LLMConfig>,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMUpdate {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub config: Option<LLMConfig>,
    #[serde(default)]
    pub status: Option<LLMStatus>,
    #[serde(default)]
    pub is_default: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMResponse {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub provider: LLMProvider,
    pub config: LLMConfig,
    pub status: LLMStatus,
    pub usage_stats: LLMUsageStats,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub last_tested: Option<DateTime<Utc>>,
    #[serde(default)]
    pub test_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct LLMListResponse {
    pub llms: Vec<LLMResponse>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMTestRequest {
    #[serde(default = "default_test_prompt")]
    pub test_prompt: Option<String>,
}

fn default_test_prompt() -> Option<String> {
    Some("Hello, this is a test.".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMTestResponse {
    pub success: bool,
    #[serde(default)]
    pub response_text: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub latency_ms: Option<i64>,
    #[serde(default)]
    pub model_used: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMProviderInfo {
    pub provider: LLMProvider,
    pub name: String,
    pub description: String,
    pub documentation_url: String,
    pub api_key_url: String,
    pub required_fields: Vec<String>,
    pub optional_fields: Vec<String>,
    #[serde(default)]
    pub supported_models: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMProvidersResponse {
    pub providers: Vec<LLMProviderInfo>,
}
