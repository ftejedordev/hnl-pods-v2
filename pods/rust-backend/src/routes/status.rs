use axum::{extract::State, routing::get, Json, Router};
use chrono::Utc;
use mongodb::bson::doc;
use serde_json::{json, Value};

use crate::db::collections::DB_NAME;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(status))
        .route("/health", get(health))
}

async fn status(State(state): State<AppState>) -> Json<Value> {
    let db_ok = state
        .mongo_client
        .database(DB_NAME)
        .run_command(doc! { "ping": 1 })
        .await
        .is_ok();

    Json(json!({
        "status": if db_ok { "healthy" } else { "degraded" },
        "timestamp": Utc::now().to_rfc3339(),
        "database": if db_ok { "connected" } else { "disconnected" },
        "version": "1.0.0",
        "backend": "rust"
    }))
}

async fn health(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    state
        .mongo_client
        .database(DB_NAME)
        .run_command(doc! { "ping": 1 })
        .await?;

    Ok(Json(json!({
        "status": "healthy",
        "timestamp": Utc::now().to_rfc3339()
    })))
}
