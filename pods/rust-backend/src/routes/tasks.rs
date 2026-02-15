use axum::{routing::get, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_tasks).post(create_task))
}

async fn list_tasks() -> Json<Value> {
    Json(json!({ "tasks": [], "total": 0 }))
}

#[derive(Debug, Deserialize)]
struct TaskCreatePayload {
    prompt: String,
    agent_name: String,
}

async fn create_task(
    Json(payload): Json<TaskCreatePayload>,
) -> Result<Json<Value>, AppError> {
    Ok(Json(json!({
        "id": 1,
        "message": format!("Task created for agent '{}': {}", payload.agent_name, payload.prompt),
        "status": "queued"
    })))
}
