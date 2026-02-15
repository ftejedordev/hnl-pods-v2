use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Conflict(String),
    Internal(String),
    Database(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
            AppError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            AppError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            AppError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            AppError::Internal(msg) => write!(f, "Internal Error: {}", msg),
            AppError::Database(msg) => write!(f, "Database Error: {}", msg),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            AppError::Database(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
        };

        tracing::error!("{}", self);
        (status, Json(json!({ "detail": message }))).into_response()
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(e: mongodb::error::Error) -> Self {
        AppError::Database(e.to_string())
    }
}

impl From<bson::oid::Error> for AppError {
    fn from(e: bson::oid::Error) -> Self {
        AppError::BadRequest(format!("Invalid ObjectId: {}", e))
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(e: jsonwebtoken::errors::Error) -> Self {
        AppError::Unauthorized(format!("JWT error: {}", e))
    }
}

impl From<bcrypt::BcryptError> for AppError {
    fn from(e: bcrypt::BcryptError) -> Self {
        AppError::Internal(format!("Bcrypt error: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn test_error_display() {
        assert_eq!(
            format!("{}", AppError::BadRequest("invalid".to_string())),
            "Bad Request: invalid"
        );
        assert_eq!(
            format!("{}", AppError::Unauthorized("no auth".to_string())),
            "Unauthorized: no auth"
        );
        assert_eq!(
            format!("{}", AppError::NotFound("missing".to_string())),
            "Not Found: missing"
        );
        assert_eq!(
            format!("{}", AppError::Forbidden("denied".to_string())),
            "Forbidden: denied"
        );
    }

    #[test]
    fn test_error_into_response_status_codes() {
        // We can test the status code mapping by checking the Response
        let test_cases = vec![
            (AppError::BadRequest("test".into()), StatusCode::BAD_REQUEST),
            (AppError::Unauthorized("test".into()), StatusCode::UNAUTHORIZED),
            (AppError::Forbidden("test".into()), StatusCode::FORBIDDEN),
            (AppError::NotFound("test".into()), StatusCode::NOT_FOUND),
            (AppError::Conflict("test".into()), StatusCode::CONFLICT),
            (AppError::Internal("test".into()), StatusCode::INTERNAL_SERVER_ERROR),
            (AppError::Database("test".into()), StatusCode::INTERNAL_SERVER_ERROR),
        ];

        for (error, expected_status) in test_cases {
            let response = error.into_response();
            assert_eq!(response.status(), expected_status);
        }
    }

    #[test]
    fn test_bson_oid_error_conversion() {
        let bad_oid = bson::oid::ObjectId::parse_str("not_valid");
        assert!(bad_oid.is_err());

        let app_error: AppError = bad_oid.unwrap_err().into();
        match app_error {
            AppError::BadRequest(msg) => assert!(msg.contains("Invalid ObjectId")),
            _ => panic!("Expected BadRequest"),
        }
    }
}
