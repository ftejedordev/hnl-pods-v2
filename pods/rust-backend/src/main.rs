mod auth;
mod config;
mod db;
mod error;
mod models;
mod routes;
mod services;
mod startup;
mod state;
mod utils;

use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use std::sync::Arc;

use config::AppConfig;
use db::mongo;
use services::flow_service::FlowService;
use services::mcp_session_manager::McpSessionManager;
use state::AppState;

#[tokio::main]
async fn main() {
    // Load .env file if present
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "pods_backend=info,tower_http=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting HypernovaLabs Pods Backend (Rust)");

    // Load configuration
    let config = AppConfig::from_env();

    // Connect to MongoDB
    let mongo_client = mongo::connect(&config.db_uri_mongo)
        .await
        .expect("Failed to connect to MongoDB");

    // Initialize MCP session manager
    let mcp_manager = Arc::new(McpSessionManager::new());
    mcp_manager.start();

    // Initialize flow service
    let flow_service = Arc::new(FlowService::new(
        mongo_client.clone(),
        config.fernet_key.clone(),
        Arc::clone(&mcp_manager),
    ));

    // Create app state
    let state = AppState {
        mongo_client: mongo_client.clone(),
        config: config.clone(),
        mcp_manager: Arc::clone(&mcp_manager),
        flow_service,
    };

    // Run startup initialization
    startup::startup_initialization(&mongo_client, &config).await;

    // CORS layer - allow all origins in dev (matches Python backend)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_credentials(false);

    // Build router
    let app = Router::new()
        .merge(routes::create_router())
        .layer(cors)
        .with_state(state);

    // Bind and serve
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000")
        .await
        .expect("Failed to bind to port 8000");

    tracing::info!("Server running on http://0.0.0.0:8000");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");

    // Cleanup
    mcp_manager.stop().await;
    startup::shutdown_cleanup().await;
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install CTRL+C handler");
    tracing::info!("Shutdown signal received");
}
