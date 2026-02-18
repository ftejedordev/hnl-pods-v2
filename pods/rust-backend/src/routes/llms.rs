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
use crate::db::collections::{DB_NAME, LLMS};
use crate::error::AppError;
use crate::models::llm::*;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_llms).post(create_llm))
        .route("/providers", get(get_providers))
        .route("/migrate-configs", post(migrate_configs))
        .route("/{llm_id}", get(get_llm).put(update_llm).delete(delete_llm))
        .route("/{llm_id}/test", post(test_llm))
}

fn doc_to_llm_response(doc: &bson::Document, _config: &AppConfig) -> Result<LLMResponse, AppError> {
    let config_doc = doc.get_document("config").ok();
    let llm_config: LLMConfig = if let Some(cfg) = config_doc {
        bson::from_document(cfg.clone()).unwrap_or_default()
    } else {
        LLMConfig::default()
    };

    let usage_doc = doc.get_document("usage_stats").ok();
    let usage: LLMUsageStats = if let Some(u) = usage_doc {
        bson::from_document(u.clone()).unwrap_or_default()
    } else {
        LLMUsageStats::default()
    };

    let provider_str = doc.get_str("provider").unwrap_or("anthropic");
    let provider: LLMProvider = serde_json::from_value(json!(provider_str))
        .unwrap_or(LLMProvider::Anthropic);

    let status_str = doc.get_str("status").unwrap_or("inactive");
    let status: LLMStatus = serde_json::from_value(json!(status_str))
        .unwrap_or(LLMStatus::Inactive);

    Ok(LLMResponse {
        id: doc.get_object_id("_id").map(|id| id.to_hex()).unwrap_or_default(),
        user_id: doc.get_str("user_id").unwrap_or("").to_string(),
        name: doc.get_str("name").unwrap_or("").to_string(),
        description: doc.get_str("description").ok().map(String::from),
        provider,
        config: llm_config,
        status,
        usage_stats: usage,
        is_default: doc.get_bool("is_default").unwrap_or(false),
        created_at: doc.get_datetime("created_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        updated_at: doc.get_datetime("updated_at").map(|d| d.to_chrono()).unwrap_or_else(|_| Utc::now()),
        last_tested: doc.get_datetime("last_tested").ok().map(|d| d.to_chrono()),
        test_error: doc.get_str("test_error").ok().map(String::from),
    })
}

use crate::config::AppConfig;

async fn get_llms(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let mut cursor = collection
        .find(doc! { "user_id": &auth_user.id })
        .await?;

    let mut llms = Vec::new();
    while cursor.advance().await? {
        let doc = cursor.deserialize_current()?;
        llms.push(doc_to_llm_response(&doc, &state.config)?);
    }

    let total = llms.len() as i64;
    Ok(Json(json!({ "llms": llms, "total": total })))
}

async fn get_llm(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(llm_id): Path<String>,
) -> Result<Json<LLMResponse>, AppError> {
    let oid = ObjectId::parse_str(&llm_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let doc = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("LLM not found".to_string()))?;

    Ok(Json(doc_to_llm_response(&doc, &state.config)?))
}

async fn create_llm(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(payload): Json<LLMCreate>,
) -> Result<Json<LLMResponse>, AppError> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name cannot be empty".to_string()));
    }
    let api_key = payload.api_key.trim().to_string();
    if api_key.is_empty() {
        return Err(AppError::BadRequest("API key cannot be empty".to_string()));
    }

    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    // Encrypt API key
    let encrypted = encrypt_api_key(&state.config.fernet_key, &api_key)?;

    let config = payload.config.unwrap_or_default();
    let config_bson = bson::to_bson(&config)
        .map_err(|e| AppError::Internal(format!("Failed to serialize config: {}", e)))?;

    let usage = LLMUsageStats::default();
    let usage_bson = bson::to_bson(&usage)
        .map_err(|e| AppError::Internal(format!("Failed to serialize usage: {}", e)))?;

    let provider_str = serde_json::to_value(&payload.provider)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .as_str()
        .unwrap_or("anthropic")
        .to_string();

    let now = bson::DateTime::from_chrono(Utc::now());

    let llm_doc = doc! {
        "user_id": &auth_user.id,
        "name": &name,
        "description": payload.description.as_deref(),
        "provider": &provider_str,
        "api_key_encrypted": &encrypted,
        "config": config_bson,
        "status": "inactive",
        "usage_stats": usage_bson,
        "is_default": payload.is_default,
        "created_at": now,
        "updated_at": now,
    };

    let result = collection.insert_one(llm_doc).await?;
    let inserted_id = result.inserted_id.as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get inserted ID".to_string()))?;

    let created = collection
        .find_one(doc! { "_id": inserted_id })
        .await?
        .ok_or_else(|| AppError::Internal("Failed to retrieve created LLM".to_string()))?;

    Ok(Json(doc_to_llm_response(&created, &state.config)?))
}

