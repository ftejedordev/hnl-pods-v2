//! Pure-Rust Fernet implementation compatible with Python's cryptography.fernet.Fernet.
//!
//! Fernet spec: https://github.com/fernet/spec/blob/master/Spec.md
//! - Version: 0x80
//! - Timestamp: 8 bytes big-endian unix timestamp
//! - IV: 16 bytes random
//! - Ciphertext: AES-128-CBC(PKCS7 padded plaintext)
//! - HMAC: HMAC-SHA256 over (version || timestamp || IV || ciphertext)
//! - Token: url-safe base64 encode(version || timestamp || IV || ciphertext || HMAC)

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::URL_SAFE, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;
type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;
type HmacSha256 = Hmac<Sha256>;

const FERNET_VERSION: u8 = 0x80;

/// A Fernet cipher compatible with Python's cryptography.fernet.Fernet
#[derive(Clone)]
pub struct FernetCipher {
    signing_key: [u8; 16],
    encryption_key: [u8; 16],
}

impl std::fmt::Debug for FernetCipher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FernetCipher").finish()
    }
}

impl FernetCipher {
    /// Create from a url-safe base64 encoded 32-byte key (same format as Python Fernet)
    pub fn new(key_b64: &str) -> Result<Self, AppError> {
        let key_bytes = URL_SAFE
            .decode(key_b64)
            .map_err(|e| AppError::Internal(format!("Invalid Fernet key base64: {}", e)))?;

        if key_bytes.len() != 32 {
            return Err(AppError::Internal(format!(
                "Fernet key must be 32 bytes, got {}",
                key_bytes.len()
            )));
        }

        let mut signing_key = [0u8; 16];
        let mut encryption_key = [0u8; 16];
        signing_key.copy_from_slice(&key_bytes[..16]);
        encryption_key.copy_from_slice(&key_bytes[16..]);

        Ok(Self {
            signing_key,
            encryption_key,
        })
    }

    /// Encrypt plaintext, returns url-safe base64 encoded Fernet token
    pub fn encrypt(&self, plaintext: &[u8]) -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Generate random IV
        let mut iv = [0u8; 16];
        getrandom::fill(&mut iv).expect("Failed to generate random IV");

        // AES-128-CBC encrypt with PKCS7 padding
        // Calculate padded length
        let padded_len = ((plaintext.len() / 16) + 1) * 16;
        let mut buf = vec![0u8; padded_len];
        buf[..plaintext.len()].copy_from_slice(plaintext);

        let ciphertext = Aes128CbcEnc::new(&self.encryption_key.into(), &iv.into())
            .encrypt_padded_mut::<Pkcs7>(&mut buf, plaintext.len())
            .expect("Encryption failed");

        // Build token payload: version || timestamp || IV || ciphertext
        let mut payload = Vec::with_capacity(1 + 8 + 16 + ciphertext.len());
        payload.push(FERNET_VERSION);
        payload.extend_from_slice(&timestamp.to_be_bytes());
        payload.extend_from_slice(&iv);
        payload.extend_from_slice(ciphertext);

        // HMAC-SHA256 over payload
        let mut mac =
            HmacSha256::new_from_slice(&self.signing_key).expect("HMAC key length is valid");
        mac.update(&payload);
        let hmac_result = mac.finalize().into_bytes();

        // Append HMAC
        payload.extend_from_slice(&hmac_result);

        // Base64 url-safe encode
        URL_SAFE.encode(&payload)
    }

    /// Decrypt a Fernet token, returns plaintext bytes
    pub fn decrypt(&self, token: &str) -> Result<Vec<u8>, AppError> {
        let data = URL_SAFE
            .decode(token)
            .map_err(|e| AppError::Internal(format!("Invalid Fernet token base64: {}", e)))?;

        // Minimum length: 1 (version) + 8 (timestamp) + 16 (IV) + 16 (min ciphertext) + 32 (HMAC)
        if data.len() < 73 {
            return Err(AppError::Internal("Fernet token too short".to_string()));
        }

        // Verify version
        if data[0] != FERNET_VERSION {
            return Err(AppError::Internal(format!(
                "Invalid Fernet version: 0x{:02x}",
                data[0]
            )));
        }

        // Split: payload and HMAC
        let (payload, hmac_bytes) = data.split_at(data.len() - 32);
        let hmac_expected: [u8; 32] = hmac_bytes
            .try_into()
            .map_err(|_| AppError::Internal("Invalid HMAC length".to_string()))?;

        // Verify HMAC
        let mut mac =
            HmacSha256::new_from_slice(&self.signing_key).expect("HMAC key length is valid");
        mac.update(payload);
        mac.verify_slice(&hmac_expected)
            .map_err(|_| AppError::Internal("Fernet HMAC verification failed".to_string()))?;

        // Extract IV and ciphertext
        let iv: [u8; 16] = payload[9..25]
            .try_into()
            .map_err(|_| AppError::Internal("Invalid IV".to_string()))?;
        let ciphertext = &payload[25..];

        // Decrypt AES-128-CBC
        let mut buf = ciphertext.to_vec();
        let plaintext = Aes128CbcDec::new(&self.encryption_key.into(), &iv.into())
            .decrypt_padded_mut::<Pkcs7>(&mut buf)
            .map_err(|_| AppError::Internal("Fernet decryption failed (bad padding)".to_string()))?;

        Ok(plaintext.to_vec())
    }
}

