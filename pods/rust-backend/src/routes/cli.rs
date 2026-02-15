use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post, put},
    Json, Router,
};
use bson::oid::ObjectId;
use chrono::Utc;
use futures::stream::Stream;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;

use crate::auth::middleware::AuthUser;
use crate::db::collections::*;
use crate::error::AppError;
use crate::models::chat::*;
use crate::services::agent_api_client::AgentApiClient;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Flow management
        .route("/flows", get(list_flows).post(create_flow))
        .route("/flows/help", get(flows_help))
        .route("/flows/{flow_name}/execute", post(execute_flow))
        .route("/flows/{flow_name}/help", get(get_flow_help))
        .route("/flows/{flow_name}/full", get(get_flow_full))
        .route("/flows/{flow_name}/clone", post(clone_flow))
        .route("/flows/{flow_name}", put(update_flow).delete(delete_flow))
        // Chat system
        .route("/chat/agents", get(chat_agents))
        .route("/chat/sessions", get(list_sessions).post(create_session))
        .route("/chat/sessions/{session_id}", get(get_session).delete(delete_session))
        .route("/chat/sessions/{session_id}/messages", get(get_messages).post(send_message))
        // Agent management
        .route("/agents", post(import_agent).get(list_agents))
        .route("/agents/list", get(list_agents))
        // LLM management
        .route("/llms", get(list_llms))
        .route("/llms/{llm_id}", get(get_llm))
}

// ========================
// Access control helper
// ========================

/// Build MongoDB query for user+public+default access
fn access_query(user_id: &str) -> bson::Document {
    doc! { "$or": [
        { "user_id": user_id },
        { "is_public": true },
        { "is_default": true },
    ]}
}

/// Build MongoDB query for user+public+default access on named resource
fn access_query_by_name(user_id: &str, name: &str) -> bson::Document {
    doc! {
        "name": name,
        "$or": [
            { "user_id": user_id },
            { "is_public": true },
            { "is_default": true },
        ]
    }
}

// ========================
// Flow endpoints
// ========================

async fn list_flows(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let flows_col = db.collection::<bson::Document>(FLOWS);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    let query = access_query(&auth_user.id);
    let mut cursor = flows_col.find(query).await?;
    let mut flows = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        let flow_id = doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default();
        let name = doc.get_str("name").unwrap_or("").to_string();
        let description = doc.get_str("description").ok().map(String::from);
        let is_active = doc.get_bool("is_active").unwrap_or(true);

        let steps = doc.get_array("steps").ok();
        let steps_count = steps.map(|s| s.len()).unwrap_or(0);

        // Collect agent info from steps
        let mut agents_info = Vec::new();
        if let Some(steps) = steps {
            for step in steps {
                if let Some(step_doc) = step.as_document() {
                    if let Ok(agent_id) = step_doc.get_str("agent_id") {
                        if let Ok(oid) = ObjectId::parse_str(agent_id) {
                            if let Ok(Some(agent)) = agents_col.find_one(doc! { "_id": oid }).await {
                                agents_info.push(json!({
                                    "name": agent.get_str("name").unwrap_or(""),
                                    "color": agent.get_str("color").unwrap_or("#3B82F6"),
                                }));
                            }
                        }
                    }
                }
            }
        }

        // Variables
        let variables: HashMap<String, Value> = doc.get_document("variables")
            .ok()
            .and_then(|d| bson::from_document(d.clone()).ok())
            .unwrap_or_default();

        // Tags from metadata
        let tags: Vec<String> = doc.get_document("metadata")
            .ok()
            .and_then(|m| m.get_array("tags").ok())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        flows.push(json!({
            "id": flow_id,
            "name": name,
            "description": description,
            "variables": variables,
            "agents": agents_info,
            "steps_count": steps_count,
            "is_active": is_active,
            "created_at": doc.get_datetime("created_at").map(|d| d.to_chrono().to_rfc3339()).unwrap_or_default(),
            "tags": tags,
        }));
    }

    Ok(Json(json!({
        "flows": flows,
        "total": flows.len(),
    })))
}