async fn update_llm(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(llm_id): Path<String>,
    Json(payload): Json<LLMUpdate>,
) -> Result<Json<LLMResponse>, AppError> {
    let oid = ObjectId::parse_str(&llm_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let _existing = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("LLM not found".to_string()))?;

    let mut update_doc = doc! { "updated_at": bson::DateTime::from_chrono(Utc::now()) };

    if let Some(ref name) = payload.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(AppError::BadRequest("Name cannot be empty".to_string()));
        }
        update_doc.insert("name", trimmed);
    }

    if let Some(ref desc) = payload.description {
        update_doc.insert("description", desc);
    }

    if let Some(ref api_key) = payload.api_key {
        let trimmed = api_key.trim();
        if trimmed.is_empty() {
            return Err(AppError::BadRequest("API key cannot be empty".to_string()));
        }
        let encrypted = encrypt_api_key(&state.config.fernet_key, trimmed)?;
        update_doc.insert("api_key_encrypted", encrypted);
    }

    if let Some(ref config) = payload.config {
        let config_bson = bson::to_bson(config)
            .map_err(|e| AppError::Internal(format!("Failed to serialize config: {}", e)))?;
        update_doc.insert("config", config_bson);
    }

    if let Some(ref status) = payload.status {
        let status_str = serde_json::to_value(status)
            .map_err(|e| AppError::Internal(e.to_string()))?
            .as_str()
            .unwrap_or("inactive")
            .to_string();
        update_doc.insert("status", status_str);
    }

    if let Some(is_default) = payload.is_default {
        update_doc.insert("is_default", is_default);
    }

    collection.update_one(doc! { "_id": oid }, doc! { "$set": update_doc }).await?;

    let updated = collection
        .find_one(doc! { "_id": oid })
        .await?
        .ok_or_else(|| AppError::NotFound("LLM not found after update".to_string()))?;

    Ok(Json(doc_to_llm_response(&updated, &state.config)?))
}

async fn delete_llm(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(llm_id): Path<String>,
) -> Result<Json<Value>, AppError> {
    let oid = ObjectId::parse_str(&llm_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let result = collection
        .delete_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?;

    if result.deleted_count == 0 {
        return Err(AppError::NotFound("LLM not found".to_string()));
    }

    Ok(Json(json!({ "message": "LLM deleted successfully" })))
}

async fn test_llm(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(llm_id): Path<String>,
    Json(payload): Json<LLMTestRequest>,
) -> Result<Json<LLMTestResponse>, AppError> {
    let oid = ObjectId::parse_str(&llm_id)?;
    let db = state.mongo_client.database(DB_NAME);
    let collection = db.collection::<bson::Document>(LLMS);

    let llm_doc = collection
        .find_one(doc! { "_id": oid, "user_id": &auth_user.id })
        .await?
        .ok_or_else(|| AppError::NotFound("LLM not found".to_string()))?;

    // Decrypt API key
    let encrypted = llm_doc.get_str("api_key_encrypted")
        .map_err(|_| AppError::Internal("No API key found".to_string()))?;
    let api_key = decrypt_api_key(&state.config.fernet_key, encrypted)?;

    let provider_str = llm_doc.get_str("provider").unwrap_or("anthropic");
    let config_doc = llm_doc.get_document("config").ok();
    let model_name = config_doc
        .and_then(|c| c.get_str("model_name").ok())
        .unwrap_or("claude-sonnet-4-5-20250929");

    let test_prompt = payload.test_prompt.unwrap_or_else(|| "Hello, this is a test.".to_string());
    let start = std::time::Instant::now();

    let client = reqwest::Client::new();

    let result = match provider_str {
        "anthropic" => {
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&json!({
                    "model": model_name,
                    "max_tokens": 100,
                    "messages": [{ "role": "user", "content": test_prompt }]
                }))
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    let body: Value = r.json().await.unwrap_or_default();
                    let text = body["content"][0]["text"].as_str().unwrap_or("").to_string();
                    Ok((text, model_name.to_string()))
                }
                Ok(r) => {
                    let status = r.status();
                    let body = r.text().await.unwrap_or_default();
                    Err(format!("API error {}: {}", status, body))
                }
                Err(e) => Err(format!("Request failed: {}", e)),
            }
        }
        "openai" => {
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&json!({
                    "model": model_name,
                    "max_tokens": 100,
                    "messages": [{ "role": "user", "content": test_prompt }]
                }))
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    let body: Value = r.json().await.unwrap_or_default();
                    let text = body["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
                    Ok((text, model_name.to_string()))
                }
                Ok(r) => {
                    let status = r.status();
                    let body = r.text().await.unwrap_or_default();
                    Err(format!("API error {}: {}", status, body))
                }
                Err(e) => Err(format!("Request failed: {}", e)),
            }
        }
        "openrouter" => {
            let resp = client
                .post("https://openrouter.ai/api/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", api_key))
                .header("HTTP-Referer", "https://hypernovalabs.io")
                .header("X-Title", "HypernovaLabs Pods")
                .header("content-type", "application/json")
                .json(&json!({
                    "model": model_name,
                    "max_tokens": 100,
                    "messages": [{ "role": "user", "content": test_prompt }]
                }))
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    let body: Value = r.json().await.unwrap_or_default();
                    let text = body["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
                    Ok((text, model_name.to_string()))
                }
                Ok(r) => {
                    let status = r.status();
                    let body = r.text().await.unwrap_or_default();
                    Err(format!("API error {}: {}", status, body))
                }
                Err(e) => Err(format!("Request failed: {}", e)),
            }
        }
        _ => Err(format!("Provider '{}' test not yet implemented", provider_str)),
    };

    let latency = start.elapsed().as_millis() as i64;

    // Update last_tested in DB
    let now = bson::DateTime::from_chrono(Utc::now());
    match &result {
        Ok(_) => {
            collection.update_one(
                doc! { "_id": oid },
                doc! { "$set": { "last_tested": now, "status": "active", "test_error": bson::Bson::Null } },
            ).await.ok();
        }
        Err(ref err) => {
            collection.update_one(
                doc! { "_id": oid },
                doc! { "$set": { "last_tested": now, "status": "error", "test_error": err } },
            ).await.ok();
        }
    }

    match result {
        Ok((text, model)) => Ok(Json(LLMTestResponse {
            success: true,
            response_text: Some(text),
            error: None,
            latency_ms: Some(latency),
            model_used: Some(model),
        })),
        Err(err) => Ok(Json(LLMTestResponse {
            success: false,
            response_text: None,
            error: Some(err),
            latency_ms: Some(latency),
            model_used: None,
        })),
    }
}

