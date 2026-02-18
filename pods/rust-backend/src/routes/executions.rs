use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use bson::oid::ObjectId;
use chrono::Utc;
use futures::stream::Stream;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;

use crate::auth::middleware::AuthUser;
use crate::db::collections::*;
use crate::error::AppError;
use crate::models::flow::*;
use crate::models::flow_events::*;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_executions))
        .route("/{execution_id}", get(get_execution))
        .route("/{execution_id}/cancel", post(cancel_execution))
        .route("/{execution_id}/approve", post(approve_execution))
        .route("/{execution_id}/events", get(list_execution_events))
        .route("/{execution_id}/stream", get(stream_execution))
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    #[serde(default = "default_page")]
    page: i64,
    #[serde(default = "default_per_page")]
    per_page: i64,
    #[serde(default)]
    flow_id: Option<String>,
}

fn default_page() -> i64 { 1 }
fn default_per_page() -> i64 { 20 }

async fn list_executions(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Query(params): Query<ListQuery>,
) -> Result<Json<FlowExecutionListResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOW_EXECUTIONS);

    let mut query = doc! { "user_id": &auth_user.id };
    if let Some(ref fid) = params.flow_id {
        query.insert("flow_id", fid);
    }

    // Count total
    let total = collection.count_documents(query.clone()).await
        .map_err(|e| AppError::Database(e.to_string()))? as i64;

    // Paginated query
    let skip = ((params.page - 1).max(0)) * params.per_page;
    let options = mongodb::options::FindOptions::builder()
        .sort(doc! { "created_at": -1 })
        .skip(Some(skip as u64))
        .limit(Some(params.per_page))
        .build();

    let mut cursor = collection.find(query).with_options(options).await?;
    let mut executions = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        if let Ok(resp) = doc_to_execution_response(&doc) {
            executions.push(resp);
        }
    }

    Ok(Json(FlowExecutionListResponse {
        executions,
        total,
        page: params.page,
        per_page: params.per_page,
    }))
}

async fn get_execution(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(execution_id): Path<String>,
) -> Result<Json<FlowExecutionResponse>, AppError> {
    let oid = ObjectId::parse_str(&execution_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOW_EXECUTIONS);

    let doc = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Execution not found".to_string()))?;

    Ok(Json(doc_to_execution_response(&doc)?))
}

