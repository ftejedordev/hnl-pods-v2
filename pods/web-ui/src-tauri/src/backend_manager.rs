use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::process::CommandEvent;
use crate::get_user_shell_path;

pub struct BackendManager {
    backend_process: Option<CommandChild>,
    port: u16,
}

impl BackendManager {
    pub fn new() -> Self {
        BackendManager {
            backend_process: None,
            port: 0,
        }
    }

    pub fn set_port(&mut self, port: u16) {
        self.port = port;
    }

    pub fn start_backend(&mut self, app_handle: &tauri::AppHandle, system_deps: crate::SystemDependencies, backend_port: u16, mongo_port: u16) -> Result<(), String> {
        self.port = backend_port;
        // Get Chromium path for Playwright - platform-specific
        let chromium_subpath = if cfg!(target_os = "macos") {
            "chrome-mac/Chromium.app/Contents/MacOS/Chromium"
        } else if cfg!(target_os = "windows") {
            "chrome-win/chrome.exe"
        } else if cfg!(target_os = "linux") {
            "chrome-linux/chrome"
        } else {
            return Err("Unsupported platform for Chromium".to_string());
        };

        let chromium_path = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?
            .join("binaries")
            .join("chromium")
            .join(chromium_subpath);

        log::info!("Chromium path configured: {:?}", chromium_path);

        // Get user's shell PATH (respects .zshrc, .bashrc, Homebrew, nvm, etc.)
        let user_shell_path = get_user_shell_path();

        // Build enhanced PATH with detected dependency locations
        let mut enhanced_path_parts: Vec<String> = Vec::new();

        // PRIORITY 1: Add detected system dependencies bin directories
        log::info!("Building backend PATH:");
        log::info!("  Adding detected dependency directories:");
        for bin_dir in system_deps.get_bin_dirs() {
            if let Some(dir_str) = bin_dir.to_str() {
                if !enhanced_path_parts.contains(&dir_str.to_string()) {
                    enhanced_path_parts.push(dir_str.to_string());
                    log::info!("    ✓ {}", dir_str);
                }
            }
        }

        // PRIORITY 2: Add user's full shell PATH (includes Homebrew, nvm, n, etc.)
        // Use platform-specific PATH separator
        let path_separator = if cfg!(target_os = "windows") { ";" } else { ":" };

        if let Some(shell_path) = user_shell_path {
            log::info!("  Adding user shell PATH (includes all user configurations)");
            for path_entry in shell_path.split(path_separator) {
                if !path_entry.is_empty() && !enhanced_path_parts.contains(&path_entry.to_string()) {
                    enhanced_path_parts.push(path_entry.to_string());
                }
            }
        } else {
            log::warn!("  Could not get user shell PATH, using system PATH as fallback");
            let current_path = std::env::var("PATH").unwrap_or_default();
            enhanced_path_parts.push(current_path);
        }

        let enhanced_path = enhanced_path_parts.join(path_separator);

        log::info!("Backend PATH: {}", enhanced_path);

        // Dynamic cache directory for user-added MCP packages
        // Use platform-specific home directory
        let home_dir = if cfg!(target_os = "windows") {
            std::env::var("USERPROFILE").unwrap_or_else(|_| {
                std::env::var("HOMEDRIVE")
                    .and_then(|drive| {
                        std::env::var("HOMEPATH").map(|path| format!("{}{}", drive, path))
                    })
                    .unwrap_or_else(|_| "C:\\Users\\Default".to_string())
            })
        } else {
            std::env::var("HOME").unwrap_or_else(|_| {
                std::env::var("USER")
                    .map(|user| format!("/Users/{}", user))
                    .unwrap_or_else(|_| "/tmp".to_string())
            })
        };

        let npx_cache_dir = if cfg!(target_os = "windows") {
            format!("{}\\.hypernova-pods\\npm-cache", home_dir)
        } else {
            format!("{}/.hypernova-pods/npm-cache", home_dir)
        };

        // Get chromium base directory for PLAYWRIGHT_BROWSERS_PATH
        let chromium_base_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?
            .join("binaries")
            .join("chromium");

        let backend_process = app_handle
            .shell()
            .sidecar("pods-backend")
            .map_err(|e| format!("Failed to create pods-backend sidecar: {}", e))?
            .env("DB_URI_MONGO", &format!("mongodb://localhost:{}/hypernova_pods", mongo_port))
            .env("DB_URI_POSTGRES", "postgresql://postgres@localhost:5432/hypernova_vectordb")
            .env("JWT_SECRET_KEY", "hypernova_secret_key_2024_pods")
            .env("PORT", &backend_port.to_string())
            .env("PATH", enhanced_path)
            .env("npm_config_cache", &npx_cache_dir)
            .env("NPM_CONFIG_PREFIX", &npx_cache_dir)
            .env("PLAYWRIGHT_BROWSERS_PATH", chromium_base_dir.to_str().unwrap_or(""))
            .env("ENCRYPTION_KEY", "hypernova_encryption_key_2024_pods")
            .env("SUPABASE_URL", &std::env::var("SUPABASE_URL")
                .unwrap_or_else(|_| "https://naxensxazwrosphdttqi.supabase.co".to_string()))
            .env("SUPABASE_KEY", &std::env::var("SUPABASE_KEY")
                .unwrap_or_else(|_| "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5heGVuc3hhendyb3NwaGR0dHFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMDc0OTUsImV4cCI6MjA4Njc4MzQ5NX0.h9XYSc6rHst2L2OOvU9WgiGviNP_pcJzGr9Oyy4hWIU".to_string()))
            .env("RUST_LOG", "info,pods_backend=debug")
            .spawn()
            .map_err(|e| format!("Failed to start backend: {}", e))?;

        let (mut rx, child) = backend_process;

        // Spawn async task to forward backend stdout/stderr to Tauri logs
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        log::info!("[Backend] {}", line_str);
                    }
                    CommandEvent::Stderr(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        log::error!("[Backend stderr] {}", line_str);
                    }
                    CommandEvent::Error(err) => {
                        log::error!("[Backend error] {}", err);
                    }
                    CommandEvent::Terminated(payload) => {
                        log::warn!("[Backend terminated] code: {:?}, signal: {:?}", payload.code, payload.signal);
                    }
                    _ => {}
                }
            }
        });

        self.backend_process = Some(child);
        log::info!("Backend started on port {}", backend_port);
        Ok(())
    }

    pub fn check_backend_health(&self) -> bool {
        // Try to connect to backend HTTP endpoint
        match std::net::TcpStream::connect(format!("127.0.0.1:{}", self.port)) {
            Ok(_) => {
                // Additional check: try HTTP request
                match ureq::get(&format!("http://127.0.0.1:{}/health", self.port)).call() {
                    Ok(response) => response.status() == 200,
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }

    pub fn shutdown(&mut self) {
        if let Some(process) = self.backend_process.take() {
            let _ = process.kill();
            log::info!("Backend stopped");
        }
    }
}

impl Drop for BackendManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}