async fn execute_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_name): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let query = access_query_by_name(&auth_user.id, &flow_name);
    let flow_doc = collection.find_one(query).await?
        .ok_or_else(|| AppError::NotFound(format!("Flow '{}' not found", flow_name)))?;

    if !flow_doc.get_bool("is_active").unwrap_or(true) {
        return Err(AppError::BadRequest(format!("Flow '{}' is not active", flow_name)));
    }

    let flow_id = flow_doc.get_object_id("_id")
        .map(|id| id.to_hex())
        .map_err(|_| AppError::Internal("Invalid flow ID".to_string()))?;

    // Merge variables: flow defaults + CLI overrides
    let mut variables: HashMap<String, Value> = flow_doc.get_document("variables")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let cli_overrides = payload.get("cli_overrides").and_then(|v| v.as_bool()).unwrap_or(false);
    if let Some(cli_vars) = payload.get("variables").and_then(|v| v.as_object()) {
        if cli_overrides {
            // CLI takes full precedence
            variables = cli_vars.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        } else {
            // Merge: CLI overrides specific keys
            for (k, v) in cli_vars {
                variables.insert(k.clone(), v.clone());
            }
        }
    }

    let execution_id = state.flow_service.execute_flow(
        &flow_id,
        &auth_user.id,
        HashMap::new(),
        variables.clone(),
    ).await?;

    Ok(Json(json!({
        "execution_id": execution_id,
        "flow_name": flow_name,
        "status": "running",
        "variables": variables,
        "stream_url": format!("/api/executions/{}/stream", execution_id),
    })))
}

async fn flows_help() -> Json<Value> {
    Json(json!({
        "commands": [
            { "command": "list", "description": "List all available flows" },
            { "command": "run <flow-name>", "description": "Execute a flow by name" },
            { "command": "status <execution-id>", "description": "Check execution status" },
            { "command": "help <flow-name>", "description": "Get detailed help for a flow" },
            { "command": "full <flow-name>", "description": "Get full flow structure for export" },
            { "command": "clone <flow-name> --new-name <name>", "description": "Clone a flow" },
            { "command": "update <flow-name>", "description": "Update flow properties" },
            { "command": "delete <flow-name>", "description": "Delete a flow" },
        ]
    }))
}

async fn get_flow_help(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_name): Path<String>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let flows_col = db.collection::<bson::Document>(FLOWS);
    let agents_col = db.collection::<bson::Document>(AGENTS);
    let mcp_col = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let query = access_query_by_name(&auth_user.id, &flow_name);
    let flow_doc = flows_col.find_one(query).await?
        .ok_or_else(|| AppError::NotFound(format!("Flow '{}' not found", flow_name)))?;

    let variables: HashMap<String, Value> = flow_doc.get_document("variables")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let steps = flow_doc.get_array("steps").ok();
    let start_step = flow_doc.get_str("start_step_id").ok().map(String::from);

    // Collect agents and MCP connections
    let mut agents = Vec::new();
    let mut all_mcp_ids = Vec::new();
    let mut step_infos = Vec::new();

    if let Some(steps) = steps {
        for step in steps {
            if let Some(step_doc) = step.as_document() {
                let mut step_info = json!({
                    "name": step_doc.get_str("name").unwrap_or(""),
                    "description": step_doc.get_str("description").ok(),
                    "type": step_doc.get_str("type").unwrap_or("llm"),
                });

                if let Ok(agent_id) = step_doc.get_str("agent_id") {
                    if let Ok(oid) = ObjectId::parse_str(agent_id) {
                        if let Ok(Some(agent)) = agents_col.find_one(doc! { "_id": oid }).await {
                            let agent_name = agent.get_str("name").unwrap_or("").to_string();
                            step_info["agent"] = json!(agent_name);

                            // Collect MCP connection IDs
                            if let Ok(mcp_conns) = agent.get_array("mcp_connections") {
                                for conn in mcp_conns {
                                    if let Some(id) = conn.as_str() {
                                        all_mcp_ids.push(id.to_string());
                                    }
                                }
                            }

                            agents.push(json!({
                                "name": agent_name,
                                "description": agent.get_str("description").ok(),
                                "color": agent.get_str("color").unwrap_or("#3B82F6"),
                                "llm_id": agent.get_str("llm_id").ok(),
                                "mcp_connections": agent.get_array("mcp_connections").ok()
                                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
                                    .unwrap_or_default(),
                            }));
                        }
                    }
                }

                // Next steps
                let next_steps: Vec<String> = step_doc.get_array("next_steps")
                    .ok()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                step_info["next_steps"] = json!(next_steps);

                step_infos.push(step_info);
            }
        }
    }

    // Fetch MCP connection details
    let mut mcp_connections = Vec::new();
    for conn_id in &all_mcp_ids {
        if let Ok(oid) = ObjectId::parse_str(conn_id) {
            if let Ok(Some(conn)) = mcp_col.find_one(doc! { "_id": oid }).await {
                mcp_connections.push(json!({
                    "name": conn.get_str("name").unwrap_or(""),
                    "description": conn.get_str("description").ok(),
                    "server_type": conn.get_str("transport_type").unwrap_or("http"),
                }));
            }
        }
    }

    // Build usage info
    let var_keys: Vec<String> = variables.keys().cloned().collect();
    let var_args = var_keys.iter()
        .map(|k| format!("--{} <value>", k))
        .collect::<Vec<_>>()
        .join(" ");

    Ok(Json(json!({
        "name": flow_name,
        "description": flow_doc.get_str("description").ok(),
        "variables": variables,
        "agents": agents,
        "mcp_connections": mcp_connections,
        "steps": step_infos,
        "start_step": start_step,
        "metadata": flow_doc.get_document("metadata").ok()
            .and_then(|d| bson::from_document::<Value>(d.clone()).ok())
            .unwrap_or(json!({})),
        "usage": {
            "command": format!("pod run {} {}", flow_name, var_args),
            "examples": [
                format!("pod run {}", flow_name),
            ],
        },
    })))
}

