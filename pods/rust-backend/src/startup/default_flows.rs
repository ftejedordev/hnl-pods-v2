use mongodb::bson::doc;
use mongodb::Database;

use crate::db::collections::{AGENTS, FLOWS};
use crate::startup::platform;

pub async fn ensure_default_flows(db: &Database) -> Result<(), mongodb::error::Error> {
    let flows_col = db.collection::<bson::Document>(FLOWS);
    let agents_col = db.collection::<bson::Document>(AGENTS);

    // Check if default flow already exists
    let count = flows_col.count_documents(doc! { "is_default": true }).await?;
    if count >= 1 {
        return Ok(());
    }

    // Get agent IDs by name
    let jax_id = get_agent_id(&agents_col, "JAX").await;
    let max_id = get_agent_id(&agents_col, "MAX").await;
    let tess_id = get_agent_id(&agents_col, "TESS").await;

    if jax_id.is_none() || max_id.is_none() || tess_id.is_none() {
        tracing::warn!("Cannot create default flow: missing default agents (JAX, MAX, or TESS)");
        return Ok(());
    }

    let jax_id = jax_id.unwrap();
    let max_id = max_id.unwrap();
    let tess_id = tess_id.unwrap();

    let documents_path = platform::get_documents_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let now = bson::DateTime::now();

    let flow_doc = doc! {
        "user_id": "system",
        "name": "GitHub Issue Resolution",
        "description": "Complete GitHub issue analysis, implementation, QA, and summary workflow with bidirectional feedback loop",
        "is_public": true,
        "is_active": true,
        "is_default": true,
        "start_step_id": "architect-analysis",
        "variables": {
            "issue_id": "{{issue_id}}",
            "repo_url": "{{repo_url}}",
            "working_directory": &documents_path,
        },
        "metadata": {
            "created_by": "system_initialization",
            "version": "1.0",
            "demo_flow": true,
        },
        "steps": [
            {
                "id": "architect-analysis",
                "agent_id": &jax_id,
                "name": "Analyze Issue & Create Plan",
                "description": "Analyze GitHub issue {{issue_id}} from {{repo_url}} and create implementation plan",
                "type": "llm",
                "parameters": {},
                "next_steps": ["developer-implementation"],
                "timeout_seconds": 300,
                "retry_count": 1,
                "position": { "x": 100.0, "y": 200.0 },
            },
            {
                "id": "developer-implementation",
                "agent_id": &max_id,
                "name": "Implement Solution",
                "description": "Implement the solution based on the architect's plan using filesystem and bash tools",
                "type": "llm",
                "parameters": {},
                "next_steps": ["qa-testing"],
                "timeout_seconds": 600,
                "retry_count": 1,
                "position": { "x": 400.0, "y": 200.0 },
            },
            {
                "id": "qa-testing",
                "agent_id": &tess_id,
                "name": "Quality Assurance",
                "description": "Test implementation and provide feedback for improvement. Manages background processes and ensures quality standards.",
                "type": "llm",
                "parameters": {},
                "next_steps": ["architect-summary"],
                "timeout_seconds": 600,
                "retry_count": 1,
                "position": { "x": 700.0, "y": 200.0 },
            },
            {
                "id": "architect-summary",
                "agent_id": &jax_id,
                "name": "Summarize Changes",
                "description": "Create final summary of all changes made, files modified, and provide client documentation",
                "type": "llm",
                "parameters": {},
                "next_steps": [],
                "timeout_seconds": 300,
                "retry_count": 1,
                "position": { "x": 1000.0, "y": 200.0 },
            },
        ],
        "edge_metadata": {
            "developer-implementation-qa-testing": {
                "edge_id": "developer-implementation-qa-testing",
                "source_step_id": "developer-implementation",
                "target_step_id": "qa-testing",
                "is_feedback_loop": true,
                "max_iterations": 5,
                "quality_threshold": 0.9,
                "convergence_criteria": "QA approval with quality score >= 0.9",
                "current_iteration": 0,
                "feedback_history": [],
                "quality_scores": [],
            },
        },
        "created_at": now,
        "updated_at": now,
    };

    flows_col.insert_one(flow_doc).await?;
    tracing::info!("Created default flow: GitHub Issue Resolution");

    Ok(())
}

async fn get_agent_id(
    collection: &mongodb::Collection<bson::Document>,
    name: &str,
) -> Option<String> {
    collection
        .find_one(doc! { "name": name, "is_default": true })
        .await
        .ok()
        .flatten()
        .and_then(|doc| doc.get_object_id("_id").ok().map(|oid| oid.to_hex()))
}