async fn get_providers() -> Json<LLMProvidersResponse> {
    Json(LLMProvidersResponse {
        providers: vec![
            LLMProviderInfo {
                provider: LLMProvider::Anthropic,
                name: "Anthropic".to_string(),
                description: "Claude models by Anthropic".to_string(),
                documentation_url: "https://docs.anthropic.com".to_string(),
                api_key_url: "https://console.anthropic.com/settings/keys".to_string(),
                required_fields: vec!["api_key".to_string()],
                optional_fields: vec!["model_name".to_string(), "max_tokens".to_string(), "temperature".to_string()],
                supported_models: Some(vec![
                    "claude-sonnet-4-5-20250929".to_string(),
                    "claude-opus-4-6".to_string(),
                    "claude-3-5-haiku-20241022".to_string(),
                ]),
            },
            LLMProviderInfo {
                provider: LLMProvider::Openai,
                name: "OpenAI".to_string(),
                description: "GPT models by OpenAI".to_string(),
                documentation_url: "https://platform.openai.com/docs".to_string(),
                api_key_url: "https://platform.openai.com/api-keys".to_string(),
                required_fields: vec!["api_key".to_string()],
                optional_fields: vec!["model_name".to_string(), "max_tokens".to_string(), "temperature".to_string(), "organization_id".to_string()],
                supported_models: Some(vec![
                    "gpt-4o".to_string(),
                    "gpt-4o-mini".to_string(),
                    "gpt-4-turbo".to_string(),
                    "o1".to_string(),
                    "o1-mini".to_string(),
                ]),
            },
            LLMProviderInfo {
                provider: LLMProvider::Openrouter,
                name: "OpenRouter".to_string(),
                description: "Multi-model router for various LLMs".to_string(),
                documentation_url: "https://openrouter.ai/docs".to_string(),
                api_key_url: "https://openrouter.ai/keys".to_string(),
                required_fields: vec!["api_key".to_string()],
                optional_fields: vec!["model_name".to_string(), "max_tokens".to_string(), "temperature".to_string(), "site_url".to_string(), "app_name".to_string()],
                supported_models: None,
            },
            LLMProviderInfo {
                provider: LLMProvider::Custom,
                name: "Custom (OpenAI Compatible)".to_string(),
                description: "Any OpenAI-compatible API endpoint".to_string(),
                documentation_url: "".to_string(),
                api_key_url: "".to_string(),
                required_fields: vec!["api_key".to_string(), "base_url".to_string()],
                optional_fields: vec!["model_name".to_string(), "max_tokens".to_string(), "temperature".to_string(), "headers".to_string()],
                supported_models: None,
            },
            LLMProviderInfo {
                provider: LLMProvider::ClaudeCli,
                name: "Claude CLI".to_string(),
                description: "Use Claude CLI as LLM provider (requires claude CLI installed)".to_string(),
                documentation_url: "https://claude.ai/claude-code".to_string(),
                api_key_url: "".to_string(),
                required_fields: vec![],
                optional_fields: vec![],
                supported_models: None,
            },
        ],
    })
}

async fn migrate_configs() -> Json<Value> {
    Json(json!({ "message": "Migration not needed for Rust backend" }))
}
