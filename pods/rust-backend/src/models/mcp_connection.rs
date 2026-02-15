use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerConnectionCreate {
    pub name: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default = "default_transport")]
    pub transport_type: String,
    #[serde(default)]
    pub stdio_command: Option<String>,
    #[serde(default)]
    pub stdio_args: Option<Vec<String>>,
    #[serde(default)]
    pub sse_url: Option<String>,
    #[serde(default)]
    pub sse_headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub env_vars: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerConnectionUpdate {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_active: Option<bool>,
    #[serde(default)]
    pub transport_type: Option<String>,
    #[serde(default)]
    pub stdio_command: Option<String>,
    #[serde(default)]
    pub stdio_args: Option<Vec<String>>,
    #[serde(default)]
    pub sse_url: Option<String>,
    #[serde(default)]
    pub sse_headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub env_vars: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerConnectionResponse {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default = "default_transport")]
    pub transport_type: String,
    #[serde(default)]
    pub stdio_command: Option<String>,
    #[serde(default)]
    pub stdio_args: Option<Vec<String>>,
    #[serde(default)]
    pub sse_url: Option<String>,
    #[serde(default)]
    pub sse_headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub env_vars: Option<HashMap<String, String>>,
    #[serde(default)]
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectivityTestResult {
    pub status: String,
    #[serde(default)]
    pub response_time_ms: Option<i64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub server_info: Option<serde_json::Value>,
}

fn default_true() -> bool { true }
fn default_transport() -> String { "http".to_string() }
