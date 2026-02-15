use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatAgent {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub color: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    pub has_llm: bool,
    pub has_mcp_connections: bool,
    #[serde(default)]
    pub llm_provider: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatAgentListResponse {
    pub agents: Vec<ChatAgent>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub user_id: String,
    pub agent_id: String,
    pub agent_name: String,
    #[serde(default)]
    pub title: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub message_count: i64,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSessionCreate {
    pub agent_id: String,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSessionListResponse {
    pub sessions: Vec<ChatSession>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    #[serde(default)]
    pub tool_calls: Option<Vec<HashMap<String, serde_json::Value>>>,
    #[serde(default)]
    pub tool_results: Option<Vec<HashMap<String, serde_json::Value>>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessageCreate {
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessagesResponse {
    pub messages: Vec<ChatMessage>,
    pub total: i64,
    #[serde(default)]
    pub skip: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_true() -> bool { true }
fn default_limit() -> i64 { 50 }
