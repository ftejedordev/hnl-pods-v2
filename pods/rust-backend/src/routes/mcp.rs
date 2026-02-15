use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use bson::oid::ObjectId;
use chrono::Utc;
use mongodb::bson::doc;
use serde_json::{json, Value};

use crate::auth::encryption::{decrypt_api_key, encrypt_api_key};
use crate::auth::middleware::AuthUser;
use crate::db::collections::{DB_NAME, MCP_SERVER_CONNECTIONS};
use crate::error::AppError;
use crate::models::mcp_connection::*;
use crate::models::mcp_tools::*;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_connections).post(create_connection))
        .route("/overview", get(get_overview))
        .route("/{connection_id}", get(get_connection).put(update_connection).delete(delete_connection))
        .route("/{connection_id}/test-connectivity", post(test_connectivity))
        .route("/{connection_id}/tools", get(get_tools))
        .route("/{connection_id}/tools/execute", post(execute_tool))
        .route("/{connection_id}/execute-tool", post(execute_tool))
        .route("/{connection_id}/capabilities", get(get_capabilities))
}

fn doc_to_connection_response(conn: &bson::Document, cipher: Option<&crate::auth::encryption::FernetCipher>) -> McpServerConnectionResponse {
    let api_key = if let Some(c) = cipher {
        conn.get_str("api_key").ok().and_then(|encrypted| {
            decrypt_api_key(c, encrypted).ok()
        })
    } else {
        None
    };

    let stdio_args: Option<Vec<String>> = conn.get_array("stdio_args").ok().map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
    });

    McpServerConnectionResponse {
        id: conn.get_object_id("_id").map(|id| id.to_hex())
            .or_else(|_| conn.get_str("_id").map(String::from))
            .unwrap_or_default(),
        user_id: conn.get_str("user_id").unwrap_or("").to_string(),
        name: conn.get_str("name").unwrap_or("").to_string(),
        base_url: conn.get_str("base_url").ok().map(String::from),
        api_key,
        description: conn.get_str("description").ok().map(String::from),
        is_active: conn.get_bool("is_active").unwrap_or(true),
        transport_type: conn.get_str("transport_type").unwrap_or("http").to_string(),
        stdio_command: conn.get_str("stdio_command").ok().map(String::from),
        stdio_args,
        sse_url: conn.get_str("sse_url").ok().map(String::from),
        sse_headers: None, // TODO: deserialize from doc
        env_vars: None, // TODO: deserialize from doc
        is_default: conn.get_bool("is_default").unwrap_or(false),
        created_at: conn.get_datetime("created_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        updated_at: conn.get_datetime("updated_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
    }
}

async fn get_connections(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Vec<McpServerConnectionResponse>>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    // Get user connections
    let mut user_cursor = collection.find(doc! { "user_id": &auth_user.id }).await?;
    let mut results = Vec::new();

    while user_cursor.advance().await? {
        let conn = user_cursor.deserialize_current()?;
        results.push(doc_to_connection_response(&conn, Some(&state.config.fernet_key)));
    }

    // Get system defaults
    let mut sys_cursor = collection.find(doc! { "is_default": true, "user_id": "system" }).await?;
    let mut system_results = Vec::new();

    while sys_cursor.advance().await? {
        let conn = sys_cursor.deserialize_current()?;
        let mut resp = doc_to_connection_response(&conn, None); // Don't expose system keys
        resp.api_key = None;
        system_results.push(resp);
    }

    // System connections first
    system_results.extend(results);
    Ok(Json(system_results))
}

async fn get_connection(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
) -> Result<Json<McpServerConnectionResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let conn = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    Ok(Json(doc_to_connection_response(&conn, Some(&state.config.fernet_key))))
}

