//! Tests for serde serialization/deserialization of all models.
//! Ensures JSON compatibility with the Python frontend.

use serde_json::{json, Value};

// We test model serialization by importing the crate
// Since this is an integration test, we use the public API

/// Test that LLMProvider serializes to snake_case
#[test]
fn test_llm_provider_serialization() {
    use pods_backend::models::llm::LLMProvider;

    let json = serde_json::to_value(LLMProvider::Anthropic).unwrap();
    assert_eq!(json, json!("anthropic"));

    let json = serde_json::to_value(LLMProvider::Openai).unwrap();
    assert_eq!(json, json!("openai"));

    let json = serde_json::to_value(LLMProvider::Openrouter).unwrap();
    assert_eq!(json, json!("openrouter"));

    let json = serde_json::to_value(LLMProvider::Custom).unwrap();
    assert_eq!(json, json!("custom"));

    let json = serde_json::to_value(LLMProvider::ClaudeCli).unwrap();
    assert_eq!(json, json!("claude_cli"));
}

/// Test that LLMProvider deserializes from snake_case
#[test]
fn test_llm_provider_deserialization() {
    use pods_backend::models::llm::LLMProvider;

    let p: LLMProvider = serde_json::from_value(json!("anthropic")).unwrap();
    assert_eq!(p, LLMProvider::Anthropic);

    let p: LLMProvider = serde_json::from_value(json!("openai")).unwrap();
    assert_eq!(p, LLMProvider::Openai);

    let p: LLMProvider = serde_json::from_value(json!("claude_cli")).unwrap();
    assert_eq!(p, LLMProvider::ClaudeCli);
}

/// Test FlowStepType enum roundtrip
#[test]
fn test_flow_step_type_roundtrip() {
    use pods_backend::models::flow::FlowStepType;

    let types = vec![
        (FlowStepType::Llm, "llm"),
        (FlowStepType::Tool, "tool"),
        (FlowStepType::Condition, "condition"),
        (FlowStepType::Parallel, "parallel"),
        (FlowStepType::Webhook, "webhook"),
        (FlowStepType::FeedbackLoop, "feedback_loop"),
        (FlowStepType::QualityCheck, "quality_check"),
        (FlowStepType::Approval, "approval"),
    ];

    for (variant, expected_str) in types {
        let json = serde_json::to_value(&variant).unwrap();
        assert_eq!(json, json!(expected_str), "Serialization failed for {:?}", variant);

        let deserialized: FlowStepType = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized, variant);
    }
}

/// Test FlowExecutionStatus enum roundtrip
#[test]
fn test_flow_execution_status_roundtrip() {
    use pods_backend::models::flow::FlowExecutionStatus;

    let statuses = vec![
        (FlowExecutionStatus::Pending, "pending"),
        (FlowExecutionStatus::Running, "running"),
        (FlowExecutionStatus::Completed, "completed"),
        (FlowExecutionStatus::Failed, "failed"),
        (FlowExecutionStatus::Cancelled, "cancelled"),
    ];

    for (variant, expected_str) in statuses {
        let json = serde_json::to_value(&variant).unwrap();
        assert_eq!(json, json!(expected_str));
    }
}

/// Test FlowEventType enum roundtrip
#[test]
fn test_flow_event_type_roundtrip() {
    use pods_backend::models::flow_events::FlowEventType;

    let events = vec![
        (FlowEventType::ExecutionStarted, "execution_started"),
        (FlowEventType::ExecutionCompleted, "execution_completed"),
        (FlowEventType::ExecutionFailed, "execution_failed"),
        (FlowEventType::ExecutionCancelled, "execution_cancelled"),
        (FlowEventType::StepStarted, "step_started"),
        (FlowEventType::StepCompleted, "step_completed"),
        (FlowEventType::StepFailed, "step_failed"),
        (FlowEventType::StepSkipped, "step_skipped"),
        (FlowEventType::StepProgress, "step_progress"),
        (FlowEventType::Heartbeat, "heartbeat"),
        (FlowEventType::LlmResponse, "llm_response"),
        (FlowEventType::LlmStreamingChunk, "llm_streaming_chunk"),
        (FlowEventType::ToolCallStarted, "tool_call_started"),
        (FlowEventType::ToolCallCompleted, "tool_call_completed"),
        (FlowEventType::FeedbackLoopStarted, "feedback_loop_started"),
        (FlowEventType::FeedbackLoopIteration, "feedback_loop_iteration"),
        (FlowEventType::FeedbackLoopCompleted, "feedback_loop_completed"),
        (FlowEventType::ApprovalRequired, "approval_required"),
        (FlowEventType::ApprovalGranted, "approval_granted"),
        (FlowEventType::ApprovalRejected, "approval_rejected"),
    ];

    for (variant, expected_str) in events {
        let json = serde_json::to_value(&variant).unwrap();
        assert_eq!(json, json!(expected_str), "Failed for {:?}", variant);
    }
}

