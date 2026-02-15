use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/mock/agents", get(mock_agents))
}

async fn mock_agents() -> Json<Value> {
    Json(json!({
        "agents": [
            {
                "name": "mock_agent",
                "description": "A mock agent for testing",
                "active": true
            }
        ]
    }))
}
