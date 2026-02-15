use axum::{extract::State, routing::get, Json, Router};
use mongodb::bson::doc;
use serde_json::{json, Value};

use crate::auth::middleware::AuthUser;
use crate::db::collections::{AGENTS, DB_NAME};
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/agents", get(get_config_agents))
}

async fn get_config_agents(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(AGENTS);

    let mut cursor = collection.find(doc! {
        "$or": [
            { "user_id": &auth_user.id },
            { "is_default": true }
        ]
    }).await?;

    let mut agents = Vec::new();
    while cursor.advance().await? {
        let agent = cursor.deserialize_current()?;
        agents.push(json!({
            "id": agent.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
            "name": agent.get_str("name").unwrap_or(""),
            "description": agent.get_str("description").unwrap_or(""),
            "color": agent.get_str("color").unwrap_or("#3B82F6"),
        }));
    }

    Ok(Json(json!({ "agents": agents })))
}