async fn get_flow_full(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_name): Path<String>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let flows_col = db.collection::<bson::Document>(FLOWS);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    let query = access_query_by_name(&auth_user.id, &flow_name);
    let flow_doc = flows_col.find_one(query).await?
        .ok_or_else(|| AppError::NotFound(format!("Flow '{}' not found", flow_name)))?;

    let variables: HashMap<String, Value> = flow_doc.get_document("variables")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let edge_metadata: HashMap<String, Value> = flow_doc.get_document("edge_metadata")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let metadata: Value = flow_doc.get_document("metadata")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or(json!({}));

    // Build agents and steps
    let steps = flow_doc.get_array("steps").ok();
    let mut agents_info = Vec::new();
    let mut steps_info = Vec::new();

    if let Some(steps) = steps {
        for step in steps {
            if let Some(step_doc) = step.as_document() {
                let mut step_json = json!({
                    "id": step_doc.get_str("id").unwrap_or(""),
                    "name": step_doc.get_str("name").unwrap_or(""),
                    "description": step_doc.get_str("description").ok(),
                    "type": step_doc.get_str("type").unwrap_or("llm"),
                    "next_steps": step_doc.get_array("next_steps")
                        .ok()
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
                        .unwrap_or_default(),
                    "timeout_seconds": step_doc.get_i32("timeout_seconds").unwrap_or(300),
                    "retry_count": step_doc.get_i32("retry_count").unwrap_or(0),
                });

                if let Ok(agent_id) = step_doc.get_str("agent_id") {
                    step_json["agent_id"] = json!(agent_id);
                    if let Ok(oid) = ObjectId::parse_str(agent_id) {
                        if let Ok(Some(agent)) = agents_col.find_one(doc! { "_id": oid }).await {
                            agents_info.push(json!({
                                "id": agent_id,
                                "name": agent.get_str("name").unwrap_or(""),
                                "description": agent.get_str("description").ok(),
                                "color": agent.get_str("color").unwrap_or("#3B82F6"),
                                "llm_id": agent.get_str("llm_id").ok(),
                                "mcp_connections": agent.get_array("mcp_connections").ok()
                                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
                                    .unwrap_or_default(),
                            }));
                        }
                    }
                }

                if let Ok(condition) = step_doc.get_str("condition") {
                    step_json["condition"] = json!(condition);
                }

                if let Ok(overrides) = step_doc.get_document("agent_overrides") {
                    if let Ok(val) = bson::from_document::<Value>(overrides.clone()) {
                        step_json["agent_overrides"] = val;
                    }
                }

                if let Ok(params) = step_doc.get_document("parameters") {
                    if let Ok(val) = bson::from_document::<Value>(params.clone()) {
                        step_json["parameters"] = val;
                    }
                }

                steps_info.push(step_json);
            }
        }
    }

    Ok(Json(json!({
        "name": flow_name,
        "description": flow_doc.get_str("description").ok(),
        "is_active": flow_doc.get_bool("is_active").unwrap_or(true),
        "variables": variables,
        "agents": agents_info,
        "steps": steps_info,
        "start_step": flow_doc.get_str("start_step_id").ok(),
        "metadata": metadata,
        "edge_metadata": edge_metadata,
    })))
}

#[derive(Debug, Deserialize)]
struct FlowStepCLI {
    id: String,
    name: String,
    #[serde(default)]
    agent_id: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(rename = "type", default = "default_llm")]
    step_type: String,
    #[serde(default)]
    parameters: HashMap<String, Value>,
    #[serde(default)]
    next_steps: Vec<String>,
    #[serde(default = "default_timeout_300")]
    timeout_seconds: i32,
    #[serde(default)]
    retry_count: i32,
    #[serde(default)]
    condition: Option<String>,
    #[serde(default)]
    agent_overrides: Option<Value>,
}

fn default_llm() -> String { "llm".to_string() }
fn default_timeout_300() -> i32 { 300 }

#[derive(Debug, Deserialize)]
struct FlowImportCLI {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default = "default_true_val")]
    is_active: bool,
    #[serde(default)]
    variables: HashMap<String, Value>,
    steps: Vec<FlowStepCLI>,
    start_step: String,
    #[serde(default)]
    metadata: HashMap<String, Value>,
    #[serde(default)]
    edge_metadata: HashMap<String, Value>,
}

