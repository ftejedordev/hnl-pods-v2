use std::path::PathBuf;
use std::fs;
use std::time::{Duration, Instant};
use std::thread;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use std::sync::{Arc, Mutex};

pub struct DatabaseManager {
    mongo_process: Option<CommandChild>,
    data_dir: PathBuf,
    port: u16,
}

impl DatabaseManager {
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self, String> {
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        // Create data directories
        fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;

        Ok(DatabaseManager {
            mongo_process: None,
            data_dir,
            port: 0,
        })
    }

    pub fn start_mongodb(&mut self, app_handle: &tauri::AppHandle, port: u16) -> Result<(), String> {
        self.port = port;
        let mongo_data_dir = self.data_dir.join("mongodb");
        log::info!("MongoDB data directory: {:?}", mongo_data_dir);

        fs::create_dir_all(&mongo_data_dir).map_err(|e| format!("Failed to create MongoDB dir: {}", e))?;
        log::info!("MongoDB data directory created/verified");

        // Log the sidecar path for debugging
        log::info!("Attempting to spawn mongod sidecar on port {}...", port);

        let port_str = port.to_string();
        let (mut rx, child) = app_handle
            .shell()
            .sidecar("mongod")
            .map_err(|e| format!("Failed to create mongod sidecar: {}", e))?
            .args(["--dbpath", mongo_data_dir.to_str().unwrap()])
            .args(["--port", &port_str])
            .args(["--bind_ip", "127.0.0.1"])
            .spawn()
            .map_err(|e| format!("Failed to start MongoDB: {}", e))?;

        self.mongo_process = Some(child);
        log::info!("MongoDB process spawned, waiting for it to be ready...");

        // Spawn a thread to capture MongoDB output
        let mongo_output: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let mongo_output_clone = mongo_output.clone();

        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        log::info!("[MongoDB stdout] {}", line_str);
                        if let Ok(mut output) = mongo_output_clone.lock() {
                            output.push(line_str);
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        log::error!("[MongoDB stderr] {}", line_str);
                        if let Ok(mut output) = mongo_output_clone.lock() {
                            output.push(format!("STDERR: {}", line_str));
                        }
                    }
                    CommandEvent::Error(err) => {
                        log::error!("[MongoDB error] {}", err);
                    }
                    CommandEvent::Terminated(payload) => {
                        log::warn!("[MongoDB terminated] code: {:?}, signal: {:?}", payload.code, payload.signal);
                    }
                    _ => {}
                }
            }
        });

        // Wait for MongoDB to be ready (up to 30 seconds)
        let timeout = Duration::from_secs(30);
        let start = Instant::now();
        let check_interval = Duration::from_millis(500);

        while start.elapsed() < timeout {
            if self.check_mongodb_health() {
                log::info!("MongoDB is ready and accepting connections on port {}", self.port);
                return Ok(());
            }

            log::info!("Waiting for MongoDB to be ready... ({:.1}s elapsed)", start.elapsed().as_secs_f32());
            thread::sleep(check_interval);
        }

        // If we get here, MongoDB didn't start in time
        log::error!("MongoDB failed to become ready within {} seconds", timeout.as_secs());

        // Log captured MongoDB output
        if let Ok(output) = mongo_output.lock() {
            log::error!("MongoDB output captured ({} lines):", output.len());
            for line in output.iter().take(50) {
                log::error!("  {}", line);
            }
        }

        // Try to get any error information
        log::error!("MongoDB may have crashed. Check the data directory for lock files or corrupted data.");
        log::error!("Data directory: {:?}", mongo_data_dir);

        // List files in data directory for debugging
        if let Ok(entries) = fs::read_dir(&mongo_data_dir) {
            log::info!("Files in MongoDB data directory:");
            for entry in entries.flatten() {
                log::info!("  - {:?}", entry.path());
            }
        }

        Err(format!("MongoDB failed to start within {} seconds. Check logs for details.", timeout.as_secs()))
    }

    pub fn check_mongodb_health(&self) -> bool {
        // Simple TCP check on MongoDB port
        std::net::TcpStream::connect(format!("127.0.0.1:{}", self.port)).is_ok()
    }

    pub fn shutdown(&mut self) {
        if let Some(process) = self.mongo_process.take() {
            let _ = process.kill();
            log::info!("MongoDB stopped");
        }
    }
}

impl Drop for DatabaseManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}
