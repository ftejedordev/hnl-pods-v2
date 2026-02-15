use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // username
    pub exp: usize,
    pub iat: usize,
}

pub fn create_access_token(
    username: &str,
    secret: &str,
    expire_minutes: i64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let exp = now + Duration::minutes(expire_minutes);

    let claims = Claims {
        sub: username.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    encode(
        &Header::default(), // HS256
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn decode_token(
    token: &str,
    secret: &str,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SECRET: &str = "test_secret_key_for_jwt_testing";

    #[test]
    fn test_create_and_decode_token() {
        let token = create_access_token("testuser", TEST_SECRET, 60).unwrap();
        assert!(!token.is_empty());

        let claims = decode_token(&token, TEST_SECRET).unwrap();
        assert_eq!(claims.sub, "testuser");
        assert!(claims.exp > claims.iat);
    }

    #[test]
    fn test_token_expiry_is_correct() {
        let expire_minutes = 120;
        let token = create_access_token("user1", TEST_SECRET, expire_minutes).unwrap();
        let claims = decode_token(&token, TEST_SECRET).unwrap();

        let diff = claims.exp - claims.iat;
        // Should be approximately 120 minutes = 7200 seconds (allow 5s tolerance)
        assert!(diff >= 7195 && diff <= 7205, "Expected ~7200s, got {}s", diff);
    }

    #[test]
    fn test_decode_with_wrong_secret_fails() {
        let token = create_access_token("testuser", TEST_SECRET, 60).unwrap();
        let result = decode_token(&token, "wrong_secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_invalid_token_fails() {
        let result = decode_token("not.a.valid.token", TEST_SECRET);
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_empty_token_fails() {
        let result = decode_token("", TEST_SECRET);
        assert!(result.is_err());
    }

    #[test]
    fn test_expired_token_fails() {
        // Create a token that expired 5 minutes ago (beyond default 60s leeway)
        let token = create_access_token("testuser", TEST_SECRET, -5).unwrap();
        let result = decode_token(&token, TEST_SECRET);
        assert!(result.is_err());
    }

    #[test]
    fn test_different_users_get_different_tokens() {
        let token1 = create_access_token("user1", TEST_SECRET, 60).unwrap();
        let token2 = create_access_token("user2", TEST_SECRET, 60).unwrap();
        assert_ne!(token1, token2);

        let claims1 = decode_token(&token1, TEST_SECRET).unwrap();
        let claims2 = decode_token(&token2, TEST_SECRET).unwrap();
        assert_eq!(claims1.sub, "user1");
        assert_eq!(claims2.sub, "user2");
    }

    #[test]
    fn test_token_is_hs256() {
        let token = create_access_token("testuser", TEST_SECRET, 60).unwrap();
        // JWT format: header.payload.signature
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3);

        // Decode header
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        let header_json = URL_SAFE_NO_PAD.decode(parts[0]).unwrap();
        let header: serde_json::Value = serde_json::from_slice(&header_json).unwrap();
        assert_eq!(header["alg"], "HS256");
    }
}
