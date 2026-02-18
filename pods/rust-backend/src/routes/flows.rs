use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use bson::oid::ObjectId;
use chrono::Utc;
use mongodb::bson::doc;
use serde_json::{json, Value};

use crate::auth::middleware::AuthUser;
use crate::db::collections::{DB_NAME, FLOWS};
use crate::error::AppError;
use crate::models::flow::*;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_flows).post(create_flow))
        .route("/{flow_id}", get(get_flow).put(update_flow).delete(delete_flow))
        .route("/{flow_id}/execute", post(execute_flow))
}

async fn get_flows(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Vec<FlowResponse>>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let mut cursor = collection.find(doc! { "user_id": &auth_user.id }).await?;
    let mut flows = Vec::new();

    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        if let Ok(resp) = doc_to_flow_response(&doc) {
            flows.push(resp);
        }
    }

    Ok(Json(flows))
}

async fn get_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_id): Path<String>,
) -> Result<Json<FlowResponse>, AppError> {
    let oid = ObjectId::parse_str(&flow_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let doc = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Flow not found".to_string()))?;

    Ok(Json(doc_to_flow_response(&doc)?))
}

async fn create_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(payload): Json<FlowCreate>,
) -> Result<Json<FlowResponse>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let _now = bson::DateTime::from_chrono(Utc::now());

    let flow = Flow {
        id: None,
        user_id: auth_user.id.clone(),
        name: payload.name,
        description: payload.description,
        steps: payload.steps,
        start_step_id: payload.start_step_id,
        variables: payload.variables,
        metadata: payload.metadata,
        edge_metadata: payload.edge_metadata,
        is_active: true,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
    };

    let flow_bson = bson::to_document(&flow)
        .map_err(|e| AppError::Internal(format!("Serialization error: {}", e)))?;

    let result = collection.insert_one(flow_bson).await?;
    let inserted_id = result.inserted_id.as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    let created = collection
        .find_one(doc! { "_id": inserted_id })
        .await?
        .ok_or_else(|| AppError::Internal("Failed to retrieve created flow".to_string()))?;

    Ok(Json(doc_to_flow_response(&created)?))
}

async fn update_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_id): Path<String>,
    Json(payload): Json<FlowUpdate>,
) -> Result<Json<FlowResponse>, AppError> {
    let oid = ObjectId::parse_str(&flow_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    // Verify ownership
    collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("Flow not found".to_string()))?;

    let mut update_doc = doc! { "updated_at": bson::DateTime::from_chrono(Utc::now()) };

    if let Some(ref name) = payload.name { update_doc.insert("name", name); }
    if let Some(ref desc) = payload.description { update_doc.insert("description", desc); }
    if let Some(ref steps) = payload.steps {
        let steps_bson = bson::to_bson(steps).map_err(|e| AppError::Internal(e.to_string()))?;
        update_doc.insert("steps", steps_bson);
    }
    if let Some(ref start) = payload.start_step_id { update_doc.insert("start_step_id", start); }
    if let Some(ref vars) = payload.variables {
        let vars_bson = bson::to_bson(vars).map_err(|e| AppError::Internal(e.to_string()))?;
        update_doc.insert("variables", vars_bson);
    }
    if let Some(ref meta) = payload.metadata {
        let meta_bson = bson::to_bson(meta).map_err(|e| AppError::Internal(e.to_string()))?;
        update_doc.insert("metadata", meta_bson);
    }
    if let Some(ref edges) = payload.edge_metadata {
        let edges_bson = bson::to_bson(edges).map_err(|e| AppError::Internal(e.to_string()))?;
        update_doc.insert("edge_metadata", edges_bson);
    }
    if let Some(active) = payload.is_active { update_doc.insert("is_active", active); }

    collection.update_one(doc! { "_id": oid }, doc! { "$set": update_doc }).await?;

    let updated = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("Flow not found after update".to_string()))?;

    Ok(Json(doc_to_flow_response(&updated)?))
}

async fn delete_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let oid = ObjectId::parse_str(&flow_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(FLOWS);

    let result = collection
        .delete_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?;

    if result.deleted_count == 0 {
        return Err(AppError::NotFound("Flow not found".to_string()));
    }

    Ok(Json(json!({ "message": "Flow deleted successfully" })))
}

async fn execute_flow(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(flow_id): Path<String>,
    Json(payload): Json<FlowExecutionCreate>,
) -> Result<Json<Value>, AppError> {
    let execution_id = state.flow_service.execute_flow(
        &flow_id,
        &auth_user.id,
        payload.input_data,
        payload.variables,
    ).await?;

    Ok(Json(json!({
        "id": execution_id,
        "execution_id": execution_id,
        "flow_id": flow_id,
        "status": "running",
        "stream_url": format!("/api/executions/{}/stream", execution_id),
    })))
}

fn doc_to_flow_response(doc: &bson::Document) -> Result<FlowResponse, AppError> {
    // Extract dates manually from bson::DateTime to avoid deserialization issues
    let created_at = doc.get_datetime("created_at")
        .map(|d| d.to_chrono())
        .unwrap_or_else(|_| Utc::now());
    let updated_at = doc.get_datetime("updated_at")
        .map(|d| d.to_chrono())
        .unwrap_or_else(|_| Utc::now());

    // Remove date fields before deserializing the rest
    let mut doc_without_dates = doc.clone();
    doc_without_dates.remove("created_at");
    doc_without_dates.remove("updated_at");

    let flow: Flow = bson::from_document(doc_without_dates)
        .map_err(|e| AppError::Internal(format!("Failed to deserialize flow: {}", e)))?;

    Ok(FlowResponse {
        id: doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
        user_id: flow.user_id,
        name: flow.name,
        description: flow.description,
        steps: flow.steps,
        start_step_id: flow.start_step_id,
        variables: flow.variables,
        metadata: flow.metadata,
        edge_metadata: flow.edge_metadata,
        is_active: flow.is_active,
        created_at,
        updated_at,
    })
}