fn default_true_val() -> bool { true }

#[derive(Debug, Deserialize)]
struct OverwriteQuery {
    #[serde(default)]
    overwrite: bool,
}

async fn create_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Query(params): Query<OverwriteQuery>,
    Json(payload): Json<FlowImportCLI>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    // Check if flow with same name exists
    let existing = collection.find_one(doc! { "name": &payload.name, "user_id": &auth_user.id }).await?;

    // Validate start_step exists
    let step_ids: Vec<&str> = payload.steps.iter().map(|s| s.id.as_str()).collect();
    if !step_ids.contains(&payload.start_step.as_str()) {
        return Err(AppError::BadRequest(format!(
            "start_step '{}' not found in steps", payload.start_step
        )));
    }

    // Convert steps to BSON
    let steps_bson: Vec<bson::Bson> = payload.steps.iter().map(|s| {
        let mut step_doc = doc! {
            "id": &s.id,
            "name": &s.name,
            "type": &s.step_type,
            "timeout_seconds": s.timeout_seconds,
            "retry_count": s.retry_count,
        };
        if let Some(ref agent_id) = s.agent_id { step_doc.insert("agent_id", agent_id); }
        if let Some(ref desc) = s.description { step_doc.insert("description", desc); }
        if let Some(ref cond) = s.condition { step_doc.insert("condition", cond); }
        if let Some(ref overrides) = s.agent_overrides {
            if let Ok(bson_val) = bson::to_bson(overrides) { step_doc.insert("agent_overrides", bson_val); }
        }
        let next_arr: Vec<bson::Bson> = s.next_steps.iter().map(|n| bson::Bson::String(n.clone())).collect();
        step_doc.insert("next_steps", next_arr);
        if !s.parameters.is_empty() {
            if let Ok(params_bson) = bson::to_bson(&s.parameters) { step_doc.insert("parameters", params_bson); }
        }
        bson::Bson::Document(step_doc)
    }).collect();

    let now = bson::DateTime::from_chrono(Utc::now());

    if let Some(existing_doc) = existing {
        if !params.overwrite {
            return Err(AppError::Conflict(format!("Flow '{}' already exists. Use ?overwrite=true to replace.", payload.name)));
        }

        // Update existing
        let existing_id = existing_doc.get_object_id("_id")
            .map_err(|_| AppError::Internal("Invalid flow ID".to_string()))?;

        collection.update_one(
            doc! { "_id": existing_id },
            doc! { "$set": {
                "description": payload.description.as_deref(),
                "is_active": payload.is_active,
                "variables": bson::to_bson(&payload.variables).unwrap_or(bson::Bson::Document(doc!{})),
                "steps": &steps_bson,
                "start_step_id": &payload.start_step,
                "metadata": bson::to_bson(&payload.metadata).unwrap_or(bson::Bson::Document(doc!{})),
                "edge_metadata": bson::to_bson(&payload.edge_metadata).unwrap_or(bson::Bson::Document(doc!{})),
                "updated_at": now,
            }},
        ).await?;

        Ok(Json(json!({
            "success": true,
            "message": format!("Flow '{}' updated", payload.name),
            "flow_id": existing_id.to_hex(),
            "action": "updated",
        })))
    } else {
        // Create new
        let flow_doc = doc! {
            "user_id": &auth_user.id,
            "name": &payload.name,
            "description": payload.description.as_deref(),
            "is_active": payload.is_active,
            "variables": bson::to_bson(&payload.variables).unwrap_or(bson::Bson::Document(doc!{})),
            "steps": steps_bson,
            "start_step_id": &payload.start_step,
            "metadata": bson::to_bson(&payload.metadata).unwrap_or(bson::Bson::Document(doc!{})),
            "edge_metadata": bson::to_bson(&payload.edge_metadata).unwrap_or(bson::Bson::Document(doc!{})),
            "created_at": now,
            "updated_at": now,
        };

        let result = collection.insert_one(flow_doc).await?;
        let flow_id = result.inserted_id.as_object_id()
            .map(|id| id.to_hex())
            .unwrap_or_default();

        Ok(Json(json!({
            "success": true,
            "message": format!("Flow '{}' created", payload.name),
            "flow_id": flow_id,
            "action": "created",
        })))
    }
}

#[derive(Debug, Deserialize)]
struct CloneQuery {
    new_name: String,
}

