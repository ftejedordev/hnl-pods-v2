use axum::{extract::State, routing::{get, post}, Json, Router};
use chrono::Utc;
use mongodb::bson::doc;
use serde_json::{json, Value};

use crate::auth::jwt::create_access_token;
use crate::auth::middleware::AuthUser;
use crate::auth::password::{hash_password, verify_password};
use crate::db::collections::{DB_NAME, USERS};
use crate::error::AppError;
use crate::models::user::{Token, User, UserLogin, UserRegister};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
        .route("/license-status", get(license_status))
}

async fn register(
    State(state): State<AppState>,
    Json(payload): Json<UserRegister>,
) -> Result<Json<Value>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let users = db.collection::<bson::Document>(USERS);

    let username = payload.username.trim().to_string();

    // Check if username already exists
    let existing = users
        .find_one(doc! { "username": &username })
        .await?;
    if existing.is_some() {
        return Err(AppError::BadRequest("Username already registered".to_string()));
    }

    // Validate password
    if payload.password.len() < 6 {
        return Err(AppError::BadRequest(
            "Password must be at least 6 characters long".to_string(),
        ));
    }

    // Hash password and create user
    let hashed = hash_password(&payload.password)?;
    let now = Utc::now();

    let user_doc = doc! {
        "username": &username,
        "hashed_password": &hashed,
        "created_at": bson::DateTime::from_chrono(now),
        "role": "user",
    };

    let result = users.insert_one(user_doc).await?;
    let user_id = result
        .inserted_id
        .as_object_id()
        .map(|id| id.to_hex())
        .unwrap_or_default();

    // Sync to Supabase (non-blocking — don't fail registration if Supabase is down)
    if let (Some(url), Some(key)) = (&state.config.supabase_url, &state.config.supabase_key) {
        let license_svc = crate::services::license_service::LicenseService::new(url, key);
        if let Err(e) = license_svc.register_license(&username).await {
            tracing::warn!("Failed to sync license to Supabase: {}", e);
        }
    }

    Ok(Json(json!({
        "message": "User registered successfully",
        "user_id": user_id
    })))
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<UserLogin>,
) -> Result<Json<Token>, AppError> {
    let db = state.mongo_client.database(DB_NAME);
    let users = db.collection::<bson::Document>(USERS);

    let username = payload.username.trim().to_string();

    // Find user
    let user_doc = users
        .find_one(doc! { "username": &username })
        .await?
        .ok_or_else(|| AppError::Unauthorized("Incorrect username or password".to_string()))?;

    // Verify password
    let stored_hash = user_doc
        .get_str("hashed_password")
        .map_err(|_| AppError::Internal("Invalid user record".to_string()))?;

    let valid = verify_password(&payload.password, stored_hash)?;
    if !valid {
        return Err(AppError::Unauthorized(
            "Incorrect username or password".to_string(),
        ));
    }

    // Check license in Supabase (if configured)
    if let (Some(url), Some(key)) = (&state.config.supabase_url, &state.config.supabase_key) {
        let license_svc = crate::services::license_service::LicenseService::new(url, key);
        match license_svc.check_license(&username).await {
            Ok(true) => { /* License active — proceed */ }
            Ok(false) => {
                return Err(AppError::Forbidden(
                    "Tu licencia no está activa. Contacta al administrador.".to_string(),
                ));
            }
            Err(e) => {
                tracing::warn!("License check failed, allowing access: {}", e);
                // Fail-open: if Supabase is unreachable, allow login
            }
        }
    }

    // Create JWT
    let token = create_access_token(
        &username,
        &state.config.jwt_secret_key,
        state.config.jwt_expire_minutes,
    )?;

    Ok(Json(Token {
        access_token: token,
        token_type: "bearer".to_string(),
    }))
}

async fn me(auth_user: AuthUser) -> Json<User> {
    Json(User {
        id: auth_user.id,
        username: auth_user.username,
        created_at: Utc::now(), // TODO: fetch from DB
    })
}

async fn license_status(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> Result<Json<Value>, AppError> {
    // If Supabase is not configured, always return active
    let (Some(url), Some(key)) = (&state.config.supabase_url, &state.config.supabase_key) else {
        return Ok(Json(json!({ "active": true })));
    };

    let license_svc = crate::services::license_service::LicenseService::new(url, key);
    match license_svc.check_license(&auth_user.username).await {
        Ok(active) => Ok(Json(json!({ "active": active }))),
        Err(e) => {
            tracing::warn!("License status check failed: {}", e);
            // Fail-closed: if Supabase is unreachable, report inactive
            Ok(Json(json!({ "active": false })))
        }
    }
}