/// Encrypt an API key using the Fernet cipher
pub fn encrypt_api_key(cipher: &FernetCipher, plaintext: &str) -> Result<String, AppError> {
    Ok(cipher.encrypt(plaintext.as_bytes()))
}

/// Decrypt an API key using the Fernet cipher
pub fn decrypt_api_key(cipher: &FernetCipher, ciphertext: &str) -> Result<String, AppError> {
    let bytes = cipher.decrypt(ciphertext)?;
    String::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("Decrypted data is not valid UTF-8: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_cipher() -> FernetCipher {
        // Generate a valid 32-byte key: 16 signing + 16 encryption
        let key_bytes = b"0123456789abcdef0123456789abcdef";
        let key_b64 = URL_SAFE.encode(key_bytes);
        FernetCipher::new(&key_b64).unwrap()
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let cipher = test_cipher();
        let plaintext = b"Hello, World!";

        let token = cipher.encrypt(plaintext);
        let decrypted = cipher.decrypt(&token).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_decrypt_api_key() {
        let cipher = test_cipher();
        let api_key = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx";

        let encrypted = encrypt_api_key(&cipher, api_key).unwrap();
        assert_ne!(encrypted, api_key);

        let decrypted = decrypt_api_key(&cipher, &encrypted).unwrap();
        assert_eq!(decrypted, api_key);
    }

    #[test]
    fn test_different_encryptions_produce_different_tokens() {
        let cipher = test_cipher();
        let plaintext = b"same data";

        let token1 = cipher.encrypt(plaintext);
        let token2 = cipher.encrypt(plaintext);

        // Different IVs mean different tokens
        assert_ne!(token1, token2);

        // But both decrypt to same plaintext
        assert_eq!(cipher.decrypt(&token1).unwrap(), plaintext);
        assert_eq!(cipher.decrypt(&token2).unwrap(), plaintext);
    }

    #[test]
    fn test_empty_plaintext() {
        let cipher = test_cipher();
        let token = cipher.encrypt(b"");
        let decrypted = cipher.decrypt(&token).unwrap();
        assert!(decrypted.is_empty());
    }

    #[test]
    fn test_large_plaintext() {
        let cipher = test_cipher();
        let plaintext = vec![0x42u8; 10_000]; // 10KB

        let token = cipher.encrypt(&plaintext);
        let decrypted = cipher.decrypt(&token).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_fernet_token_structure() {
        let cipher = test_cipher();
        let token = cipher.encrypt(b"test");

        // Should be valid URL-safe base64
        let decoded = URL_SAFE.decode(&token).unwrap();

        // Version byte
        assert_eq!(decoded[0], 0x80);

        // Minimum length: 1 + 8 + 16 + 16 + 32 = 73
        assert!(decoded.len() >= 73);
    }

    #[test]
    fn test_tampered_token_fails() {
        let cipher = test_cipher();
        let token = cipher.encrypt(b"secret");

        // Tamper with the token
        let mut decoded = URL_SAFE.decode(&token).unwrap();
        if decoded.len() > 30 {
            decoded[30] ^= 0xFF; // flip some bits in the ciphertext
        }
        let tampered = URL_SAFE.encode(&decoded);

        let result = cipher.decrypt(&tampered);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_key_fails() {
        let cipher1 = test_cipher();
        let token = cipher1.encrypt(b"secret data");

        // Different key
        let key_bytes = b"abcdef0123456789abcdef0123456789";
        let key_b64 = URL_SAFE.encode(key_bytes);
        let cipher2 = FernetCipher::new(&key_b64).unwrap();

        let result = cipher2.decrypt(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_key_length() {
        let short_key = URL_SAFE.encode(b"too_short");
        let result = FernetCipher::new(&short_key);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_token_base64() {
        let cipher = test_cipher();
        let result = cipher.decrypt("not valid base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_token_too_short() {
        let cipher = test_cipher();
        let short = URL_SAFE.encode(b"short");
        let result = cipher.decrypt(&short);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_version_byte() {
        let cipher = test_cipher();
        let token = cipher.encrypt(b"test");
        let mut decoded = URL_SAFE.decode(&token).unwrap();
        decoded[0] = 0x00; // Wrong version
        let bad_token = URL_SAFE.encode(&decoded);

        let result = cipher.decrypt(&bad_token);
        assert!(result.is_err());
    }

    #[test]
    fn test_python_fernet_key_derivation_compatibility() {
        // Replicate the Python key derivation:
        // ENCRYPTION_KEY[:32].encode().ljust(32, b'0') -> base64 url-safe
        let encryption_key_raw = "hypernova_encryption_key_2024_secure_string_32b";
        let key_bytes: Vec<u8> = encryption_key_raw.as_bytes().iter().take(32).copied().collect();
        let mut padded = key_bytes;
        padded.resize(32, b'0');
        let fernet_key_str = URL_SAFE.encode(&padded);

        // This should create a valid cipher
        let cipher = FernetCipher::new(&fernet_key_str).unwrap();

        // Encrypt/decrypt should work
        let api_key = "sk-test-12345";
        let encrypted = encrypt_api_key(&cipher, api_key).unwrap();
        let decrypted = decrypt_api_key(&cipher, &encrypted).unwrap();
        assert_eq!(decrypted, api_key);
    }

    #[test]
    fn test_unicode_api_key() {
        let cipher = test_cipher();
        let api_key = "키-test-日本語-🔑";
        let encrypted = encrypt_api_key(&cipher, api_key).unwrap();
        let decrypted = decrypt_api_key(&cipher, &encrypted).unwrap();
        assert_eq!(decrypted, api_key);
    }
}
