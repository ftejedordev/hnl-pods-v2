use serde_json::{json, Value};
use std::time::Instant;
use tokio::process::Command;

use super::LLMApiResponse;
use crate::services::agent_api_client::message_formatter::LLMMessage;

pub async fn call_streaming(
    model: &str,
    messages: &[LLMMessage],
    mut stream_callback: Option<&mut (dyn FnMut(&str) + Send)>,
) -> LLMApiResponse {
    let start = Instant::now();

    let claude_path = match which::which("claude") {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => return LLMApiResponse::error("Claude CLI not found in PATH", 0),
    };

    // Build prompt from messages
    let mut system_prompt = String::new();
    let mut prompt_parts = Vec::new();

    for msg in messages {
        match msg.role.as_str() {
            "system" => system_prompt = msg.content.clone(),
            "user" => prompt_parts.push(format!("User: {}", msg.content)),
            "assistant" => prompt_parts.push(format!("Assistant: {}", msg.content)),
            _ => {}
        }
    }

    let final_prompt = if prompt_parts.len() == 1 && prompt_parts[0].starts_with("User: ") {
        prompt_parts[0].replacen("User: ", "", 1)
    } else {
        let mut p = prompt_parts.join("\n\n");
        if !system_prompt.is_empty() {
            p = format!("System: {}\n\n{}", system_prompt, p);
        }
        p
    };

    let model_name = if model.is_empty() { "haiku" } else { model };

    let mut cmd = Command::new(&claude_path);
    cmd.arg("-p")
        .arg("--model").arg(model_name)
        .arg("--output-format").arg("json")
        .arg("--dangerously-skip-permissions")
        .arg("--no-session-persistence")
        .arg("--disable-slash-commands");

    if !system_prompt.is_empty() && messages.len() <= 2 {
        cmd.arg("--system-prompt").arg(&system_prompt);
    }

    cmd.arg(&final_prompt);

    // Set working directory
    let work_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "/tmp".to_string());
    cmd.current_dir(&work_dir);

    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(300),
        cmd.output(),
    ).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return LLMApiResponse::error(&format!("Claude CLI execution failed: {}", e), start.elapsed().as_millis() as i64),
        Err(_) => return LLMApiResponse::error("Claude CLI timed out after 5 minutes", start.elapsed().as_millis() as i64),
    };

    let latency = start.elapsed().as_millis() as i64;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return LLMApiResponse::error(&format!("Claude CLI error: {}", stderr), latency);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    let (content, model_used, usage) = match serde_json::from_str::<Value>(&stdout) {
        Ok(result) => {
            let content = result.get("result")
                .and_then(|v| v.as_str())
                .unwrap_or(&stdout)
                .to_string();
            let model_used = result.get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("claude-code-cli")
                .to_string();
            let usage = json!({"cost_usd": result.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0)});
            (content, model_used, Some(usage))
        }
        Err(_) => (stdout, "claude-code-cli".to_string(), None),
    };

    if let Some(ref mut cb) = stream_callback {
        cb(&content);
    }

    LLMApiResponse {
        success: true,
        content,
        tool_calls: None, // CLI doesn't support tool calls
        model_used: Some(model_used),
        usage,
        error: None,
        latency_ms: latency,
    }
}
