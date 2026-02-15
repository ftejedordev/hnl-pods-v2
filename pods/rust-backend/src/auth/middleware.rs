use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};

use crate::auth::jwt::decode_token;
use crate::db::collections::{DB_NAME, USERS};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Extract Bearer token from Authorization header
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing authorization header".to_string()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Invalid authorization format".to_string()))?;

        // Decode JWT
        let claims = decode_token(token, &state.config.jwt_secret_key)
            .map_err(|_| AppError::Unauthorized("Invalid or expired token".to_string()))?;

        // Look up user in MongoDB
        let db = state.mongo_client.database(DB_NAME);
        let users = db.collection::<bson::Document>(USERS);

        let user_doc = users
            .find_one(doc! { "username": &claims.sub })
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;

        let user_id = user_doc
            .get_object_id("_id")
            .map_err(|_| AppError::Internal("Invalid user ID in database".to_string()))?;

        Ok(AuthUser {
            id: user_id.to_hex(),
            username: claims.sub,
        })
    }
}
