use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/connect/stdio", post(connect_stdio))
        .route("/connect/sse", post(connect_sse))
        .route("/test-connection", post(test_connection))
        .route("/execute-tool", post(execute_tool))
}

#[derive(Deserialize)]
struct StdioConnectRequest {
    connection_id: String,
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env_vars: Option<HashMap<String, String>>,
}

#[derive(Deserialize)]
struct HttpConnectRequest {
    connection_id: String,
    url: String,
    #[serde(default)]
    api_key: Option<String>,
}

#[derive(Deserialize)]
struct TestConnectionRequest {
    connection_id: String,
}

#[derive(Deserialize)]
struct ExecuteToolRequest {
    connection_id: String,
    tool_name: String,
    #[serde(default)]
    arguments: HashMap<String, Value>,
}

async fn connect_stdio(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    Json(payload): Json<StdioConnectRequest>,
) -> Result<Json<Value>, AppError> {
    state.mcp_manager.get_or_create_stdio(
        &payload.connection_id,
        &payload.command,
        &payload.args,
        payload.env_vars.as_ref(),
    ).await?;

    Ok(Json(json!({
        "status": "connected",
        "connection_id": payload.connection_id,
        "transport": "stdio",
    })))
}

async fn connect_sse(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    Json(payload): Json<HttpConnectRequest>,
) -> Result<Json<Value>, AppError> {
    state.mcp_manager.get_or_create_http(
        &payload.connection_id,
        &payload.url,
        payload.api_key.as_deref(),
    ).await?;

    Ok(Json(json!({
        "status": "connected",
        "connection_id": payload.connection_id,
        "transport": "http",
    })))
}

async fn test_connection(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    Json(payload): Json<TestConnectionRequest>,
) -> Result<Json<Value>, AppError> {
    let connected = state.mcp_manager.is_connected(&payload.connection_id).await;

    if connected {
        let tools = state.mcp_manager.list_tools(&payload.connection_id, true).await?;
        Ok(Json(json!({
            "status": "connected",
            "tools_count": tools.len(),
        })))
    } else {
        Ok(Json(json!({
            "status": "disconnected",
            "tools_count": 0,
        })))
    }
}

async fn execute_tool(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    Json(payload): Json<ExecuteToolRequest>,
) -> Result<Json<Value>, AppError> {
    let arguments = if payload.arguments.is_empty() {
        None
    } else {
        Some(payload.arguments.into_iter().collect())
    };

    let result = state.mcp_manager.call_tool(
        &payload.connection_id,
        &payload.tool_name,
        arguments,
    ).await?;

    Ok(Json(result))
}
