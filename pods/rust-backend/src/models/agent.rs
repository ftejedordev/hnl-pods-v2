use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentCreate {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub llm_id: Option<String>,
    #[serde(default)]
    pub mcp_connections: Vec<String>,
    #[serde(default)]
    pub rag_documents: Vec<i64>,
    #[serde(default = "default_color")]
    pub color: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentUpdate {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub llm_id: Option<String>,
    #[serde(default)]
    pub mcp_connections: Option<Vec<String>>,
    #[serde(default)]
    pub rag_documents: Option<Vec<i64>>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentResponse {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub llm_id: Option<String>,
    #[serde(default)]
    pub mcp_connections: Vec<String>,
    #[serde(default)]
    pub rag_documents: Vec<i64>,
    #[serde(default = "default_color_string")]
    pub color: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn default_color() -> Option<String> {
    Some("#3B82F6".to_string())
}

fn default_color_string() -> String {
    "#3B82F6".to_string()
}