async fn create_connection(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(payload): Json<McpServerConnectionCreate>,
) -> Result<Json<McpServerConnectionResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    // Check duplicate name
    let existing = collection
        .find_one(doc! { "user_id": &auth_user.id, "name": &payload.name })
        .await?;
    if existing.is_some() {
        return Err(AppError::BadRequest("Connection name already exists".to_string()));
    }

    // Encrypt API key
    let encrypted_api_key = payload.api_key.as_ref().map(|key| {
        encrypt_api_key(&state.config.fernet_key, key)
    }).transpose()?;

    let now = bson::DateTime::from_chrono(Utc::now());
    let stdio_args_bson: Option<Vec<bson::Bson>> = payload.stdio_args.as_ref().map(|args| {
        args.iter().map(|s| bson::Bson::String(s.clone())).collect()
    });

    let mut conn_doc = doc! {
        "user_id": &auth_user.id,
        "name": &payload.name,
        "is_active": payload.is_active,
        "transport_type": &payload.transport_type,
        "created_at": now,
        "updated_at": now,
    };

    if let Some(ref url) = payload.base_url { conn_doc.insert("base_url", url); }
    if let Some(ref key) = encrypted_api_key { conn_doc.insert("api_key", key); }
    if let Some(ref desc) = payload.description { conn_doc.insert("description", desc); }
    if let Some(ref cmd) = payload.stdio_command { conn_doc.insert("stdio_command", cmd); }
    if let Some(ref args) = stdio_args_bson { conn_doc.insert("stdio_args", args); }
    if let Some(ref url) = payload.sse_url { conn_doc.insert("sse_url", url); }

    let result = collection.insert_one(conn_doc).await?;
    let inserted_id = result.inserted_id.as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    let created = collection.find_one(doc! { "_id": inserted_id }).await?
        .ok_or_else(|| AppError::Internal("Failed to retrieve created connection".to_string()))?;

    Ok(Json(doc_to_connection_response(&created, Some(&state.config.fernet_key))))
}

async fn update_connection(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
    Json(payload): Json<McpServerConnectionUpdate>,
) -> Result<Json<McpServerConnectionResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let existing = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    let is_system = existing.get_bool("is_default").unwrap_or(false) && existing.get_str("user_id").unwrap_or("") == "system";

    let mut update_doc = doc! { "updated_at": bson::DateTime::from_chrono(Utc::now()) };

    if !is_system {
        if let Some(ref name) = payload.name { update_doc.insert("name", name); }
        if let Some(ref url) = payload.base_url { update_doc.insert("base_url", url); }
        if let Some(ref desc) = payload.description { update_doc.insert("description", desc); }
        if let Some(ref tt) = payload.transport_type { update_doc.insert("transport_type", tt); }
        if let Some(ref cmd) = payload.stdio_command { update_doc.insert("stdio_command", cmd); }
        if let Some(ref url) = payload.sse_url { update_doc.insert("sse_url", url); }
        if let Some(ref api_key) = payload.api_key {
            if api_key.is_empty() {
                update_doc.insert("api_key", bson::Bson::Null);
            } else {
                let encrypted = encrypt_api_key(&state.config.fernet_key, api_key)?;
                update_doc.insert("api_key", encrypted);
            }
        }
    }

    // Both system and user connections can update these
    if let Some(is_active) = payload.is_active { update_doc.insert("is_active", is_active); }
    if let Some(ref args) = payload.stdio_args {
        let args_bson: Vec<bson::Bson> = args.iter().map(|s| bson::Bson::String(s.clone())).collect();
        update_doc.insert("stdio_args", args_bson);
    }

    // Update using the right ID format
    let filter = build_id_filter(&connection_id, if is_system { "system" } else { &auth_user.id }, is_system);
    collection.update_one(filter, doc! { "$set": update_doc }).await?;

    let updated = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("Connection not found after update".to_string()))?;

    Ok(Json(doc_to_connection_response(&updated, Some(&state.config.fernet_key))))
}

async fn delete_connection(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let existing = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    if existing.get_bool("is_default").unwrap_or(false) && existing.get_str("user_id").unwrap_or("") == "system" {
        return Err(AppError::Forbidden("Cannot delete system default MCP connections".to_string()));
    }

    // Try ObjectId first, then string
    let deleted = if let Ok(oid) = ObjectId::parse_str(&connection_id) {
        collection.delete_one(doc! { "_id": oid, "user_id": &auth_user.id }).await?
    } else {
        collection.delete_one(doc! { "_id": &connection_id, "user_id": &auth_user.id }).await?
    };

    if deleted.deleted_count == 0 {
        return Err(AppError::NotFound("MCP server connection not found".to_string()));
    }

    Ok(Json(json!({ "message": "MCP server connection deleted successfully" })))
}

