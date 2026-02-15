pub mod auth;
pub mod agents;
pub mod llms;
pub mod mcp;
pub mod flows;
pub mod executions;
pub mod cli;
pub mod status;
pub mod health;
pub mod mcp_client;
pub mod functions;
pub mod mock;
pub mod config_routes;
pub mod tasks;

use axum::Router;
use crate::state::AppState;

pub fn create_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/api/agents", agents::router())
        .nest("/agents", agents::legacy_router()) // Legacy /agents/list
        .nest("/api/llms", llms::router())
        .nest("/api/mcp-server-connections", mcp::router())
        .nest("/api/flows", flows::router())
        .nest("/api/executions", executions::router())
        .nest("/api/cli", cli::router())
        .nest("/status", status::router())
        .nest("/api/mcp", mcp_client::router())
        .nest("/functions", functions::router())
        .nest("/api", mock::router())
        .nest("/config", config_routes::router())
        .nest("/tasks", tasks::router())
        .merge(health::router())
}
