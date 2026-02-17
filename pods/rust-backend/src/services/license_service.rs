use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct LicenseInsert {
    username: String,
    active: bool,
}

#[derive(Debug, Deserialize)]
struct LicenseRecord {
    #[allow(dead_code)]
    username: String,
    active: bool,
}

pub struct LicenseService {
    client: Client,
    base_url: String,
    api_key: String,
}

impl LicenseService {
    pub fn new(supabase_url: &str, supabase_key: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: supabase_url.trim_end_matches('/').to_string(),
            api_key: supabase_key.to_string(),
        }
    }

    /// Register a user in Supabase licenses table (active=false by default).
    pub async fn register_license(&self, username: &str) -> Result<(), String> {
        let url = format!("{}/rest/v1/licenses", self.base_url);

        let res = self.client
            .post(&url)
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .json(&LicenseInsert {
                username: username.to_string(),
                active: false,
            })
            .send()
            .await
            .map_err(|e| format!("Supabase request failed: {}", e))?;

        if res.status().is_success() || res.status().as_u16() == 409 {
            // 201 Created or 409 Conflict (already exists) — both OK
            Ok(())
        } else {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            tracing::error!("Supabase register failed: {} - {}", status, body);
            // Don't block registration if Supabase fails — just log it
            Ok(())
        }
    }

    /// Check if a user has an active license in Supabase.
    /// Returns true if active, false if inactive or not found.
    pub async fn check_license(&self, username: &str) -> Result<bool, String> {
        let url = format!(
            "{}/rest/v1/licenses?username=eq.{}&select=username,active",
            self.base_url, username
        );

        let res = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .send()
            .await
            .map_err(|e| format!("Supabase request failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            tracing::error!("Supabase license check failed: {} - {}", status, body);
            // If Supabase is down, allow access (fail-open)
            return Ok(true);
        }

        let records: Vec<LicenseRecord> = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse Supabase response: {}", e))?;

        match records.first() {
            Some(record) => Ok(record.active),
            None => {
                // User not found in Supabase — not licensed
                Ok(false)
            }
        }
    }
}
