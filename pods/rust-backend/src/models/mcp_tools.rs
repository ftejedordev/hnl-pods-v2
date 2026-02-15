use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct MCPToolParameter {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPToolSchema {
    #[serde(rename = "type", default = "default_object")]
    pub schema_type: String,
    #[serde(default)]
    pub properties: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub required: Vec<String>,
}

impl Default for MCPToolSchema {
    fn default() -> Self {
        Self {
            schema_type: "object".to_string(),
            properties: HashMap::new(),
            required: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: MCPToolSchema,
    #[serde(default)]
    pub discovered_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPToolsListResponse {
    pub connection_id: String,
    pub connection_name: String,
    pub tools: Vec<MCPToolInfo>,
    #[serde(default)]
    pub last_discovery: Option<DateTime<Utc>>,
    pub total_tools: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPToolExecuteRequest {
    pub tool_name: String,
    #[serde(default)]
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPToolExecuteResponse {
    pub success: bool,
    #[serde(default)]
    pub result: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub execution_time_ms: Option<i64>,
    pub tool_name: String,
    pub connection_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPConnectionStatus {
    pub connection_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub transport_type: String,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub is_connected: bool,
    #[serde(default)]
    pub last_activity: Option<DateTime<Utc>>,
    #[serde(default)]
    pub tools_count: i64,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPServerCapabilities {
    pub connection_id: String,
    pub connection_name: String,
    pub supports_tools: bool,
    pub supports_resources: bool,
    pub supports_prompts: bool,
    pub total_tools: i64,
    #[serde(default)]
    pub available_endpoints: Vec<String>,
    #[serde(default)]
    pub last_discovery: Option<DateTime<Utc>>,
}

#[allow(dead_code)]
fn default_true() -> bool { true }
fn default_object() -> String { "object".to_string() }