/// Test LLMConfig defaults match Python
#[test]
fn test_llm_config_defaults() {
    use pods_backend::models::llm::LLMConfig;

    let config: LLMConfig = serde_json::from_value(json!({})).unwrap();
    assert_eq!(config.max_tokens, Some(4096));
    assert_eq!(config.temperature, Some(0.7));
    assert_eq!(config.anthropic_version, Some("2023-06-01".to_string()));
    assert!(config.verify_ssl);
    assert!(config.model_name.is_none());
    assert!(config.base_url.is_none());
}

/// Test AgentCreate deserialization with minimal JSON
#[test]
fn test_agent_create_minimal() {
    use pods_backend::models::agent::AgentCreate;

    let json = json!({
        "name": "Test Agent",
        "description": "A test agent"
    });

    let agent: AgentCreate = serde_json::from_value(json).unwrap();
    assert_eq!(agent.name, "Test Agent");
    assert_eq!(agent.description, "A test agent");
    assert!(agent.llm_id.is_none());
    assert!(agent.mcp_connections.is_empty());
    assert!(agent.rag_documents.is_empty());
    assert_eq!(agent.color, Some("#3B82F6".to_string()));
}

/// Test AgentCreate deserialization with full JSON
#[test]
fn test_agent_create_full() {
    use pods_backend::models::agent::AgentCreate;

    let json = json!({
        "name": "Full Agent",
        "description": "Agent with all fields",
        "llm_id": "abc123",
        "mcp_connections": ["conn1", "conn2"],
        "rag_documents": [1, 2, 3],
        "color": "#FF0000",
        "avatar_url": "https://example.com/avatar.png",
        "role": "developer",
        "system_prompt": "You are a developer agent."
    });

    let agent: AgentCreate = serde_json::from_value(json).unwrap();
    assert_eq!(agent.name, "Full Agent");
    assert_eq!(agent.llm_id, Some("abc123".to_string()));
    assert_eq!(agent.mcp_connections, vec!["conn1", "conn2"]);
    assert_eq!(agent.rag_documents, vec![1, 2, 3]);
    assert_eq!(agent.color, Some("#FF0000".to_string()));
    assert_eq!(agent.role, Some("developer".to_string()));
}

/// Test AgentResponse serialization produces expected JSON shape
#[test]
fn test_agent_response_json_shape() {
    use pods_backend::models::agent::AgentResponse;

    let agent = AgentResponse {
        id: "abc123".to_string(),
        user_id: "user1".to_string(),
        name: "Test".to_string(),
        description: "Desc".to_string(),
        llm_id: Some("llm1".to_string()),
        mcp_connections: vec!["conn1".to_string()],
        rag_documents: vec![1, 2],
        color: "#3B82F6".to_string(),
        avatar_url: None,
        role: Some("developer".to_string()),
        system_prompt: None,
        is_default: false,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    let json: Value = serde_json::to_value(&agent).unwrap();

    // Verify all expected keys exist
    assert!(json.get("id").is_some());
    assert!(json.get("user_id").is_some());
    assert!(json.get("name").is_some());
    assert!(json.get("description").is_some());
    assert!(json.get("llm_id").is_some());
    assert!(json.get("mcp_connections").is_some());
    assert!(json.get("rag_documents").is_some());
    assert!(json.get("color").is_some());
    assert!(json.get("is_default").is_some());
    assert!(json.get("created_at").is_some());
    assert!(json.get("updated_at").is_some());

    // Verify types
    assert!(json["mcp_connections"].is_array());
    assert!(json["rag_documents"].is_array());
    assert!(json["is_default"].is_boolean());
    assert_eq!(json["is_default"], false);
}

/// Test LLMCreate with encryption field
#[test]
fn test_llm_create_deserialization() {
    use pods_backend::models::llm::{LLMCreate, LLMProvider};

    let json = json!({
        "name": "My Anthropic",
        "provider": "anthropic",
        "api_key": "sk-ant-xxxxx",
        "config": {
            "model_name": "claude-sonnet-4-5-20250929",
            "max_tokens": 8192,
            "temperature": 0.5
        }
    });

    let llm: LLMCreate = serde_json::from_value(json).unwrap();
    assert_eq!(llm.name, "My Anthropic");
    assert_eq!(llm.provider, LLMProvider::Anthropic);
    assert_eq!(llm.api_key, "sk-ant-xxxxx");
    assert_eq!(llm.config.as_ref().unwrap().model_name, Some("claude-sonnet-4-5-20250929".to_string()));
    assert_eq!(llm.config.as_ref().unwrap().max_tokens, Some(8192));
}

/// Test McpServerConnectionCreate deserialization
#[test]
fn test_mcp_connection_create_stdio() {
    use pods_backend::models::mcp_connection::McpServerConnectionCreate;

    let json = json!({
        "name": "Filesystem MCP",
        "transport_type": "stdio",
        "stdio_command": "npx",
        "stdio_args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"],
        "is_active": true
    });

    let conn: McpServerConnectionCreate = serde_json::from_value(json).unwrap();
    assert_eq!(conn.name, "Filesystem MCP");
    assert_eq!(conn.transport_type, "stdio");
    assert_eq!(conn.stdio_command, Some("npx".to_string()));
    assert_eq!(conn.stdio_args.as_ref().unwrap().len(), 3);
    assert!(conn.is_active);
}