async fn test_connectivity(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
) -> Result<Json<ConnectivityTestResult>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let conn = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    let transport_type = conn.get_str("transport_type").unwrap_or("http");
    let name = conn.get_str("name").unwrap_or("").to_string();
    let start = std::time::Instant::now();

    let result = match transport_type {
        "stdio" => {
            let command = conn.get_str("stdio_command").unwrap_or("").to_string();
            let args: Vec<String> = conn.get_array("stdio_args").ok()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            state.mcp_manager.get_or_create_stdio(&connection_id, &command, &args, None).await
        }
        "http" => {
            let base_url = conn.get_str("base_url").unwrap_or("").to_string();
            let api_key = conn.get_str("api_key").ok().and_then(|encrypted| {
                decrypt_api_key(&state.config.fernet_key, encrypted).ok()
            });

            state.mcp_manager.get_or_create_http(&connection_id, &base_url, api_key.as_deref()).await
        }
        _ => Err(AppError::BadRequest(format!("Unsupported transport type: {}", transport_type))),
    };

    let elapsed = start.elapsed().as_millis() as i64;

    match result {
        Ok(()) => {
            // Try listing tools to verify connection
            let tools = state.mcp_manager.list_tools(&connection_id, false).await.ok();
            let tools_count = tools.as_ref().map(|t| t.len()).unwrap_or(0);

            Ok(Json(ConnectivityTestResult {
                status: "connected".to_string(),
                response_time_ms: Some(elapsed),
                error: None,
                endpoint: Some(name),
                server_info: Some(json!({
                    "transport_type": transport_type,
                    "tools_discovered": tools_count,
                })),
            }))
        }
        Err(e) => {
            Ok(Json(ConnectivityTestResult {
                status: "error".to_string(),
                response_time_ms: Some(elapsed),
                error: Some(e.to_string()),
                endpoint: Some(name),
                server_info: None,
            }))
        }
    }
}

async fn get_tools(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
) -> Result<Json<MCPToolsListResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let conn = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    let name = conn.get_str("name").unwrap_or("").to_string();

    // Ensure session is connected
    ensure_session(&state, &conn, &connection_id).await?;

    let tools = state.mcp_manager.list_tools(&connection_id, true).await?;
    let total = tools.len() as i64;

    Ok(Json(MCPToolsListResponse {
        connection_id,
        connection_name: name,
        tools,
        last_discovery: Some(Utc::now()),
        total_tools: total,
    }))
}

async fn execute_tool(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
    Json(payload): Json<MCPToolExecuteRequest>,
) -> Result<Json<MCPToolExecuteResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let conn = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    // Ensure session is connected
    ensure_session(&state, &conn, &connection_id).await?;

    // Always pass arguments as a Map (even if empty) — MCP servers expect an object, not null
    let arguments = Some(payload.parameters.into_iter().collect());

    let start = std::time::Instant::now();
    match state.mcp_manager.call_tool(&connection_id, &payload.tool_name, arguments).await {
        Ok(result) => {
            let elapsed = start.elapsed().as_millis() as i64;
            Ok(Json(MCPToolExecuteResponse {
                success: !result.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false),
                result: Some(result),
                error: None,
                execution_time_ms: Some(elapsed),
                tool_name: payload.tool_name,
                connection_id,
            }))
        }
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as i64;
            Ok(Json(MCPToolExecuteResponse {
                success: false,
                result: None,
                error: Some(e.to_string()),
                execution_time_ms: Some(elapsed),
                tool_name: payload.tool_name,
                connection_id,
            }))
        }
    }
}

async fn get_overview(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Vec<MCPConnectionStatus>>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let mut cursor = collection.find(doc! {
        "$or": [
            { "user_id": &auth_user.id },
            { "is_default": true, "user_id": "system" }
        ]
    }).await?;

    let mut overview = Vec::new();
    while cursor.advance().await? {
        let conn = cursor.deserialize_current()?;
        let cid = conn.get_object_id("_id").map(|id| id.to_hex())
            .or_else(|_| conn.get_str("_id").map(String::from))
            .unwrap_or_default();

        let is_connected = state.mcp_manager.is_connected(&cid).await;
        let tools_count = state.mcp_manager.tools_count(&cid).await;

        overview.push(MCPConnectionStatus {
            connection_id: cid,
            name: conn.get_str("name").unwrap_or("").to_string(),
            transport_type: conn.get_str("transport_type").unwrap_or("unknown").to_string(),
            is_active: conn.get_bool("is_active").unwrap_or(false),
            is_connected,
            last_activity: None,
            tools_count,
            is_default: conn.get_bool("is_default").unwrap_or(false),
        });
    }

    Ok(Json(overview))
}

