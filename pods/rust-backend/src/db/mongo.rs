use mongodb::{options::ClientOptions, Client, Database};
use std::time::Duration;

use super::collections::DB_NAME;

pub async fn connect(uri: &str) -> Result<Client, mongodb::error::Error> {
    let mut options = ClientOptions::parse(uri).await?;

    options.max_pool_size = Some(10);
    options.min_pool_size = Some(1);
    options.connect_timeout = Some(Duration::from_secs(5));
    options.server_selection_timeout = Some(Duration::from_secs(5));
    options.max_idle_time = Some(Duration::from_secs(45));

    let client = Client::with_options(options)?;

    // Ping to verify connection
    client
        .database("admin")
        .run_command(bson::doc! { "ping": 1 })
        .await?;

    tracing::info!("Connected to MongoDB");
    Ok(client)
}

#[allow(dead_code)]
pub fn get_database(client: &Client) -> Database {
    client.database(DB_NAME)
}