async fn cancel_execution(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(execution_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    state.flow_service.cancel_execution(&execution_id, &auth_user.id).await?;

    Ok(Json(json!({
        "message": "Cancellation requested",
        "execution_id": execution_id,
    })))
}

#[derive(Debug, Deserialize)]
struct ApprovalPayload {
    #[serde(default = "default_true")]
    approved: bool,
}
fn default_true() -> bool { true }

async fn approve_execution(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(execution_id): Path<String>,
    Json(payload): Json<ApprovalPayload>,
) -> Result<Json<Value>, AppError> {
    state.flow_service.submit_approval(&execution_id, &auth_user.id, payload.approved).await?;

    Ok(Json(json!({
        "message": if payload.approved { "Approval granted" } else { "Approval rejected" },
        "execution_id": execution_id,
        "approved": payload.approved,
    })))
}

#[derive(Debug, Deserialize)]
struct EventsQuery {
    #[serde(default)]
    after: Option<u64>,
}

/// REST endpoint for polling execution events (alternative to SSE)
async fn list_execution_events(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(execution_id): Path<String>,
    Query(params): Query<EventsQuery>,
) -> Result<Json<Vec<Value>>, AppError> {
    // Verify execution belongs to user
    let oid = ObjectId::parse_str(&execution_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let exec_collection = db.collection::<bson::Document>(FLOW_EXECUTIONS);
    let _exec = exec_collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Execution not found".to_string()))?;

    // Query events
    let events_collection = db.collection::<bson::Document>(FLOW_EVENTS);
    let query = doc! { "execution_id": &execution_id };

    let skip_count = params.after.unwrap_or(0);
    let options = mongodb::options::FindOptions::builder()
        .sort(doc! { "timestamp": 1 })
        .skip(Some(skip_count))
        .build();

    let mut cursor = events_collection.find(query).with_options(options).await?;
    let mut events = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        events.push(bson_event_to_json(&doc));
    }

    Ok(Json(events))
}

/// Convert a BSON event document to JSON, handling bson::DateTime safely
fn bson_event_to_json(doc: &bson::Document) -> Value {
    let mut obj = serde_json::Map::new();

    if let Ok(id) = doc.get_object_id("_id") {
        obj.insert("id".to_string(), json!(id.to_hex()));
    }
    if let Ok(v) = doc.get_str("execution_id") {
        obj.insert("execution_id".to_string(), json!(v));
    }
    if let Ok(v) = doc.get_str("event_type") {
        obj.insert("event_type".to_string(), json!(v));
    }
    if let Ok(v) = doc.get_str("step_id") {
        obj.insert("step_id".to_string(), json!(v));
    }
    if let Ok(v) = doc.get_str("message") {
        obj.insert("message".to_string(), json!(v));
    }
    if let Ok(d) = doc.get_document("data") {
        if let Ok(data) = bson::from_document::<Value>(d.clone()) {
            obj.insert("data".to_string(), data);
        }
    }
    if let Ok(dt) = doc.get_datetime("timestamp") {
        obj.insert("timestamp".to_string(), json!(dt.to_chrono().to_rfc3339()));
    }

    Value::Object(obj)
}

/// SSE streaming endpoint for execution events
/// Supports auth via query token since EventSource doesn't support headers
async fn stream_execution(
    State(state): State<AppState>,
    Path(execution_id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    // Auth via query token (EventSource can't set headers)
    let token = params.get("token")
        .ok_or_else(|| AppError::Unauthorized("Token required for SSE stream".to_string()))?;

    // Validate JWT
    let claims = crate::auth::jwt::decode_token(token, &state.config.jwt_secret_key)?;

    // Resolve username → user ObjectId (same as AuthUser middleware)
    let db = state.mongo_client.database(DB_NAME);
    let users_collection = db.collection::<bson::Document>(USERS);
    let user_doc = users_collection
        .find_one(doc! { "username": &claims.sub })
        .await?
        .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;
    let user_id = user_doc
        .get_object_id("_id")
        .map(|id| id.to_hex())
        .map_err(|_| AppError::Internal("Invalid user ID".to_string()))?;

    // Verify execution exists and belongs to user
    let oid = ObjectId::parse_str(&execution_id)?;
    let exec_collection = db.collection::<bson::Document>(FLOW_EXECUTIONS);
    let _exec = exec_collection
        .find_one(doc! { "_id": oid, "user_id": &user_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Execution not found".to_string()))?;

    // Get historical events
    let events_collection = db.collection::<bson::Document>(FLOW_EVENTS);
    let mut event_cursor = events_collection
        .find(doc! { "execution_id": &execution_id })
        .await?;

    let mut historical_events = Vec::new();
    while event_cursor.advance().await? {
        let doc = event_cursor.deserialize_current()?;
        if let Ok(event) = bson::from_document::<FlowExecutionEvent>(doc) {
            historical_events.push(event);
        }
    }

    // Subscribe to live events
    let mut receiver = state.flow_service.subscribe_to_execution(&execution_id).await;
    let exec_id = execution_id.clone();

    let stream = async_stream::stream! {
        // Send connection established
        let conn_event = json!({
            "event_type": "connection_established",
            "execution_id": exec_id,
            "message": "Connected to execution stream",
        });
        yield Ok(Event::default().data(serde_json::to_string(&conn_event).unwrap_or_default()));

        // Replay historical events
        for event in historical_events {
            let data = serde_json::to_string(&event).unwrap_or_default();
            yield Ok(Event::default().data(data));
        }

        // Stream live events
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    let is_terminal = matches!(
                        event.event_type,
                        FlowEventType::ExecutionCompleted | FlowEventType::ExecutionFailed | FlowEventType::ExecutionCancelled
                    );
                    let data = serde_json::to_string(&event).unwrap_or_default();
                    yield Ok(Event::default().data(data));

                    if is_terminal {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(execution_id = %exec_id, "SSE stream lagged {} events", n);
                    let msg = json!({"event_type": "warning", "message": format!("Missed {} events", n)});
                    yield Ok(Event::default().data(serde_json::to_string(&msg).unwrap_or_default()));
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

fn doc_to_execution_response(doc: &bson::Document) -> Result<FlowExecutionResponse, AppError> {
    let status_str = doc.get_str("status").unwrap_or("pending");
    let status: FlowExecutionStatus = serde_json::from_value(json!(status_str))
        .unwrap_or(FlowExecutionStatus::Pending);

    let input_data: std::collections::HashMap<String, serde_json::Value> = doc.get_document("input_data")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let variables: std::collections::HashMap<String, serde_json::Value> = doc.get_document("variables")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let step_results: std::collections::HashMap<String, FlowStepResult> = doc.get_document("step_results")
        .ok()
        .and_then(|d| bson::from_document(d.clone()).ok())
        .unwrap_or_default();

    let completed_steps: Vec<String> = doc.get_array("completed_steps")
        .ok()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let failed_steps: Vec<String> = doc.get_array("failed_steps")
        .ok()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(FlowExecutionResponse {
        id: doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
        flow_id: doc.get_str("flow_id").unwrap_or("").to_string(),
        user_id: doc.get_str("user_id").unwrap_or("").to_string(),
        status,
        input_data,
        current_step_id: doc.get_str("current_step_id").ok().map(String::from),
        completed_steps,
        failed_steps,
        step_results,
        variables,
        error: doc.get_str("error").ok().map(String::from),
        start_time: doc.get_datetime("start_time").ok().map(|d| d.to_chrono()),
        end_time: doc.get_datetime("end_time").ok().map(|d| d.to_chrono()),
        execution_time_ms: doc.get_i64("execution_time_ms").ok(),
        created_at: doc.get_datetime("created_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        updated_at: doc.get_datetime("updated_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
    })
}
