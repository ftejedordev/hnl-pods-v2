use bson::oid::ObjectId;
use chrono::Utc;
use mongodb::bson::doc;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::db::collections::*;
use crate::error::AppError;
use crate::models::flow::*;
use crate::models::flow_events::*;
use crate::services::agent_api_client::AgentApiClient;
use crate::services::mcp_session_manager::McpSessionManager;
use crate::auth::encryption::FernetCipher;

/// Event channel type for SSE subscribers
pub type EventSender = broadcast::Sender<FlowExecutionEvent>;
pub type EventReceiver = broadcast::Receiver<FlowExecutionEvent>;

/// Flow execution service - manages flow executions and event broadcasting
pub struct FlowService {
    mongo_client: mongodb::Client,
    cipher: FernetCipher,
    mcp_manager: Arc<McpSessionManager>,
    /// Map of execution_id -> event channel sender
    event_channels: Arc<tokio::sync::RwLock<HashMap<String, EventSender>>>,
}

impl FlowService {
    pub fn new(
        mongo_client: mongodb::Client,
        cipher: FernetCipher,
        mcp_manager: Arc<McpSessionManager>,
    ) -> Self {
        Self {
            mongo_client,
            cipher,
            mcp_manager,
            event_channels: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    fn db(&self) -> mongodb::Database {
        self.mongo_client.database(DB_NAME)
    }

    /// Subscribe to execution events (for SSE streaming)
    pub async fn subscribe_to_execution(&self, execution_id: &str) -> EventReceiver {
        let mut channels = self.event_channels.write().await;
        let sender = channels.entry(execution_id.to_string())
            .or_insert_with(|| broadcast::channel(256).0);
        sender.subscribe()
    }

    /// Emit an event to all subscribers of an execution
    pub async fn emit_event(&self, event: FlowExecutionEvent) {
        // Store event in DB
        let collection = self.db().collection::<bson::Document>(FLOW_EVENTS);
        if let Ok(doc) = bson::to_document(&event) {
            let _ = collection.insert_one(doc).await;
        }

        // Broadcast to subscribers
        let channels = self.event_channels.read().await;
        if let Some(sender) = channels.get(&event.execution_id) {
            let _ = sender.send(event);
        }
    }

    /// Execute a flow
    pub async fn execute_flow(
        &self,
        flow_id: &str,
        user_id: &str,
        input_data: HashMap<String, Value>,
        variables: HashMap<String, Value>,
    ) -> Result<String, AppError> {
        // Load flow
        let flow_collection = self.db().collection::<bson::Document>(FLOWS);
        let flow_doc = if let Ok(oid) = ObjectId::parse_str(flow_id) {
            flow_collection.find_one(doc! { "_id": oid, "user_id": user_id }).await?
        } else {
            flow_collection.find_one(doc! { "_id": flow_id, "user_id": user_id }).await?
        };

        let flow_doc = flow_doc.ok_or_else(|| AppError::NotFound("Flow not found".to_string()))?;
        let flow: Flow = bson::from_document(flow_doc)
            .map_err(|e| AppError::Internal(format!("Failed to deserialize flow: {}", e)))?;

        // Create execution record
        let now = bson::DateTime::from_chrono(Utc::now());
        let execution_doc = doc! {
            "flow_id": flow_id,
            "user_id": user_id,
            "status": "running",
            "input_data": bson::to_bson(&input_data).unwrap_or(bson::Bson::Document(doc!{})),
            "variables": bson::to_bson(&variables).unwrap_or(bson::Bson::Document(doc!{})),
            "current_step_id": &flow.start_step_id,
            "completed_steps": [],
            "failed_steps": [],
            "step_results": {},
            "start_time": now,
            "created_at": now,
            "updated_at": now,
            "is_cancellation_requested": false,
        };

        let exec_collection = self.db().collection::<bson::Document>(FLOW_EXECUTIONS);
        let result = exec_collection.insert_one(execution_doc).await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let execution_id = result.inserted_id.as_object_id()
            .map(|oid| oid.to_hex())
            .ok_or_else(|| AppError::Internal("Failed to get execution ID".to_string()))?;

        // Emit start event
        self.emit_event(FlowExecutionEvent {
            id: None,
            execution_id: execution_id.clone(),
            event_type: FlowEventType::ExecutionStarted,
            step_id: None,
            message: format!("Flow '{}' execution started", flow.name),
            data: HashMap::new(),
            timestamp: Utc::now(),
        }).await;

        // Spawn execution in background
        let exec_id = execution_id.clone();
        let flow_service = FlowService::new(
            self.mongo_client.clone(),
            self.cipher.clone(),
            Arc::clone(&self.mcp_manager),
        );
        // Share event channels
        let channels = Arc::clone(&self.event_channels);

        tokio::spawn(async move {
            let mut executor = FlowExecutor::new(
                flow_service,
                channels,
            );
            executor.run(flow, &exec_id, input_data, variables).await;
        });

        Ok(execution_id)
    }

    /// Cancel a running execution
    pub async fn cancel_execution(&self, execution_id: &str, user_id: &str) -> Result<(), AppError> {
        let collection = self.db().collection::<bson::Document>(FLOW_EXECUTIONS);
        let oid = ObjectId::parse_str(execution_id)
            .map_err(|_| AppError::BadRequest("Invalid execution ID".to_string()))?;

        collection.update_one(
            doc! { "_id": oid, "user_id": user_id },
            doc! { "$set": { "is_cancellation_requested": true, "updated_at": bson::DateTime::from_chrono(Utc::now()) } },
        ).await.map_err(|e| AppError::Database(e.to_string()))?;

        self.emit_event(FlowExecutionEvent {
            id: None,
            execution_id: execution_id.to_string(),
            event_type: FlowEventType::ExecutionCancelled,
            step_id: None,
            message: "Execution cancellation requested".to_string(),
            data: HashMap::new(),
            timestamp: Utc::now(),
        }).await;

        Ok(())
    }

    /// Submit approval decision for an execution
    pub async fn submit_approval(
        &self,
        execution_id: &str,
        user_id: &str,
        approved: bool,
    ) -> Result<(), AppError> {
        let collection = self.db().collection::<bson::Document>(FLOW_EXECUTIONS);
        let oid = ObjectId::parse_str(execution_id)
            .map_err(|_| AppError::BadRequest("Invalid execution ID".to_string()))?;

        collection.update_one(
            doc! { "_id": oid, "user_id": user_id },
            doc! { "$set": {
                "approval_decision": approved,
                "updated_at": bson::DateTime::from_chrono(Utc::now()),
            }},
        ).await.map_err(|e| AppError::Database(e.to_string()))?;

        let event_type = if approved { FlowEventType::ApprovalGranted } else { FlowEventType::ApprovalRejected };
        self.emit_event(FlowExecutionEvent {
            id: None,
            execution_id: execution_id.to_string(),
            event_type,
            step_id: None,
            message: if approved { "Approval granted".into() } else { "Approval rejected".into() },
            data: HashMap::new(),
            timestamp: Utc::now(),
        }).await;

        Ok(())
    }
}

/// Internal flow executor that runs a flow to completion
struct FlowExecutor {
    service: FlowService,
    event_channels: Arc<tokio::sync::RwLock<HashMap<String, EventSender>>>,
}

impl FlowExecutor {
    fn new(
        service: FlowService,
        event_channels: Arc<tokio::sync::RwLock<HashMap<String, EventSender>>>,
    ) -> Self {
        Self { service, event_channels }
    }

    async fn emit(&self, event: FlowExecutionEvent) {
        // Store in DB
        let collection = self.service.db().collection::<bson::Document>(FLOW_EVENTS);
        if let Ok(doc) = bson::to_document(&event) {
            let _ = collection.insert_one(doc).await;
        }
        // Broadcast
        let channels = self.event_channels.read().await;
        if let Some(sender) = channels.get(&event.execution_id) {
            let _ = sender.send(event);
        }
    }

    async fn run(
        &mut self,
        flow: Flow,
        execution_id: &str,
        _input_data: HashMap<String, Value>,
        mut variables: HashMap<String, Value>,
    ) {
        let mut current_step_id = flow.start_step_id.clone();
        let mut completed_steps: Vec<String> = Vec::new();
        let exec_collection = self.service.db().collection::<bson::Document>(FLOW_EXECUTIONS);

        // Build step lookup
        let step_map: HashMap<String, &FlowStep> = flow.steps.iter()
            .map(|s| (s.id.clone(), s))
            .collect();

        loop {
            // Check cancellation
            if let Ok(oid) = ObjectId::parse_str(execution_id) {
                if let Ok(Some(exec_doc)) = exec_collection.find_one(doc! { "_id": oid }).await {
                    if exec_doc.get_bool("is_cancellation_requested").unwrap_or(false) {
                        self.update_execution_status(execution_id, "cancelled").await;
                        self.emit(FlowExecutionEvent {
                            id: None,
                            execution_id: execution_id.to_string(),
                            event_type: FlowEventType::ExecutionCancelled,
                            step_id: Some(current_step_id.clone()),
                            message: "Execution cancelled by user".to_string(),
                            data: HashMap::new(),
                            timestamp: Utc::now(),
                        }).await;
                        return;
                    }
                }
            }

            let step = match step_map.get(&current_step_id) {
                Some(s) => *s,
                None => {
                    tracing::error!(execution_id = %execution_id, step_id = %current_step_id, "Step not found");
                    self.update_execution_status(execution_id, "failed").await;
                    return;
                }
            };

            // Emit step started
            self.emit(FlowExecutionEvent {
                id: None,
                execution_id: execution_id.to_string(),
                event_type: FlowEventType::StepStarted,
                step_id: Some(step.id.clone()),
                message: format!("Step '{}' started", step.name),
                data: HashMap::from([("step_type".to_string(), json!(step.step_type))]),
                timestamp: Utc::now(),
            }).await;

            // Update current step in execution
            if let Ok(oid) = ObjectId::parse_str(execution_id) {
                let _ = exec_collection.update_one(
                    doc! { "_id": oid },
                    doc! { "$set": { "current_step_id": &step.id, "updated_at": bson::DateTime::from_chrono(Utc::now()) } },
                ).await;
            }

            // Execute step based on type
            let step_result = self.execute_step(step, execution_id, &variables).await;

            match step_result {
                Ok(result) => {
                    // Store step result
                    if let Some(output) = result.get("output") {
                        variables.insert(format!("step_{}_output", step.id), output.clone());
                    }

                    completed_steps.push(step.id.clone());

                    self.emit(FlowExecutionEvent {
                        id: None,
                        execution_id: execution_id.to_string(),
                        event_type: FlowEventType::StepCompleted,
                        step_id: Some(step.id.clone()),
                        message: format!("Step '{}' completed", step.name),
                        data: HashMap::from([("result".to_string(), result.clone())]),
                        timestamp: Utc::now(),
                    }).await;

                    // Determine next step
                    let next_step_id = result.get("next_step_id")
                        .and_then(|v| v.as_str())
                        .map(String::from);

                    match next_step_id {
                        Some(next) if !next.is_empty() => {
                            current_step_id = next;
                        }
                        _ => {
                            // Use first next_step from step definition, or finish
                            if let Some(next) = step.next_steps.first() {
                                current_step_id = next.clone();
                            } else {
                                // Flow completed
                                break;
                            }
                        }
                    }
                }
                Err(error) => {
                    tracing::error!(execution_id = %execution_id, step_id = %step.id, error = %error, "Step failed");

                    self.emit(FlowExecutionEvent {
                        id: None,
                        execution_id: execution_id.to_string(),
                        event_type: FlowEventType::StepFailed,
                        step_id: Some(step.id.clone()),
                        message: format!("Step '{}' failed: {}", step.name, error),
                        data: HashMap::new(),
                        timestamp: Utc::now(),
                    }).await;

                    self.update_execution_status(execution_id, "failed").await;
                    self.emit(FlowExecutionEvent {
                        id: None,
                        execution_id: execution_id.to_string(),
                        event_type: FlowEventType::ExecutionFailed,
                        step_id: Some(step.id.clone()),
                        message: format!("Flow execution failed at step '{}'", step.name),
                        data: HashMap::from([("error".to_string(), json!(error.to_string()))]),
                        timestamp: Utc::now(),
                    }).await;
                    return;
                }
            }
        }

        // Flow completed successfully
        self.update_execution_status(execution_id, "completed").await;
        self.emit(FlowExecutionEvent {
            id: None,
            execution_id: execution_id.to_string(),
            event_type: FlowEventType::ExecutionCompleted,
            step_id: None,
            message: "Flow execution completed successfully".to_string(),
            data: HashMap::from([
                ("completed_steps".to_string(), json!(completed_steps)),
            ]),
            timestamp: Utc::now(),
        }).await;

        // Cleanup event channel after a delay
        let exec_id = execution_id.to_string();
        let channels = Arc::clone(&self.event_channels);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            channels.write().await.remove(&exec_id);
        });
    }

