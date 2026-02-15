pub mod default_agents;
pub mod default_mcp_servers;
pub mod default_flows;
pub mod platform;

use mongodb::Client;
use tracing::info;

use crate::config::AppConfig;
use crate::db::collections::DB_NAME;

pub async fn startup_initialization(client: &Client, _config: &AppConfig) {
    info!("Running startup initialization...");

    let db = client.database(DB_NAME);

    // Create default agents if they don't exist
    if let Err(e) = default_agents::ensure_default_agents(&db).await {
        tracing::error!("Failed to create default agents: {}", e);
    }

    // Create default MCP servers if they don't exist
    if let Err(e) = default_mcp_servers::ensure_default_mcp_servers(&db).await {
        tracing::error!("Failed to create default MCP servers: {}", e);
    }

    // Create default flows if they don't exist
    if let Err(e) = default_flows::ensure_default_flows(&db).await {
        tracing::error!("Failed to create default flows: {}", e);
    }

    info!("Startup initialization complete");
}

pub async fn shutdown_cleanup() {
    info!("Running shutdown cleanup...");
    // TODO: Close MCP sessions, cleanup resources
    info!("Shutdown cleanup complete");
}