async fn clone_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_name): Path<String>,
    Query(params): Query<CloneQuery>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    // Find source flow
    let query = access_query_by_name(&auth_user.id, &flow_name);
    let source = collection.find_one(query).await?
        .ok_or_else(|| AppError::NotFound(format!("Flow '{}' not found", flow_name)))?;

    // Check if new name exists
    let existing = collection.find_one(doc! { "name": &params.new_name, "user_id": &auth_user.id }).await?;
    if existing.is_some() {
        return Err(AppError::Conflict(format!("Flow '{}' already exists", params.new_name)));
    }

    let now = bson::DateTime::from_chrono(Utc::now());
    let mut clone = source.clone();
    clone.remove("_id");
    clone.insert("name", &params.new_name);
    clone.insert("user_id", &auth_user.id);
    clone.insert("is_default", false);
    clone.insert("is_public", false);
    clone.insert("is_active", true);
    clone.insert("created_at", now);
    clone.insert("updated_at", now);

    let result = collection.insert_one(clone).await?;
    let flow_id = result.inserted_id.as_object_id()
        .map(|id| id.to_hex())
        .unwrap_or_default();

    Ok(Json(json!({
        "success": true,
        "message": format!("Flow '{}' cloned as '{}'", flow_name, params.new_name),
        "flow_id": flow_id,
        "source_flow": flow_name,
        "new_flow": params.new_name,
    })))
}

#[derive(Debug, Deserialize)]
struct UpdateFlowQuery {
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    is_active: Option<bool>,
}

async fn update_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_name): Path<String>,
    Query(params): Query<UpdateFlowQuery>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let flow = collection.find_one(doc! { "name": &flow_name, "user_id": &auth_user.id }).await?
        .ok_or_else(|| AppError::NotFound(format!("Flow '{}' not found", flow_name)))?;

    let flow_oid = flow.get_object_id("_id")
        .map_err(|_| AppError::Internal("Invalid flow ID".to_string()))?;

    let mut update_doc = doc! { "updated_at": bson::DateTime::from_chrono(Utc::now()) };
    let mut updates = HashMap::new();

    if let Some(ref desc) = params.description {
        update_doc.insert("description", desc);
        updates.insert("description", json!(desc));
    }
    if let Some(active) = params.is_active {
        update_doc.insert("is_active", active);
        updates.insert("is_active", json!(active));
    }

    collection.update_one(doc! { "_id": flow_oid }, doc! { "$set": update_doc }).await?;

    Ok(Json(json!({
        "success": true,
        "message": format!("Flow '{}' updated", flow_name),
        "updates": updates,
    })))
}

async fn delete_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_name): Path<String>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let result = collection.delete_one(doc! { "name": &flow_name, "user_id": &auth_user.id }).await?;

    if result.deleted_count == 0 {
        return Err(AppError::NotFound(format!("Flow '{}' not found or not owned by you", flow_name)));
    }

    Ok(Json(json!({
        "success": true,
        "message": format!("Flow '{}' deleted", flow_name),
    })))
}

// ========================
// Chat endpoints
// ========================

async fn chat_agents(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<ChatAgentListResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let agents_col = db.collection::<bson::Document>(AGENTS);
    let llms_col = db.collection::<bson::Document>(LLMS);

    let query = access_query(&auth_user.id);
    let mut cursor = agents_col.find(query).await?;
    let mut agents = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        let agent_id = doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default();
        let name = doc.get_str("name").unwrap_or("").to_string();
        let llm_id = doc.get_str("llm_id").ok().map(String::from);
        let mcp_conns = doc.get_array("mcp_connections").ok()
            .map(|arr| !arr.is_empty())
            .unwrap_or(false);

        let mut has_llm = false;
        let mut llm_provider = None;

        if let Some(ref lid) = llm_id {
            if let Ok(oid) = ObjectId::parse_str(lid) {
                if let Ok(Some(llm_doc)) = llms_col.find_one(doc! { "_id": oid }).await {
                    has_llm = true;
                    llm_provider = llm_doc.get_str("provider").ok().map(String::from);
                }
            }
        }

        agents.push(ChatAgent {
            id: agent_id,
            name,
            description: doc.get_str("description").ok().map(String::from),
            color: doc.get_str("color").unwrap_or("#3B82F6").to_string(),
            avatar_url: doc.get_str("avatar_url").ok().map(String::from),
            has_llm,
            has_mcp_connections: mcp_conns,
            llm_provider,
        });
    }

    let total = agents.len() as i64;
    Ok(Json(ChatAgentListResponse { agents, total }))
}

#[derive(Debug, Deserialize)]
struct SessionListQuery {
    #[serde(default)]
    skip: i64,
    #[serde(default = "default_50")]
    limit: i64,
    #[serde(default = "default_true_val")]
    active_only: bool,
}

fn default_50() -> i64 { 50 }

