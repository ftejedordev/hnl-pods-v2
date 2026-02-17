use base64::{engine::general_purpose::URL_SAFE, Engine};
use std::env;

use crate::auth::encryption::FernetCipher;

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct AppConfig {
    pub db_uri_mongo: String,
    pub jwt_secret_key: String,
    pub jwt_algorithm: String,
    pub jwt_expire_minutes: i64,
    pub fernet_key: FernetCipher,
    pub cors_origins: Vec<String>,
    pub supabase_url: Option<String>,
    pub supabase_key: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let db_uri_mongo = env::var("DB_URI_MONGO")
            .unwrap_or_else(|_| "mongodb://localhost:27017/hypernova_pods".to_string());

        let jwt_secret_key = env::var("JWT_SECRET_KEY")
            .unwrap_or_else(|_| "hypernova_secret_key_2024_pods".to_string());

        let jwt_expire_minutes = env::var("JWT_EXPIRE_MINUTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10080); // 7 days

        let encryption_key_raw = env::var("ENCRYPTION_KEY")
            .unwrap_or_else(|_| "hypernova_encryption_key_2024_secure_string_32b".to_string());

        // Replicate Python: ENCRYPTION_KEY[:32].encode().ljust(32, b'0') -> base64 url-safe
        let key_bytes: Vec<u8> = encryption_key_raw.as_bytes().iter().take(32).copied().collect();
        let mut padded = key_bytes;
        padded.resize(32, b'0');
        let fernet_key_str = URL_SAFE.encode(&padded);

        let fernet_key = FernetCipher::new(&fernet_key_str)
            .expect("Failed to create Fernet cipher from encryption key");

        let cors_origins = vec![
            "http://localhost:3000".to_string(),
            "http://localhost:8000".to_string(),
            "http://localhost:3001".to_string(),
            "http://localhost:5173".to_string(),
            "http://localhost:4173".to_string(),
            "http://127.0.0.1:3000".to_string(),
            "http://127.0.0.1:3001".to_string(),
            "http://127.0.0.1:5173".to_string(),
            "http://127.0.0.1:4173".to_string(),
        ];

        let supabase_url = env::var("SUPABASE_URL").ok();
        let supabase_key = env::var("SUPABASE_KEY").ok();

        if supabase_url.is_some() && supabase_key.is_some() {
            tracing::info!("Supabase license validation enabled");
        } else {
            tracing::warn!("Supabase not configured - license validation disabled");
        }

        Self {
            db_uri_mongo,
            jwt_secret_key,
            jwt_algorithm: "HS256".to_string(),
            jwt_expire_minutes,
            fernet_key,
            cors_origins,
            supabase_url,
            supabase_key,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fernet_key_derivation_from_default() {
        // Replicate default key derivation
        let encryption_key_raw = "hypernova_encryption_key_2024_secure_string_32b";
        let key_bytes: Vec<u8> = encryption_key_raw.as_bytes().iter().take(32).copied().collect();
        let mut padded = key_bytes.clone();
        padded.resize(32, b'0');

        assert_eq!(padded.len(), 32);
        // First 32 bytes of the key
        assert_eq!(&padded[..32], b"hypernova_encryption_key_2024_se" as &[u8]);

        let fernet_key_str = URL_SAFE.encode(&padded);
        let cipher = FernetCipher::new(&fernet_key_str);
        assert!(cipher.is_ok());
    }

    #[test]
    fn test_fernet_key_derivation_short_key() {
        // A short key should be padded with '0' bytes
        let short_key = "abc";
        let key_bytes: Vec<u8> = short_key.as_bytes().iter().take(32).copied().collect();
        let mut padded = key_bytes;
        padded.resize(32, b'0');

        assert_eq!(padded.len(), 32);
        assert_eq!(padded[0], b'a');
        assert_eq!(padded[1], b'b');
        assert_eq!(padded[2], b'c');
        assert_eq!(padded[3], b'0'); // padded

        let fernet_key_str = URL_SAFE.encode(&padded);
        let cipher = FernetCipher::new(&fernet_key_str);
        assert!(cipher.is_ok());
    }

    #[test]
    fn test_from_env_defaults() {
        // Clear env vars to test defaults
        env::remove_var("DB_URI_MONGO");
        env::remove_var("JWT_SECRET_KEY");
        env::remove_var("JWT_EXPIRE_MINUTES");
        env::remove_var("ENCRYPTION_KEY");

        let config = AppConfig::from_env();

        assert_eq!(config.db_uri_mongo, "mongodb://localhost:27017/hypernova_pods");
        assert_eq!(config.jwt_secret_key, "hypernova_secret_key_2024_pods");
        assert_eq!(config.jwt_algorithm, "HS256");
        assert_eq!(config.jwt_expire_minutes, 10080); // 7 days
    }

    #[test]
    fn test_cors_origins_include_common_ports() {
        env::remove_var("DB_URI_MONGO");
        let config = AppConfig::from_env();

        assert!(config.cors_origins.contains(&"http://localhost:3000".to_string()));
        assert!(config.cors_origins.contains(&"http://localhost:5173".to_string()));
        assert!(config.cors_origins.contains(&"http://localhost:8000".to_string()));
    }
}
