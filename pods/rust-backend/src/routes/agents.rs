use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use bson::oid::ObjectId;
use chrono::Utc;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::middleware::AuthUser;
use crate::db::collections::{AGENTS, DB_NAME, LLMS};
use crate::error::AppError;
use crate::models::agent::{AgentCreate, AgentResponse, AgentUpdate};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_agents).post(create_agent))
        .route("/{agent_id}", get(get_agent).put(update_agent).delete(delete_agent))
        .route("/{agent_id}/debug-tools", get(debug_agent_tools))
}

pub fn legacy_router() -> Router<AppState> {
    Router::new().route("/list", get(list_agents_legacy))
}

#[derive(Debug, Deserialize)]
struct AgentQuery {
    #[serde(default)]
    user_only: bool,
    #[serde(default)]
    defaults_only: bool,
}

fn doc_to_agent_response(agent: &bson::Document) -> AgentResponse {
    let mcp_connections: Vec<String> = agent
        .get_array("mcp_connections")
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from).or_else(|| v.as_object_id().map(|o| o.to_hex()))).collect())
        .unwrap_or_default();

    let rag_documents: Vec<i64> = agent
        .get_array("rag_documents")
        .map(|arr| arr.iter().filter_map(|v| v.as_i64().or_else(|| v.as_i32().map(|i| i as i64))).collect())
        .unwrap_or_default();

    AgentResponse {
        id: agent.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
        user_id: agent.get_str("user_id").unwrap_or("").to_string(),
        name: agent.get_str("name").unwrap_or("").to_string(),
        description: agent.get_str("description").unwrap_or("").to_string(),
        llm_id: agent.get_str("llm_id").ok().map(String::from),
        mcp_connections,
        rag_documents,
        color: agent.get_str("color").unwrap_or("#3B82F6").to_string(),
        avatar_url: agent.get_str("avatar_url").ok().map(String::from),
        role: agent.get_str("role").ok().map(String::from),
        system_prompt: agent.get_str("system_prompt").ok().map(String::from),
        is_default: agent.get_bool("is_default").unwrap_or(false),
        created_at: agent.get_datetime("created_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        updated_at: agent.get_datetime("updated_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
    }
}

async fn get_agents(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Query(params): Query<AgentQuery>,
) -> Result<Json<Vec<AgentResponse>>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(AGENTS);

    let query = if params.user_only {
        doc! { "user_id": &auth_user.id }
    } else if params.defaults_only {
        doc! { "is_default": true }
    } else {
        doc! { "$or": [ { "user_id": &auth_user.id }, { "is_default": true } ] }
    };

    let mut cursor = collection.find(query).await?;
    let mut agents = Vec::new();
    while cursor.advance().await? {
        let agent = cursor.deserialize_current()?;
        agents.push(doc_to_agent_response(&agent));
    }

    Ok(Json(agents))
}

async fn get_agent(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(agent_id): Path<String>,
) -> Result<Json<AgentResponse>, AppError> {
    let oid = ObjectId::parse_str(&agent_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(AGENTS);

    let agent = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".to_string()))?;

    let is_default = agent.get_bool("is_default").unwrap_or(false);
    let owner = agent.get_str("user_id").unwrap_or("");
    if !is_default && owner != auth_user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    Ok(Json(doc_to_agent_response(&agent)))
}

async fn create_agent(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(payload): Json<AgentCreate>,
) -> Result<Json<AgentResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let agents = db.collection::<bson::Document>(AGENTS);

    // Check duplicate name
    let existing = agents
        .find_one(doc! { "name": &payload.name, "user_id": &auth_user.id })
        .await?;
    if existing.is_some() {
        return Err(AppError::BadRequest("Agent with this name already exists".to_string()));
    }

    // Validate LLM
    if let Some(ref llm_id) = payload.llm_id {
        let llms = db.collection::<bson::Document>(LLMS);
        let oid = ObjectId::parse_str(llm_id)?;
        let llm = llms.find_one(doc! { "_id": oid, "user_id": &auth_user.id }).await?;
        if llm.is_none() {
            return Err(AppError::BadRequest("LLM not found or not accessible".to_string()));
        }
    }

    let now = bson::DateTime::from_chrono(Utc::now());
    let mcp_arr: Vec<bson::Bson> = payload.mcp_connections.iter().map(|s| bson::Bson::String(s.clone())).collect();
    let rag_arr: Vec<bson::Bson> = payload.rag_documents.iter().map(|&i| bson::Bson::Int64(i)).collect();

    let agent_doc = doc! {
        "user_id": &auth_user.id,
        "name": &payload.name,
        "description": &payload.description,
        "llm_id": payload.llm_id.as_deref(),
        "mcp_connections": mcp_arr,
        "rag_documents": rag_arr,
        "color": payload.color.as_deref().unwrap_or("#3B82F6"),
        "avatar_url": payload.avatar_url.as_deref(),
        "role": payload.role.as_deref(),
        "system_prompt": payload.system_prompt.as_deref(),
        "is_default": false,
        "created_at": now,
        "updated_at": now,
    };

    let result = agents.insert_one(agent_doc).await?;
    let inserted_id = result.inserted_id.as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    let created = agents
        .find_one(doc! { "_id": inserted_id })
        .await?
        .ok_or_else(|| AppError::Internal("Failed to retrieve created agent".to_string()))?;

    Ok(Json(doc_to_agent_response(&created)))
}

