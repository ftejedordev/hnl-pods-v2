use std::sync::Arc;
use mongodb::Client;

use crate::config::AppConfig;
use crate::services::flow_service::FlowService;
use crate::services::mcp_session_manager::McpSessionManager;

#[derive(Clone)]
pub struct AppState {
    pub mongo_client: Client,
    pub config: AppConfig,
    pub mcp_manager: Arc<McpSessionManager>,
    pub flow_service: Arc<FlowService>,
}
