use axum::{routing::get, Json, Router};
use chrono::Utc;
use serde_json::{json, Value};
use std::process::Command;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/check-dependencies", get(check_dependencies))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "timestamp": Utc::now().to_rfc3339()
    }))
}

async fn check_dependencies() -> Json<Value> {
    let node = check_command("node", &["--version"]);
    let npx = check_command("npx", &["--version"]);
    let uv = check_command("uv", &["--version"]);

    let mut missing = Vec::new();
    if node.is_none() { missing.push("Node.js"); }
    if npx.is_none() { missing.push("NPX"); }

    let all_ok = node.is_some() && npx.is_some();

    Json(json!({
        "node": node.map(|(path, version)| json!({ "path": path, "version": version, "available": true }))
            .unwrap_or_else(|| json!(null)),
        "npx": npx.map(|(path, version)| json!({ "path": path, "version": version, "available": true }))
            .unwrap_or_else(|| json!(null)),
        "uv": uv.map(|(path, version)| json!({ "path": path, "version": version, "available": true }))
            .unwrap_or_else(|| json!({ "available": false, "optional": true })),
        "all_ok": all_ok,
        "missing": missing,
        "path_env": std::env::var("PATH").unwrap_or_else(|_| "NOT SET".to_string())
    }))
}

fn check_command(name: &str, args: &[&str]) -> Option<(String, String)> {
    let path = which::which(name).ok()?.to_string_lossy().to_string();
    let output = Command::new(&path)
        .args(args)
        .output()
        .ok()?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Some((path, version))
}