async fn update_agent(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(agent_id): Path<String>,
    Json(payload): Json<AgentUpdate>,
) -> Result<Json<AgentResponse>, AppError> {
    let oid = ObjectId::parse_str(&agent_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let agents = db.collection::<bson::Document>(AGENTS);

    let existing = agents
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".to_string()))?;

    let is_default = existing.get_bool("is_default").unwrap_or(false);
    let owner = existing.get_str("user_id").unwrap_or("");

    if !is_default && owner != auth_user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    let mut update_doc = doc! { "updated_at": bson::DateTime::from_chrono(Utc::now()) };

    if let Some(ref name) = payload.name {
        if !is_default {
            let name_exists = agents
                .find_one(doc! { "name": name, "user_id": &auth_user.id, "_id": { "$ne": oid } })
                .await?;
            if name_exists.is_some() {
                return Err(AppError::BadRequest("Agent with this name already exists".to_string()));
            }
            update_doc.insert("name", name);
        }
    }

    if let Some(ref desc) = payload.description {
        if !is_default { update_doc.insert("description", desc); }
    }

    if let Some(ref llm_id) = payload.llm_id {
        if !llm_id.is_empty() {
            let llm_oid = ObjectId::parse_str(llm_id)?;
            let llms = db.collection::<bson::Document>(LLMS);
            let llm = llms.find_one(doc! { "_id": llm_oid, "user_id": &auth_user.id }).await?;
            if llm.is_none() {
                return Err(AppError::BadRequest("LLM not found or not accessible".to_string()));
            }
        }
        update_doc.insert("llm_id", llm_id);
    }

    if let Some(ref mcp) = payload.mcp_connections {
        let arr: Vec<bson::Bson> = mcp.iter().map(|s| bson::Bson::String(s.clone())).collect();
        update_doc.insert("mcp_connections", arr);
    }

    if let Some(ref rag) = payload.rag_documents {
        let arr: Vec<bson::Bson> = rag.iter().map(|&i| bson::Bson::Int64(i)).collect();
        update_doc.insert("rag_documents", arr);
    }

    if let Some(ref color) = payload.color {
        if !is_default { update_doc.insert("color", color); }
    }
    if let Some(ref avatar) = payload.avatar_url {
        if !is_default { update_doc.insert("avatar_url", avatar); }
    }
    if let Some(ref role) = payload.role {
        if !is_default { update_doc.insert("role", role); }
    }
    if let Some(ref sp) = payload.system_prompt {
        if !is_default { update_doc.insert("system_prompt", sp); }
    }

    agents.update_one(doc! { "_id": oid }, doc! { "$set": update_doc }).await?;

    let updated = agents
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found after update".to_string()))?;

    Ok(Json(doc_to_agent_response(&updated)))
}

async fn delete_agent(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(agent_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let oid = ObjectId::parse_str(&agent_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let agents = db.collection::<bson::Document>(AGENTS);

    let existing = agents
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".to_string()))?;

    if existing.get_str("user_id").unwrap_or("") != auth_user.id {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    if existing.get_bool("is_default").unwrap_or(false) {
        return Err(AppError::BadRequest("Cannot delete default agents".to_string()));
    }

    agents.delete_one(doc! { "_id": oid }).await?;
    Ok(Json(json!({ "message": "Agent deleted successfully" })))
}

async fn debug_agent_tools(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    Path(agent_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let oid = ObjectId::parse_str(&agent_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    let agent = agents_col
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Agent not found".to_string()))?;

    let mcp_conns = agent.get_array("mcp_connections").ok()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
        .unwrap_or_default();

    let mut all_tools = Vec::new();
    let mut connection_status = Vec::new();

    for conn_id in &mcp_conns {
        let connected = state.mcp_manager.is_connected(conn_id).await;
        let tools_count = state.mcp_manager.tools_count(conn_id).await;
        connection_status.push(json!({
            "connection_id": conn_id,
            "connected": connected,
            "tools_count": tools_count,
        }));

        if connected {
            if let Ok(tools) = state.mcp_manager.list_tools(conn_id, false).await {
                for tool in tools {
                    all_tools.push(json!({
                        "name": tool.name,
                        "description": tool.description,
                        "connection_id": conn_id,
                    }));
                }
            }
        }
    }

    Ok(Json(json!({
        "agent_id": agent_id,
        "agent_name": agent.get_str("name").unwrap_or(""),
        "mcp_connections": connection_status,
        "available_tools": all_tools,
        "total_tools": all_tools.len(),
    })))
}

async fn list_agents_legacy() -> Json<Value> {
    Json(json!({
        "agents": [{
            "name": "basic_dev_agent",
            "description": "An agent that performs basic development tasks.",
            "config": { "functions": ["basic_agent_function"] },
            "active": true
        }]
    }))
}