async fn get_capabilities(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(connection_id): Path<String>,
) -> Result<Json<MCPServerCapabilities>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    let conn = find_connection(&collection, &connection_id, &auth_user.id).await?
        .ok_or_else(|| AppError::NotFound("MCP server connection not found".to_string()))?;

    let name = conn.get_str("name").unwrap_or("").to_string();

    let (supports_tools, supports_resources, supports_prompts) =
        state.mcp_manager.get_capabilities(&connection_id).await.unwrap_or((false, false, false));

    let tools_count = state.mcp_manager.tools_count(&connection_id).await;

    Ok(Json(MCPServerCapabilities {
        connection_id,
        connection_name: name,
        supports_tools,
        supports_resources,
        supports_prompts,
        total_tools: tools_count,
        available_endpoints: vec![],
        last_discovery: None,
    }))
}

/// Helper: ensure an MCP session exists for a connection, creating one if needed
async fn ensure_session(
    state: &AppState,
    conn: &bson::Document,
    connection_id: &str,
) -> Result<(), AppError> {
    // Don't try to connect inactive servers
    if !conn.get_bool("is_active").unwrap_or(true) {
        return Err(AppError::BadRequest(
            "MCP server connection is not active. Enable it first.".to_string(),
        ));
    }

    if state.mcp_manager.is_connected(connection_id).await {
        return Ok(());
    }

    let transport_type = conn.get_str("transport_type").unwrap_or("http");

    match transport_type {
        "stdio" => {
            let command = conn.get_str("stdio_command")
                .map_err(|_| AppError::BadRequest("stdio connection missing stdio_command".to_string()))?
                .to_string();
            let args: Vec<String> = conn.get_array("stdio_args").ok()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            state.mcp_manager.get_or_create_stdio(connection_id, &command, &args, None).await
        }
        "http" => {
            let base_url = conn.get_str("base_url")
                .map_err(|_| AppError::BadRequest("http connection missing base_url".to_string()))?
                .to_string();
            let api_key = conn.get_str("api_key").ok().and_then(|encrypted| {
                decrypt_api_key(&state.config.fernet_key, encrypted).ok()
            });

            state.mcp_manager.get_or_create_http(connection_id, &base_url, api_key.as_deref()).await
        }
        _ => Err(AppError::BadRequest(format!("Unsupported transport type: {}", transport_type))),
    }
}

// Helper: find connection by ID (try ObjectId then string, user then system)
async fn find_connection(
    collection: &mongodb::Collection<bson::Document>,
    connection_id: &str,
    user_id: &str,
) -> Result<Option<bson::Document>, AppError> {
    // Try ObjectId for user
    if let Ok(oid) = ObjectId::parse_str(connection_id) {
        if let Some(doc) = collection.find_one(doc! { "_id": oid, "user_id": user_id }).await? {
            return Ok(Some(doc));
        }
        // Try system default
        if let Some(doc) = collection.find_one(doc! { "_id": oid, "is_default": true, "user_id": "system" }).await? {
            return Ok(Some(doc));
        }
    }
    // Try string ID for user
    if let Some(doc) = collection.find_one(doc! { "_id": connection_id, "user_id": user_id }).await? {
        return Ok(Some(doc));
    }
    // Try string ID for system
    if let Some(doc) = collection.find_one(doc! { "_id": connection_id, "is_default": true, "user_id": "system" }).await? {
        return Ok(Some(doc));
    }
    Ok(None)
}

fn build_id_filter(connection_id: &str, user_id: &str, is_system: bool) -> bson::Document {
    let user_filter = if is_system {
        doc! { "user_id": "system", "is_default": true }
    } else {
        doc! { "user_id": user_id }
    };

    if let Ok(oid) = ObjectId::parse_str(connection_id) {
        let mut f = doc! { "_id": oid };
        f.extend(user_filter);
        f
    } else {
        let mut f = doc! { "_id": connection_id };
        f.extend(user_filter);
        f
    }
}
