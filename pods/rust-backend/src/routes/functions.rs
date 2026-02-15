use axum::{routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/basic_agent_function", post(basic_agent_function))
}

#[derive(Debug, Deserialize)]
struct BasicAgentInput {
    text: String,
}

async fn basic_agent_function(
    Json(payload): Json<BasicAgentInput>,
) -> Result<Json<Value>, AppError> {
    Ok(Json(json!({
        "result": format!("Processed: {}", payload.text),
        "status": "success"
    })))
}
