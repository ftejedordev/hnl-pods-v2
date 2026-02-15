use mongodb::bson::doc;
use mongodb::Database;

use crate::db::collections::MCP_SERVER_CONNECTIONS;
use crate::startup::platform;

pub async fn ensure_default_mcp_servers(db: &Database) -> Result<(), mongodb::error::Error> {
    let collection = db.collection::<bson::Document>(MCP_SERVER_CONNECTIONS);

    // Check if we already have the expected number of default MCP servers
    let count = collection.count_documents(doc! { "is_default": true }).await?;
    if count >= 5 {
        return Ok(());
    }

    // Delete existing defaults and recreate
    if count > 0 {
        collection.delete_many(doc! { "is_default": true }).await?;
        tracing::info!("Cleared {} existing default MCP servers for refresh", count);
    }

    let now = bson::DateTime::now();

    // Get platform-specific paths
    let documents_path = platform::get_documents_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let home_path = {
        #[cfg(target_os = "windows")]
        {
            std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string())
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
        }
    };

    // 1. SonarQube MCP (internal)
    collection.insert_one(doc! {
        "user_id": "system",
        "name": "SonarQube MCP",
        "description": "Built-in SonarQube MCP server for code quality analysis",
        "transport_type": "internal",
        "is_active": true,
        "is_default": true,
        "created_at": now,
        "updated_at": now,
    }).await?;
    tracing::info!("Created default MCP server: SonarQube MCP");

    // 2. Filesystem MCP (stdio)
    collection.insert_one(doc! {
        "user_id": "system",
        "name": "Filesystem MCP",
        "description": "Filesystem operations MCP server using official @modelcontextprotocol/server-filesystem",
        "transport_type": "stdio",
        "stdio_command": "npx",
        "stdio_args": ["-y", "@modelcontextprotocol/server-filesystem", &documents_path],
        "is_active": true,
        "is_default": true,
        "created_at": now,
        "updated_at": now,
    }).await?;
    tracing::info!("Created default MCP server: Filesystem MCP (root: {})", documents_path);

    // 3. Bash Commands MCP (stdio)
    collection.insert_one(doc! {
        "user_id": "system",
        "name": "Bash Commands MCP",
        "description": "Background command execution and process management for development workflows",
        "transport_type": "stdio",
        "stdio_command": "npx",
        "stdio_args": ["-y", "bash-mcp"],
        "working_directory": &home_path,
        "is_active": true,
        "is_default": true,
        "created_at": now,
        "updated_at": now,
    }).await?;
    tracing::info!("Created default MCP server: Bash Commands MCP");

    // 4. Playwright MCP Server (stdio)
    let playwright_args = vec![
        bson::Bson::String("-y".to_string()),
        bson::Bson::String("@playwright/mcp@latest".to_string()),
        bson::Bson::String("--headless".to_string()),
    ];

    collection.insert_one(doc! {
        "user_id": "system",
        "name": "Playwright MCP Server",
        "description": "Official Microsoft Playwright MCP server for browser automation using accessibility tree",
        "transport_type": "stdio",
        "stdio_command": "npx",
        "stdio_args": playwright_args,
        "is_active": true,
        "is_default": true,
        "created_at": now,
        "updated_at": now,
    }).await?;
    tracing::info!("Created default MCP server: Playwright MCP Server");

    // 5. MuleSoft MCP Server (stdio, inactive by default)
    let anypoint_client_id = std::env::var("ANYPOINT_CLIENT_ID").unwrap_or_default();
    let anypoint_client_secret = std::env::var("ANYPOINT_CLIENT_SECRET").unwrap_or_default();
    let anypoint_region = std::env::var("ANYPOINT_REGION").unwrap_or_else(|_| "PROD_US".to_string());

    collection.insert_one(doc! {
        "user_id": "system",
        "name": "MuleSoft MCP Server",
        "description": "Official MuleSoft MCP server for Anypoint Platform - Create, deploy, and manage Mule applications with AI",
        "transport_type": "stdio",
        "stdio_command": "npx",
        "stdio_args": ["-y", "@mulesoft/mcp-server", "start"],
        "env_vars": {
            "ANYPOINT_CLIENT_ID": &anypoint_client_id,
            "ANYPOINT_CLIENT_SECRET": &anypoint_client_secret,
            "ANYPOINT_REGION": &anypoint_region,
        },
        "is_active": false,
        "is_default": true,
        "created_at": now,
        "updated_at": now,
    }).await?;
    tracing::info!("Created default MCP server: MuleSoft MCP Server (inactive)");

    Ok(())
}