    async fn execute_step(
        &self,
        step: &FlowStep,
        execution_id: &str,
        variables: &HashMap<String, Value>,
    ) -> Result<Value, String> {
        match step.step_type {
            FlowStepType::Llm => self.execute_llm_step(step, execution_id, variables).await,
            FlowStepType::Tool => self.execute_tool_step(step, variables).await,
            FlowStepType::Condition => self.execute_condition_step(step, variables).await,
            FlowStepType::Approval => self.execute_approval_step(step, execution_id).await,
            FlowStepType::Parallel => self.execute_parallel_step(step, execution_id, variables).await,
            FlowStepType::FeedbackLoop => self.execute_feedback_loop_step(step, execution_id, variables).await,
            _ => Ok(json!({"output": "Step type not yet implemented", "next_step_id": null})),
        }
    }

    async fn execute_llm_step(
        &self,
        step: &FlowStep,
        execution_id: &str,
        variables: &HashMap<String, Value>,
    ) -> Result<Value, String> {
        let agent_id = step.agent_id.as_deref()
            .ok_or("LLM step requires agent_id")?;

        let task = resolve_variables(
            step.parameters.get("task").and_then(|v| v.as_str()).unwrap_or(&step.name),
            variables,
        );

        let params = json!({"task": task});

        let event_exec_id = execution_id.to_string();
        let event_step_id = step.id.clone();
        let channels = Arc::clone(&self.event_channels);

        let mut client = AgentApiClient::new(
            self.service.mongo_client.clone(),
            self.service.cipher.clone(),
            Arc::clone(&self.service.mcp_manager),
        );

        let event_callback: Box<dyn FnMut(&str, Value) + Send> = Box::new(move |event_type: &str, data: Value| {
            let event = FlowExecutionEvent {
                id: None,
                execution_id: event_exec_id.clone(),
                event_type: match event_type {
                    "LLM_RESPONSE" => FlowEventType::LlmResponse,
                    "LLM_STREAMING_CHUNK" => FlowEventType::LlmStreamingChunk,
                    "TOOL_CALL_STARTED" => FlowEventType::ToolCallStarted,
                    "TOOL_CALL_COMPLETED" => FlowEventType::ToolCallCompleted,
                    _ => FlowEventType::StepProgress,
                },
                step_id: Some(event_step_id.clone()),
                message: event_type.to_string(),
                data: if let Some(obj) = data.as_object() {
                    obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
                } else {
                    HashMap::new()
                },
                timestamp: Utc::now(),
            };
            // Fire-and-forget broadcast (can't await in sync closure)
            let channels_clone = channels.clone();
            let event_clone = event.clone();
            tokio::spawn(async move {
                let chans = channels_clone.read().await;
                if let Some(sender) = chans.get(&event_clone.execution_id) {
                    let _ = sender.send(event_clone);
                }
            });
        });

        let result = client.execute_agent_step(
            agent_id,
            &step.name,
            &params,
            None,
            Some(event_callback),
        ).await;

        if result.get("success").and_then(|v| v.as_bool()) == Some(true) {
            Ok(json!({
                "output": result.get("content").cloned().unwrap_or(json!("")),
                "agent_result": result,
            }))
        } else {
            Err(result.get("error").and_then(|v| v.as_str()).unwrap_or("LLM step failed").to_string())
        }
    }

