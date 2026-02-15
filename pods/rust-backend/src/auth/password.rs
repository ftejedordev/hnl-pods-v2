use bcrypt::{hash, verify, DEFAULT_COST};

use crate::error::AppError;

pub fn hash_password(password: &str) -> Result<String, AppError> {
    hash(password, DEFAULT_COST).map_err(AppError::from)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    verify(password, hash).map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_password() {
        let password = "my_secure_password_123";
        let hashed = hash_password(password).unwrap();

        assert_ne!(hashed, password);
        assert!(hashed.starts_with("$2b$") || hashed.starts_with("$2a$"));
        assert!(verify_password(password, &hashed).unwrap());
    }

    #[test]
    fn test_wrong_password_fails() {
        let hashed = hash_password("correct_password").unwrap();
        assert!(!verify_password("wrong_password", &hashed).unwrap());
    }

    #[test]
    fn test_empty_password() {
        let hashed = hash_password("").unwrap();
        assert!(verify_password("", &hashed).unwrap());
        assert!(!verify_password("notempty", &hashed).unwrap());
    }

    #[test]
    fn test_different_hashes_for_same_password() {
        let password = "same_password";
        let hash1 = hash_password(password).unwrap();
        let hash2 = hash_password(password).unwrap();
        // bcrypt uses random salt so hashes differ
        assert_ne!(hash1, hash2);
        // But both verify correctly
        assert!(verify_password(password, &hash1).unwrap());
        assert!(verify_password(password, &hash2).unwrap());
    }

    #[test]
    fn test_unicode_password() {
        let password = "contraseña_segura_🔐";
        let hashed = hash_password(password).unwrap();
        assert!(verify_password(password, &hashed).unwrap());
    }

    #[test]
    fn test_long_password() {
        // bcrypt truncates at 72 bytes
        let password = "a".repeat(100);
        let hashed = hash_password(&password).unwrap();
        assert!(verify_password(&password, &hashed).unwrap());
    }

    #[test]
    fn test_invalid_hash_format() {
        let result = verify_password("test", "not_a_valid_hash");
        assert!(result.is_err());
    }
}
