use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FlowStepType {
    Llm,
    Tool,
    Condition,
    Parallel,
    Webhook,
    FeedbackLoop,
    QualityCheck,
    Approval,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FlowStepStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FlowExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOverride {
    #[serde(default)]
    pub llm_id: Option<String>,
    #[serde(default)]
    pub mcp_connections: Option<Vec<String>>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeMetadata {
    pub edge_id: String,
    pub source_step_id: String,
    pub target_step_id: String,
    #[serde(default)]
    pub is_feedback_loop: bool,
    #[serde(default = "default_max_iterations")]
    pub max_iterations: Option<i32>,
    #[serde(default = "default_quality_threshold")]
    pub quality_threshold: Option<f64>,
    #[serde(default)]
    pub convergence_criteria: Option<String>,
    #[serde(default)]
    pub current_iteration: i32,
    #[serde(default)]
    pub feedback_history: Vec<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub quality_scores: Vec<f64>,
}

fn default_max_iterations() -> Option<i32> { Some(25) }
fn default_quality_threshold() -> Option<f64> { Some(0.8) }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowStep {
    pub id: String,
    #[serde(default)]
    pub agent_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "type", default = "default_step_type")]
    pub step_type: FlowStepType,
    #[serde(default)]
    pub parameters: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub next_steps: Vec<String>,
    #[serde(default)]
    pub condition: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_seconds: Option<i32>,
    #[serde(default)]
    pub retry_count: i32,
    #[serde(default)]
    pub position: HashMap<String, f64>,
    #[serde(default)]
    pub agent_overrides: Option<AgentOverride>,
}

fn default_step_type() -> FlowStepType { FlowStepType::Llm }
fn default_timeout() -> Option<i32> { Some(300) }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowStepResult {
    pub step_id: String,
    pub status: FlowStepStatus,
    #[serde(default)]
    pub result: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub execution_time_ms: Option<i64>,
    #[serde(default)]
    pub retry_attempt: i32,
    #[serde(default)]
    pub agent_output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flow {
    #[serde(default)]
    pub id: Option<String>,
    pub user_id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub steps: Vec<FlowStep>,
    pub start_step_id: String,
    #[serde(default)]
    pub variables: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub edge_metadata: HashMap<String, EdgeMetadata>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct FlowExecution {
    #[serde(default)]
    pub id: Option<String>,
    pub flow_id: String,
    pub user_id: String,
    #[serde(default = "default_pending")]
    pub status: FlowExecutionStatus,
    #[serde(default)]
    pub input_data: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub current_step_id: Option<String>,
    #[serde(default)]
    pub completed_steps: Vec<String>,
    #[serde(default)]
    pub failed_steps: Vec<String>,
    #[serde(default)]
    pub step_results: HashMap<String, FlowStepResult>,
    #[serde(default)]
    pub variables: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub execution_time_ms: Option<i64>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub edge_states: HashMap<String, EdgeMetadata>,
    #[serde(default = "default_max_loop")]
    pub max_loop_iteration_count: i32,
    #[serde(default)]
    pub is_cancellation_requested: bool,
    #[serde(default)]
    pub pending_approval_step_id: Option<String>,
    #[serde(default)]
    pub approval_decision: Option<bool>,
}

#[allow(dead_code)]
fn default_pending() -> FlowExecutionStatus { FlowExecutionStatus::Pending }
#[allow(dead_code)]
fn default_max_loop() -> i32 { 25 }

// API Request/Response models

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowCreate {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub steps: Vec<FlowStep>,
    pub start_step_id: String,
    #[serde(default)]
    pub variables: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub edge_metadata: HashMap<String, EdgeMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowUpdate {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub steps: Option<Vec<FlowStep>>,
    #[serde(default)]
    pub start_step_id: Option<String>,
    #[serde(default)]
    pub variables: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub edge_metadata: Option<HashMap<String, EdgeMetadata>>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowResponse {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub steps: Vec<FlowStep>,
    pub start_step_id: String,
    #[serde(default)]
    pub variables: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub edge_metadata: HashMap<String, EdgeMetadata>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowExecutionCreate {
    #[serde(default)]
    pub flow_id: Option<String>,
    #[serde(default)]
    pub input_data: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub variables: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowExecutionResponse {
    pub id: String,
    pub flow_id: String,
    pub user_id: String,
    pub status: FlowExecutionStatus,
    #[serde(default)]
    pub input_data: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub current_step_id: Option<String>,
    #[serde(default)]
    pub completed_steps: Vec<String>,
    #[serde(default)]
    pub failed_steps: Vec<String>,
    #[serde(default)]
    pub step_results: HashMap<String, FlowStepResult>,
    #[serde(default)]
    pub variables: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub execution_time_ms: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowExecutionListResponse {
    pub executions: Vec<FlowExecutionResponse>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}
