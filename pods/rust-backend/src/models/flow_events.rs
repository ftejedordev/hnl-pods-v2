use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FlowEventType {
    ExecutionStarted,
    ExecutionCompleted,
    ExecutionFailed,
    ExecutionCancelled,
    StepStarted,
    StepCompleted,
    StepFailed,
    StepSkipped,
    StepProgress,
    ConnectionEstablished,
    Heartbeat,
    // Agent-level progress events
    LlmResponse,
    LlmStreamingChunk,
    ToolCallStarted,
    ToolCallCompleted,
    // Feedback loop events
    FeedbackLoopStarted,
    FeedbackLoopIteration,
    FeedbackLoopCompleted,
    BidirectionalFeedbackStarted,
    BidirectionalFeedbackCompleted,
    QualityCheckPassed,
    QualityCheckFailed,
    // Human approval events
    ApprovalRequired,
    ApprovalGranted,
    ApprovalRejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowExecutionEvent {
    #[serde(default)]
    pub id: Option<String>,
    pub execution_id: String,
    pub event_type: FlowEventType,
    #[serde(default)]
    pub step_id: Option<String>,
    pub message: String,
    #[serde(default)]
    pub data: HashMap<String, serde_json::Value>,
    #[serde(default = "Utc::now")]
    pub timestamp: DateTime<Utc>,
}