    async fn execute_tool_step(
        &self,
        step: &FlowStep,
        _variables: &HashMap<String, Value>,
    ) -> Result<Value, String> {
        let connection_id = step.parameters.get("connection_id")
            .and_then(|v| v.as_str())
            .ok_or("Tool step requires connection_id parameter")?;

        let tool_name = step.parameters.get("tool_name")
            .and_then(|v| v.as_str())
            .ok_or("Tool step requires tool_name parameter")?;

        let arguments = step.parameters.get("arguments")
            .and_then(|v| v.as_object())
            .cloned();

        let result = self.service.mcp_manager.call_tool(connection_id, tool_name, arguments).await
            .map_err(|e| e.to_string())?;

        Ok(json!({"output": result}))
    }

    async fn execute_condition_step(
        &self,
        step: &FlowStep,
        variables: &HashMap<String, Value>,
    ) -> Result<Value, String> {
        let condition = step.condition.as_deref().unwrap_or("true");
        let resolved = resolve_variables(condition, variables);

        // Simple condition evaluation
        let condition_met = match resolved.trim().to_lowercase().as_str() {
            "true" | "1" | "yes" => true,
            "false" | "0" | "no" | "" => false,
            _ => !resolved.trim().is_empty(),
        };

        let next_step = if condition_met {
            step.next_steps.first().cloned()
        } else {
            step.next_steps.get(1).cloned()
        };

        Ok(json!({
            "output": condition_met,
            "condition_result": condition_met,
            "next_step_id": next_step,
        }))
    }