async fn list_sessions(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Query(params): Query<SessionListQuery>,
) -> Result<Json<ChatSessionListResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(CHAT_SESSIONS);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    let mut query = doc! { "user_id": &auth_user.id };
    if params.active_only {
        query.insert("is_active", true);
    }

    let total = collection.count_documents(query.clone()).await
        .map_err(|e| AppError::Database(e.to_string()))? as i64;

    let limit = params.limit.min(100).max(1);
    let options = mongodb::options::FindOptions::builder()
        .sort(doc! { "updated_at": -1 })
        .skip(Some(params.skip.max(0) as u64))
        .limit(Some(limit))
        .build();

    let mut cursor = collection.find(query).with_options(options).await?;
    let mut sessions = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        let session_id = doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default();
        let agent_id = doc.get_str("agent_id").unwrap_or("").to_string();

        // Resolve agent name
        let agent_name = if let Ok(oid) = ObjectId::parse_str(&agent_id) {
            agents_col.find_one(doc! { "_id": oid }).await
                .ok()
                .flatten()
                .and_then(|a| a.get_str("name").ok().map(String::from))
                .unwrap_or("Unknown Agent".to_string())
        } else {
            "Unknown Agent".to_string()
        };

        sessions.push(ChatSession {
            id: session_id,
            user_id: doc.get_str("user_id").unwrap_or("").to_string(),
            agent_id,
            agent_name,
            title: doc.get_str("title").ok().map(String::from),
            created_at: doc.get_datetime("created_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
            updated_at: doc.get_datetime("updated_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
            message_count: doc.get_i64("message_count").unwrap_or(0),
            is_active: doc.get_bool("is_active").unwrap_or(true),
        });
    }

    Ok(Json(ChatSessionListResponse { sessions, total }))
}

async fn create_session(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(payload): Json<ChatSessionCreate>,
) -> Result<Json<ChatSession>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let agents_col = db.collection::<bson::Document>(AGENTS);
    let sessions_col = db.collection::<bson::Document>(CHAT_SESSIONS);

    // Validate agent exists
    let agent_oid = ObjectId::parse_str(&payload.agent_id)?;
    let agent = agents_col.find_one(doc! { "_id": agent_oid }).await?
        .ok_or_else(|| AppError::NotFound("Agent not found".to_string()))?;

    let agent_name = agent.get_str("name").unwrap_or("Unknown").to_string();
    let title = payload.title.unwrap_or_else(|| format!("Chat with {}", agent_name));

    let now = bson::DateTime::from_chrono(Utc::now());
    let session_doc = doc! {
        "user_id": &auth_user.id,
        "agent_id": &payload.agent_id,
        "title": &title,
        "messages": [],
        "message_count": 0_i64,
        "is_active": true,
        "created_at": now,
        "updated_at": now,
    };

    let result = sessions_col.insert_one(session_doc).await?;
    let session_id = result.inserted_id.as_object_id()
        .map(|id| id.to_hex())
        .ok_or_else(|| AppError::Internal("Failed to get session ID".to_string()))?;

    Ok(Json(ChatSession {
        id: session_id,
        user_id: auth_user.id,
        agent_id: payload.agent_id,
        agent_name,
        title: Some(title),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        message_count: 0,
        is_active: true,
    }))
}