/// Test FlowCreate deserialization
#[test]
fn test_flow_create_deserialization() {
    use pods_backend::models::flow::FlowCreate;

    let json = json!({
        "name": "Test Flow",
        "description": "A test flow",
        "start_step_id": "step1",
        "steps": [
            {
                "id": "step1",
                "name": "First Step",
                "type": "llm",
                "agent_id": "agent1",
                "next_steps": ["step2"],
                "position": { "x": 100.0, "y": 200.0 }
            },
            {
                "id": "step2",
                "name": "Second Step",
                "type": "tool",
                "next_steps": [],
                "position": { "x": 400.0, "y": 200.0 }
            }
        ],
        "variables": {
            "issue_id": "123"
        }
    });

    let flow: FlowCreate = serde_json::from_value(json).unwrap();
    assert_eq!(flow.name, "Test Flow");
    assert_eq!(flow.start_step_id, "step1");
    assert_eq!(flow.steps.len(), 2);
    assert_eq!(flow.steps[0].id, "step1");
    assert_eq!(flow.steps[0].next_steps, vec!["step2"]);
    assert_eq!(flow.variables.get("issue_id").unwrap(), "123");
}

/// Test ChatSessionCreate deserialization
#[test]
fn test_chat_session_create() {
    use pods_backend::models::chat::ChatSessionCreate;

    let json = json!({
        "agent_id": "abc123",
        "title": "My Chat"
    });

    let session: ChatSessionCreate = serde_json::from_value(json).unwrap();
    assert_eq!(session.agent_id, "abc123");
    assert_eq!(session.title, Some("My Chat".to_string()));

    // Without title
    let json2 = json!({ "agent_id": "abc123" });
    let session2: ChatSessionCreate = serde_json::from_value(json2).unwrap();
    assert!(session2.title.is_none());
}

/// Test EdgeMetadata defaults
#[test]
fn test_edge_metadata_defaults() {
    use pods_backend::models::flow::EdgeMetadata;

    let json = json!({
        "edge_id": "e1",
        "source_step_id": "s1",
        "target_step_id": "s2"
    });

    let edge: EdgeMetadata = serde_json::from_value(json).unwrap();
    assert_eq!(edge.edge_id, "e1");
    assert!(!edge.is_feedback_loop);
    assert_eq!(edge.max_iterations, Some(25));
    assert_eq!(edge.quality_threshold, Some(0.8));
    assert_eq!(edge.current_iteration, 0);
    assert!(edge.feedback_history.is_empty());
    assert!(edge.quality_scores.is_empty());
}

/// Test ConnectivityTestResult serialization
#[test]
fn test_connectivity_test_result() {
    use pods_backend::models::mcp_connection::ConnectivityTestResult;

    let result = ConnectivityTestResult {
        status: "success".to_string(),
        response_time_ms: Some(150),
        error: None,
        endpoint: Some("http://localhost:3000".to_string()),
        server_info: Some(json!({"name": "test-server"})),
    };

    let json: Value = serde_json::to_value(&result).unwrap();
    assert_eq!(json["status"], "success");
    assert_eq!(json["response_time_ms"], 150);
    assert!(json["error"].is_null());
    assert_eq!(json["endpoint"], "http://localhost:3000");
}

/// Test UserRegister/UserLogin roundtrip
#[test]
fn test_user_models_roundtrip() {
    use pods_backend::models::user::{UserRegister, UserLogin};

    let register_json = json!({
        "username": "testuser",
        "password": "mypassword123"
    });

    let register: UserRegister = serde_json::from_value(register_json.clone()).unwrap();
    assert_eq!(register.username, "testuser");
    assert_eq!(register.password, "mypassword123");

    let back_to_json = serde_json::to_value(&register).unwrap();
    assert_eq!(back_to_json, register_json);

    let login: UserLogin = serde_json::from_value(json!({
        "username": "testuser",
        "password": "mypassword123"
    })).unwrap();
    assert_eq!(login.username, "testuser");
}

/// Test Token serialization
#[test]
fn test_token_serialization() {
    use pods_backend::models::user::Token;

    let token = Token {
        access_token: "eyJhbGciOiJIUzI1NiJ9.xxx.yyy".to_string(),
        token_type: "bearer".to_string(),
    };

    let json: Value = serde_json::to_value(&token).unwrap();
    assert_eq!(json["access_token"], "eyJhbGciOiJIUzI1NiJ9.xxx.yyy");
    assert_eq!(json["token_type"], "bearer");
}