    async fn execute_approval_step(
        &self,
        step: &FlowStep,
        execution_id: &str,
    ) -> Result<Value, String> {
        // Set pending approval
        if let Ok(oid) = ObjectId::parse_str(execution_id) {
            let exec_collection = self.service.db().collection::<bson::Document>(FLOW_EXECUTIONS);
            let _ = exec_collection.update_one(
                doc! { "_id": oid },
                doc! { "$set": {
                    "pending_approval_step_id": &step.id,
                    "approval_decision": bson::Bson::Null,
                    "updated_at": bson::DateTime::from_chrono(Utc::now()),
                }},
            ).await;
        }

        self.emit(FlowExecutionEvent {
            id: None,
            execution_id: execution_id.to_string(),
            event_type: FlowEventType::ApprovalRequired,
            step_id: Some(step.id.clone()),
            message: format!("Approval required for step '{}'", step.name),
            data: HashMap::new(),
            timestamp: Utc::now(),
        }).await;

        // Poll for approval decision
        let timeout = std::time::Duration::from_secs(
            step.timeout_seconds.unwrap_or(300) as u64,
        );
        let start = std::time::Instant::now();

        loop {
            if start.elapsed() > timeout {
                return Err("Approval timed out".to_string());
            }

            if let Ok(oid) = ObjectId::parse_str(execution_id) {
                let exec_collection = self.service.db().collection::<bson::Document>(FLOW_EXECUTIONS);
                if let Ok(Some(doc)) = exec_collection.find_one(doc! { "_id": oid }).await {
                    if let Ok(decision) = doc.get_bool("approval_decision") {
                        return if decision {
                            Ok(json!({"output": "approved", "approved": true}))
                        } else {
                            Err("Approval rejected".to_string())
                        };
                    }
                    if doc.get_bool("is_cancellation_requested").unwrap_or(false) {
                        return Err("Execution cancelled".to_string());
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }

    async fn execute_parallel_step(
        &self,
        step: &FlowStep,
        _execution_id: &str,
        _variables: &HashMap<String, Value>,
    ) -> Result<Value, String> {
        // Execute all next_steps in parallel
        // For now, just proceed to first next step
        Ok(json!({
            "output": "Parallel execution completed",
            "next_step_id": step.next_steps.first(),
        }))
    }

    async fn execute_feedback_loop_step(
        &self,
        step: &FlowStep,
        execution_id: &str,
        variables: &HashMap<String, Value>,
    ) -> Result<Value, String> {
        // Feedback loops are handled via edge metadata
        // For now, execute as LLM step
        self.execute_llm_step(step, execution_id, variables).await
    }

    async fn update_execution_status(&self, execution_id: &str, status: &str) {
        if let Ok(oid) = ObjectId::parse_str(execution_id) {
            let collection = self.service.db().collection::<bson::Document>(FLOW_EXECUTIONS);
            let now = bson::DateTime::from_chrono(Utc::now());
            let _ = collection.update_one(
                doc! { "_id": oid },
                doc! { "$set": { "status": status, "end_time": now, "updated_at": now } },
            ).await;
        }
    }
}

/// Resolve ${var} and {{var}} placeholders in a string
fn resolve_variables(template: &str, variables: &HashMap<String, Value>) -> String {
    let mut result = template.to_string();
    for (key, value) in variables {
        let val_str = match value {
            Value::String(s) => s.clone(),
            other => serde_json::to_string(other).unwrap_or_default(),
        };
        result = result.replace(&format!("${{{}}}", key), &val_str);
        result = result.replace(&format!("{{{{{}}}}}", key), &val_str);
    }
    result
}