async fn get_session(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<String>,
) -> Result<Json<ChatSession>, AppError> {
    let oid = ObjectId::parse_str(&session_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let sessions_col = db.collection::<bson::Document>(CHAT_SESSIONS);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    let doc = sessions_col
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let agent_id = doc.get_str("agent_id").unwrap_or("").to_string();
    let agent_name = if let Ok(aid) = ObjectId::parse_str(&agent_id) {
        agents_col.find_one(doc! { "_id": aid }).await
            .ok()
            .flatten()
            .and_then(|a| a.get_str("name").ok().map(String::from))
            .unwrap_or("Unknown Agent".to_string())
    } else {
        "Unknown Agent".to_string()
    };

    Ok(Json(ChatSession {
        id: session_id,
        user_id: doc.get_str("user_id").unwrap_or("").to_string(),
        agent_id,
        agent_name,
        title: doc.get_str("title").ok().map(String::from),
        created_at: doc.get_datetime("created_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        updated_at: doc.get_datetime("updated_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        message_count: doc.get_i64("message_count").unwrap_or(0),
        is_active: doc.get_bool("is_active").unwrap_or(true),
    }))
}

async fn delete_session(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let oid = ObjectId::parse_str(&session_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(CHAT_SESSIONS);

    // Soft delete
    let result = collection.update_one(
        doc! { "_id": oid, "user_id": &auth_user.id },
        doc! { "$set": { "is_active": false, "updated_at": bson::DateTime::from_chrono(Utc::now()) } },
    ).await?;

    if result.matched_count == 0 {
        return Err(AppError::NotFound("Session not found".to_string()));
    }

    Ok(Json(json!({ "message": "Session deleted" })))
}

#[derive(Debug, Deserialize)]
struct MessagesQuery {
    #[serde(default)]
    skip: i64,
    #[serde(default = "default_50")]
    limit: i64,
}

async fn get_messages(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<String>,
    Query(params): Query<MessagesQuery>,
) -> Result<Json<ChatMessagesResponse>, AppError> {
    let oid = ObjectId::parse_str(&session_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(CHAT_SESSIONS);

    let session = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let messages_arr = session.get_array("messages").ok();
    let total = messages_arr.as_ref().map(|m| m.len() as i64).unwrap_or(0);

    let limit = params.limit.min(100).max(1);
    let skip = params.skip.max(0) as usize;

    let messages: Vec<ChatMessage> = messages_arr
        .map(|arr| {
            arr.iter()
                .skip(skip)
                .take(limit as usize)
                .filter_map(|v| {
                    v.as_document().and_then(|msg_doc| {
                        Some(ChatMessage {
                            id: msg_doc.get_str("id").ok()
                                .or_else(|| msg_doc.get_object_id("_id").ok().map(|_| ""))
                                .unwrap_or("")
                                .to_string(),
                            role: msg_doc.get_str("role").unwrap_or("user").to_string(),
                            content: msg_doc.get_str("content").unwrap_or("").to_string(),
                            timestamp: msg_doc.get_datetime("timestamp")
                                .map(|d| d.to_chrono())
                                .unwrap_or_else(|_| Utc::now()),
                            tool_calls: None,
                            tool_results: None,
                        })
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(Json(ChatMessagesResponse {
        messages,
        total,
        skip: params.skip,
        limit,
    }))
}

/// Send a chat message - returns SSE stream with LLM response
async fn send_message(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<String>,
    Json(payload): Json<ChatMessageCreate>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    let oid = ObjectId::parse_str(&session_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let sessions_col = db.collection::<bson::Document>(CHAT_SESSIONS);
    let _agents_col = db.collection::<bson::Document>(AGENTS);

    // Load session
    let session = sessions_col
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;

    let agent_id = session.get_str("agent_id").unwrap_or("").to_string();

    // Save user message
    let msg_id = uuid::Uuid::new_v4().to_string();
    let now = bson::DateTime::from_chrono(Utc::now());
    let user_msg = doc! {
        "id": &msg_id,
        "role": "user",
        "content": &payload.content,
        "timestamp": now,
    };

    sessions_col.update_one(
        doc! { "_id": oid },
        doc! {
            "$push": { "messages": &user_msg },
            "$inc": { "message_count": 1_i64 },
            "$set": { "updated_at": now },
        },
    ).await.map_err(|e| AppError::Database(e.to_string()))?;

    // Build conversation history from previous messages
    let messages_arr = session.get_array("messages").ok();
    let mut conversation: Vec<crate::services::agent_api_client::message_formatter::LLMMessage> = messages_arr
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_document())
                .map(|msg| {
                    let role = msg.get_str("role").unwrap_or("user");
                    let content = msg.get_str("content").unwrap_or("");
                    crate::services::agent_api_client::message_formatter::LLMMessage {
                        role: role.to_string(),
                        content: content.to_string(),
                        tool_calls: None,
                        tool_call_id: None,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    // Add current user message to conversation
    conversation.push(crate::services::agent_api_client::message_formatter::LLMMessage {
        role: "user".to_string(),
        content: payload.content.clone(),
        tool_calls: None,
        tool_call_id: None,
    });

    // Clone what we need for the async stream
    let mongo_client = state.mongo_client.clone();
    let cipher = state.config.fernet_key.clone();
    let mcp_manager = state.mcp_manager.clone();
    let session_id_clone = session_id.clone();
    let content_clone = payload.content.clone();
    let msg_id_clone = msg_id.clone();

    let stream = async_stream::stream! {
        // Emit message_received
        yield Ok(Event::default()
            .event("message_received")
            .data(serde_json::to_string(&json!({
                "message_id": msg_id_clone,
                "content": content_clone,
            })).unwrap_or_default()));

        // Emit thinking
        yield Ok(Event::default()
            .event("thinking")
            .data(serde_json::to_string(&json!({"status": "processing"})).unwrap_or_default()));

        // Execute agent step
        let mut client = AgentApiClient::new(
            mongo_client.clone(),
            cipher.clone(),
            mcp_manager.clone(),
        );

        let params = json!({"task": content_clone});

        let result = client.execute_agent_step(
            &agent_id,
            "chat",
            &params,
            Some(conversation),
            None,
        ).await;

        let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(false);

        if success {
            let content = result.get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Emit content
            yield Ok(Event::default()
                .event("content")
                .data(serde_json::to_string(&json!({"content": content})).unwrap_or_default()));

            // Save assistant message
            let assistant_msg_id = uuid::Uuid::new_v4().to_string();
            let now = bson::DateTime::from_chrono(Utc::now());
            let assistant_msg = doc! {
                "id": &assistant_msg_id,
                "role": "assistant",
                "content": &content,
                "timestamp": now,
            };

            if let Ok(oid) = ObjectId::parse_str(&session_id_clone) {
                let sessions = mongo_client.database(DB_NAME).collection::<bson::Document>(CHAT_SESSIONS);
                let _ = sessions.update_one(
                    doc! { "_id": oid },
                    doc! {
                        "$push": { "messages": &assistant_msg },
                        "$inc": { "message_count": 1_i64 },
                        "$set": { "updated_at": now },
                    },
                ).await;
            }

            // Emit tool results if any
            if let Some(tool_results) = result.get("tool_results").and_then(|v| v.as_array()) {
                for tr in tool_results {
                    yield Ok(Event::default()
                        .event("tool_result")
                        .data(serde_json::to_string(tr).unwrap_or_default()));
                }
            }

            // Emit done
            yield Ok(Event::default()
                .event("done")
                .data(serde_json::to_string(&json!({
                    "message_id": assistant_msg_id,
                })).unwrap_or_default()));
        } else {
            let error = result.get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error")
                .to_string();

            yield Ok(Event::default()
                .event("error")
                .data(serde_json::to_string(&json!({"error": error})).unwrap_or_default()));
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ========================
// Agent management endpoints
// ========================

async fn import_agent(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let name = payload.get("name").and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("Name is required".to_string()))?;

    let db = state.mongo_client.database(DB_NAME);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    // Check if agent already exists
    let existing = agents_col.find_one(doc! { "name": name, "user_id": &auth_user.id }).await?;
    if existing.is_some() {
        return Err(AppError::Conflict(format!("Agent '{}' already exists", name)));
    }

    let now = bson::DateTime::from_chrono(Utc::now());
    let agent_doc = doc! {
        "user_id": &auth_user.id,
        "name": name,
        "description": payload.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "llm_id": payload.get("llm_id").and_then(|v| v.as_str()),
        "mcp_connections": payload.get("mcp_connections")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| bson::Bson::String(s.to_string()))).collect::<Vec<_>>())
            .unwrap_or_default(),
        "color": payload.get("color").and_then(|v| v.as_str()).unwrap_or("#3B82F6"),
        "system_prompt": payload.get("system_prompt").and_then(|v| v.as_str()),
        "is_default": false,
        "created_at": now,
        "updated_at": now,
    };

    let result = agents_col.insert_one(agent_doc).await?;
    let agent_id = result.inserted_id.as_object_id()
        .map(|id| id.to_hex())
        .unwrap_or_default();

    Ok(Json(json!({
        "success": true,
        "message": format!("Agent '{}' imported", name),
        "agent_id": agent_id,
    })))
}

async fn list_agents(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    let query = access_query(&auth_user.id);
    let mut cursor = agents_col.find(query).await?;
    let mut agents = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        agents.push(json!({
            "id": doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
            "name": doc.get_str("name").unwrap_or(""),
            "description": doc.get_str("description").ok(),
            "color": doc.get_str("color").unwrap_or("#3B82F6"),
            "is_default": doc.get_bool("is_default").unwrap_or(false),
        }));
    }

    let total = agents.len();
    Ok(Json(json!({ "agents": agents, "total": total })))
}

// ========================
// LLM endpoints
// ========================

async fn list_llms(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let mut cursor = collection.find(doc! { "user_id": &auth_user.id }).await?;
    let mut llms = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        let config = doc.get_document("config").ok();
        llms.push(json!({
            "id": doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
            "name": doc.get_str("name").unwrap_or(""),
            "provider": doc.get_str("provider").unwrap_or(""),
            "model_name": config.and_then(|c| c.get_str("model_name").ok()),
            "status": doc.get_str("status").unwrap_or("inactive"),
        }));
    }

    let total = llms.len();
    Ok(Json(json!({ "llms": llms, "total": total })))
}

async fn get_llm(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(llm_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let oid = ObjectId::parse_str(&llm_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let doc = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("LLM not found".to_string()))?;

    let config = doc.get_document("config").ok();

    Ok(Json(json!({
        "id": doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
        "name": doc.get_str("name").unwrap_or(""),
        "provider": doc.get_str("provider").unwrap_or(""),
        "model_name": config.and_then(|c| c.get_str("model_name").ok()),
        "status": doc.get_str("status").unwrap_or("inactive"),
        "is_default": doc.get_bool("is_default").unwrap_or(false),
    })))
}
