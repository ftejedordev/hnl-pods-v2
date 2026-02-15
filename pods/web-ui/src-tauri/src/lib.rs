mod database_manager;
mod backend_manager;

use database_manager::DatabaseManager;
use backend_manager::BackendManager;
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::Manager;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};

/// Detected system dependencies paths
#[derive(Debug, Clone, serde::Serialize)]
pub struct SystemDependencies {
    pub node_bin_dir: Option<PathBuf>,
    pub npx_bin_dir: Option<PathBuf>,
    pub uv_bin_dir: Option<PathBuf>,
    pub node_version: Option<String>,
    pub npx_version: Option<String>,
    pub uv_version: Option<String>,
}

impl SystemDependencies {
    /// Get all unique bin directories to add to PATH
    pub fn get_bin_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Some(dir) = &self.node_bin_dir {
            if !dirs.contains(dir) {
                dirs.push(dir.clone());
            }
        }

        if let Some(dir) = &self.npx_bin_dir {
            if !dirs.contains(dir) {
                dirs.push(dir.clone());
            }
        }

        if let Some(dir) = &self.uv_bin_dir {
            if !dirs.contains(dir) {
                dirs.push(dir.clone());
            }
        }

        dirs
    }
}

/// Validate system dependencies and get their installation paths
fn validate_system_dependencies() -> Result<SystemDependencies, String> {
    let mut missing = Vec::new();
    let mut deps = SystemDependencies {
        node_bin_dir: None,
        npx_bin_dir: None,
        uv_bin_dir: None,
        node_version: None,
        npx_version: None,
        uv_version: None,
    };

    // Check Node.js
    log::info!("🔍 Starting Node.js detection...");
    match find_command_path("node") {
        Some((path, version)) => {
            log::info!("✅ Found Node.js {} at: {:?}", version, path);
            deps.node_bin_dir = path.parent().map(|p| p.to_path_buf());
            deps.node_version = Some(version);
        }
        None => {
            log::error!("❌ Node.js NOT FOUND in filesystem search");
            missing.push("✗ Node.js (requerido)\n  Instala desde: https://nodejs.org");
        }
    }

    // Check NPX
    match find_command_path("npx") {
        Some((path, version)) => {
            log::info!("✅ Found NPX {} at: {:?}", version, path);
            deps.npx_bin_dir = path.parent().map(|p| p.to_path_buf());
            deps.npx_version = Some(version);
        }
        None => {
            missing.push("✗ NPX (viene con Node.js)\n  Reinstala Node.js si falta");
        }
    }

    // Check UV (optional)
    match find_command_path("uv") {
        Some((path, version)) => {
            log::info!("✅ Found UV {} at: {:?}", version, path);
            deps.uv_bin_dir = path.parent().map(|p| p.to_path_buf());
            deps.uv_version = Some(version);
        }
        None => {
            log::info!("ℹ️  UV not found (opcional para MCP servers basados en Python)");
        }
    }

    if !missing.is_empty() {
        let error_msg = format!(
            "Dependencias faltantes:\n\n{}\n\n\
            HypernovaLabs Pods requiere estas herramientas para ejecutar MCP servers.",
            missing.join("\n\n")
        );
        Err(error_msg)
    } else {
        Ok(deps)
    }
}

/// Get user's login shell PATH (respects .zshrc, .bashrc, brew, nvm, etc.)
pub fn get_user_shell_path() -> Option<String> {
    log::info!("Getting user PATH using multiple strategies...");

    // Windows: Just use system PATH
    if cfg!(target_os = "windows") {
        log::info!("  Windows: Using system PATH");
        if let Ok(path) = std::env::var("PATH") {
            log::info!("  ✓ Got PATH from environment: {} chars", path.len());
            return Some(path);
        }
        log::warn!("  ✗ Could not get PATH from environment");
        return None;
    }

    // macOS/Linux strategies
    // Strategy 1: Try launchctl getenv PATH (works in sandbox)
    log::info!("  Strategy 1: launchctl getenv PATH");
    if let Some(path) = try_launchctl_path() {
        log::info!("  ✓ Got PATH from launchctl: {}", path);
        return Some(path);
    }

    // Strategy 2: Try shell in login mode (may be blocked by sandbox)
    log::info!("  Strategy 2: Shell login mode");
    if let Some(path) = try_shell_login_path() {
        log::info!("  ✓ Got PATH from shell: {}", path);
        return Some(path);
    }

    // Strategy 3: Try reading /etc/paths and /etc/paths.d/* (macOS standard)
    log::info!("  Strategy 3: /etc/paths");
    if let Some(path) = try_etc_paths() {
        log::info!("  ✓ Got PATH from /etc/paths: {}", path);
        return Some(path);
    }

    log::warn!("  ✗ All strategies failed");
    None
}

fn try_launchctl_path() -> Option<String> {
    let output = std::process::Command::new("launchctl")
        .args(&["getenv", "PATH"])
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

fn try_shell_login_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let output = std::process::Command::new(&shell)
        .arg("-l")
        .arg("-c")
        .arg("echo $PATH")
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

fn try_etc_paths() -> Option<String> {
    use std::fs;

    let mut paths = Vec::new();

    // Read /etc/paths
    if let Ok(content) = fs::read_to_string("/etc/paths") {
        for line in content.lines() {
            let line = line.trim();
            if !line.is_empty() && !line.starts_with('#') {
                paths.push(line.to_string());
            }
        }
    }

    // Read /etc/paths.d/*
    if let Ok(entries) = fs::read_dir("/etc/paths.d") {
        for entry in entries.flatten() {
            if let Ok(content) = fs::read_to_string(entry.path()) {
                for line in content.lines() {
                    let line = line.trim();
                    if !line.is_empty() && !line.starts_with('#') {
                        paths.push(line.to_string());
                    }
                }
            }
        }
    }

    // Add common homebrew locations if they exist
    if let Ok(home) = std::env::var("HOME") {
        let local_bin = format!("{}/.local/bin", home);
        let cargo_bin = format!("{}/.cargo/bin", home);

        let common_paths = vec![
            "/opt/homebrew/bin",
            "/usr/local/bin",
            local_bin.as_str(),
            cargo_bin.as_str(),
        ];

        for path in common_paths {
            if std::path::Path::new(path).exists() && !paths.contains(&path.to_string()) {
                paths.push(path.to_string());
            }
        }
    }

    if paths.is_empty() {
        return None;
    }

    Some(paths.join(":"))
}

/// Find command by searching filesystem directly (no PATH needed)
fn find_command_path(cmd: &str) -> Option<(PathBuf, String)> {
    log::info!("🔎 Searching for '{}' in filesystem...", cmd);

    // On Windows, use 'where' command which searches PATH
    if cfg!(target_os = "windows") {
        log::info!("  Using Windows 'where' command");

        // Try with .exe extension first
        let cmd_exe = format!("{}.exe", cmd);
        let output = std::process::Command::new("where")
            .arg(&cmd_exe)
            .output()
            .ok()?;

        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            let first_path = path_str.lines().next()?.trim();
            let cmd_path = PathBuf::from(first_path);

            log::info!("  Found {} at: {:?}", cmd, cmd_path);

            // .exe files can be executed directly
            let version_output = std::process::Command::new(&cmd_path)
                .arg("--version")
                .output()
                .ok()?;

            if version_output.status.success() {
                let version = String::from_utf8_lossy(&version_output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("unknown")
                    .trim()
                    .to_string();

                log::info!("  ✓ Found '{}' version: {}", cmd, version);
                return Some((cmd_path, version));
            }
        }

        // Also try without .exe (for .cmd files like npx.cmd)
        let output = std::process::Command::new("where")
            .arg(cmd)
            .output()
            .ok()?;

        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);

            // Try all paths returned by 'where' (it can return multiple)
            for path_line in path_str.lines() {
                let path_line = path_line.trim();
                if path_line.is_empty() {
                    continue;
                }

                let cmd_path = PathBuf::from(path_line);
                log::info!("  Found {} at: {:?}", cmd, cmd_path);

                // On Windows, .cmd files need to be executed through cmd.exe
                let version_output = if path_line.ends_with(".cmd") || !path_line.ends_with(".exe") {
                    log::info!("  Executing via cmd.exe /c");
                    std::process::Command::new("cmd")
                        .args(&["/c", cmd, "--version"])
                        .output()
                } else {
                    std::process::Command::new(&cmd_path)
                        .arg("--version")
                        .output()
                };

                if let Ok(output) = version_output {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout)
                            .lines()
                            .next()
                            .unwrap_or("unknown")
                            .trim()
                            .to_string();

                        log::info!("  ✓ Found '{}' version: {}", cmd, version);
                        return Some((cmd_path, version));
                    }
                }
            }
        }

        log::error!("  ❌ '{}' not found on Windows PATH", cmd);
        return None;
    }

    // Unix/macOS code (original)
    let home = match std::env::var("HOME") {
        Ok(h) => {
            log::info!("  HOME directory: {}", h);
            h
        }
        Err(_) => {
            log::error!("  ❌ Failed to get HOME directory");
            return None;
        }
    };

    // Define search locations in order of priority
    let search_locations = vec![
        // Homebrew locations (most common)
        PathBuf::from("/opt/homebrew/bin"),      // Apple Silicon
        PathBuf::from("/usr/local/bin"),         // Intel Mac

        // System paths
        PathBuf::from("/usr/bin"),

        // User local installations
        PathBuf::from(format!("{}/.local/bin", home)),

        // nvm installations - search all versions
        PathBuf::from(format!("{}/.nvm/versions/node", home)),

        // n version manager
        PathBuf::from(format!("{}/n/bin", home)),
    ];

    log::info!("  Will search in {} locations", search_locations.len());

    // Build a PATH string from search locations for script execution
    let search_path = search_locations
        .iter()
        .filter_map(|p| p.to_str())
        .collect::<Vec<_>>()
        .join(":");

    log::info!("  Built search PATH: {}", search_path);

    // Search each location
    for (idx, base_path) in search_locations.iter().enumerate() {
        log::info!("  [{}/{}] Checking: {:?}", idx + 1, search_locations.len(), base_path);

        // Check if it's an nvm directory (contains version folders)
        if base_path.to_string_lossy().contains(".nvm/versions/node") && base_path.exists() {
            log::info!("    Found nvm directory, searching versions...");
            // Search through nvm versions
            if let Ok(entries) = std::fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let cmd_path = entry.path().join("bin").join(cmd);
                    log::info!("      Trying: {:?}", cmd_path);
                    if let Some(result) = check_and_verify_command(&cmd_path, cmd, &search_path) {
                        return Some(result);
                    }
                }
            }
        } else {
            // Direct search in bin directory
            let cmd_path = base_path.join(cmd);
            log::info!("    Trying: {:?}", cmd_path);
            log::info!("    Exists? {}", cmd_path.exists());

            if let Some(result) = check_and_verify_command(&cmd_path, cmd, &search_path) {
                return Some(result);
            }
        }
    }

    log::error!("  ❌ '{}' not found in any location after searching {} paths", cmd, search_locations.len());
    None
}

/// Check if command exists at path and get version
fn check_and_verify_command(cmd_path: &PathBuf, cmd_name: &str, path_env: &str) -> Option<(PathBuf, String)> {
    // Check if file exists (follows symlinks)
    if !cmd_path.exists() {
        return None;
    }

    // Get metadata following symlinks
    let metadata = std::fs::metadata(cmd_path).ok()?;

    // Check if it's a file (symlinks are resolved by metadata())
    if !metadata.is_file() {
        return None;
    }

    // Try to execute and get version
    // IMPORTANT: Pass PATH so scripts like npx can find node
    let version_output = std::process::Command::new(cmd_path)
        .arg("--version")
        .env("PATH", path_env)  // ← KEY FIX: NPX needs to find 'node'
        .output()
        .ok()?;

    if !version_output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&version_output.stdout)
        .lines()
        .next()
        .unwrap_or("unknown")
        .trim()
        .to_string();

    log::info!("  ✓ Found '{}' at: {} ({})", cmd_name, cmd_path.display(), version);
    Some((cmd_path.clone(), version))
}

pub struct AppState {
    database_manager: Mutex<DatabaseManager>,
    backend_manager: Mutex<BackendManager>,
    system_dependencies: SystemDependencies,
}

#[tauri::command]
fn check_services_health(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let db_manager = state.database_manager.lock().unwrap();
    let backend_manager = state.backend_manager.lock().unwrap();

    let mongo_healthy = db_manager.check_mongodb_health();
    let backend_healthy = backend_manager.check_backend_health();

    Ok(serde_json::json!({
        "mongodb": mongo_healthy,
        "backend": backend_healthy,
        "all_healthy": mongo_healthy && backend_healthy
    }))
}

#[tauri::command]
fn get_system_dependencies(state: tauri::State<AppState>) -> SystemDependencies {
    state.system_dependencies.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      // Cargar el icono del tray desde ICON-pods.png
      let icon_bytes = include_bytes!("../icons/ICON-pods.png");

      // Decodificar PNG a RGBA
      let img = image::load_from_memory(icon_bytes)
        .expect("Failed to decode icon")
        .to_rgba8();

      let (width, height) = img.dimensions();
      let rgba = img.into_raw();

      // Crear tauri::image::Image
      let icon = tauri::image::Image::new_owned(rgba, width, height);

      // Crear menú contextual del tray con opciones
      let show_hide = MenuItem::with_id(app, "toggle", "Show/Hide", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_hide, &quit])?;

      // Crear el tray icon con menú
      let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("HypernovaLabs Pods")
        .menu(&menu)
        .on_menu_event(|app, event| {
          match event.id.as_ref() {
            "toggle" => {
              // Toggle show/hide ventana
              if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                  let _ = window.hide();
                } else {
                  let _ = window.show();
                  let _ = window.set_focus();
                }
              }
            }
            "quit" => {
              // Cleanup completo antes de cerrar
              log::info!("🛑 Quit solicitado desde tray - iniciando cleanup...");

              // Obtener state para acceder a los managers
              if let Some(state) = app.try_state::<AppState>() {
                // Shutdown backend
                if let Ok(mut backend) = state.backend_manager.lock() {
                  log::info!("🔌 Cerrando backend...");
                  backend.shutdown();
                }

                // Shutdown MongoDB
                if let Ok(mut db) = state.database_manager.lock() {
                  log::info!("🗄️  Cerrando MongoDB...");
                  db.shutdown();
                }
              }

              // Matar procesos MCP huérfanos (Node.js/npm/uvx)
              log::info!("🧹 Limpiando procesos MCP...");
              if cfg!(target_os = "windows") {
                // Windows: usar taskkill para matar procesos node relacionados con MCP
                let _ = std::process::Command::new("taskkill")
                  .args(&["/F", "/IM", "node.exe"])
                  .output();
              } else {
                // Unix/macOS: usar pkill
                let _ = std::process::Command::new("pkill")
                  .args(&["-f", "mcp-server-"])
                  .output();
                let _ = std::process::Command::new("pkill")
                  .args(&["-f", "bash-mcp"])
                  .output();
              }

              log::info!("✅ Cleanup completado - cerrando app");
              app.exit(0);
            }
            _ => {}
          }
        })
        .on_tray_icon_event(|tray, event| {
          // Manejar clicks en el icono (para compatibilidad)
          match event {
            TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } => {
              // Toggle show/hide ventana con click izquierdo
              let app = tray.app_handle();
              if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                  let _ = window.hide();
                } else {
                  let _ = window.show();
                  let _ = window.set_focus();
                }
              }
            }
            _ => {}
          }
        })
        .build(app)?;

      // Enable logging in both debug and production to diagnose dependency detection issues
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .build(),
      )?;

      // Check if we should skip embedded services (only allowed in debug mode)
      let skip_embedded_services = cfg!(debug_assertions) &&
        std::env::var("SKIP_EMBEDDED_SERVICES").unwrap_or_default() == "true";

      let (db_manager, backend_manager, system_deps) = if skip_embedded_services {
        log::info!("SKIP_EMBEDDED_SERVICES=true - Using external services for development");
        log::info!("Expected MongoDB at: mongodb://localhost:27017");
        log::info!("Expected Backend at: http://localhost:8000");

        // Validate system dependencies even in external mode (needed for MCP servers)
        let system_deps = validate_system_dependencies().unwrap_or_else(|err| {
          log::warn!("⚠️ System dependencies validation failed: {}", err);
          SystemDependencies {
            node_bin_dir: None,
            npx_bin_dir: None,
            uv_bin_dir: None,
            node_version: None,
            npx_version: None,
            uv_version: None,
          }
        });

        (DatabaseManager::new(&app.handle())?, BackendManager::new(), system_deps)
      } else {
        log::info!("Starting embedded database and backend services...");

        // 🧹 CLEANUP: Matar procesos huérfanos de instalaciones previas o ejecuciones anteriores
        log::info!("🧹 Limpiando procesos huérfanos antes de iniciar servicios...");

        if cfg!(target_os = "windows") {
          // Windows: usar taskkill
          let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", "pods-backend.exe"])
            .output();

          let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", "mongod.exe"])
            .output();

          // Matar procesos Node.js relacionados con MCP servers
          let _ = std::process::Command::new("cmd")
            .args(&["/C", "FOR /F \"tokens=5\" %a IN ('netstat -aon ^| findstr :27017 ^| findstr LISTENING') DO taskkill /F /PID %a 2>NUL"])
            .output();

          let _ = std::process::Command::new("cmd")
            .args(&["/C", "FOR /F \"tokens=5\" %a IN ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') DO taskkill /F /PID %a 2>NUL"])
            .output();
        } else {
          // Unix/macOS: usar pkill y lsof
          let _ = std::process::Command::new("pkill")
            .args(&["-9", "-f", "pods-backend"])
            .output();

          let _ = std::process::Command::new("sh")
            .arg("-c")
            .arg("lsof -ti:27017 | xargs kill -9 2>/dev/null || true")
            .output();

          let _ = std::process::Command::new("sh")
            .arg("-c")
            .arg("lsof -ti:8000 | xargs kill -9 2>/dev/null || true")
            .output();

          let _ = std::process::Command::new("pkill")
            .args(&["-9", "-f", "mcp-server-"])
            .output();
          let _ = std::process::Command::new("pkill")
            .args(&["-9", "-f", "bash-mcp"])
            .output();
        }

        log::info!("✅ Limpieza de procesos completada");

        // Esperar un momento para que los puertos se liberen
        std::thread::sleep(std::time::Duration::from_millis(500));

        // Validate system dependencies and get their paths
        log::info!("Validating system dependencies (Node.js, NPX, UV)...");
        let system_deps = match validate_system_dependencies() {
          Ok(deps) => {
            log::info!("✅ System dependencies validated successfully");

            // Log detected paths
            let bin_dirs = deps.get_bin_dirs();
            log::info!("Detected bin directories: {:?}", bin_dirs);

            deps
          }
          Err(error_msg) => {
            log::error!("❌ System dependencies validation failed: {}", error_msg);

            // Show error dialog to user
            use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
            let _ = app.dialog()
              .message(format!(
                "⚠️ {}\n\n\
                Por favor instala las dependencias faltantes y reinicia la aplicación.",
                error_msg
              ))
              .title("Dependencias del Sistema Requeridas")
              .kind(MessageDialogKind::Error)
              .blocking_show();

            // Exit the app with error
            return Err(error_msg.into());
          }
        };

        // Initialize database manager
        let mut db_manager = DatabaseManager::new(&app.handle())
          .map_err(|e| format!("Failed to create database manager: {}", e))?;

        // Start MongoDB (includes waiting for it to be ready)
        db_manager.start_mongodb(&app.handle())
          .map_err(|e| format!("Failed to start MongoDB: {}", e))?;

        // Initialize backend manager with detected system dependencies
        let mut backend_manager = BackendManager::new();

        // Clone system_deps before moving into start_backend
        let system_deps_clone = system_deps.clone();

        // Start backend with detected dependency paths
        backend_manager.start_backend(&app.handle(), system_deps_clone)
          .map_err(|e| format!("Failed to start backend: {}", e))?;

        // Wait for backend to be ready
        std::thread::sleep(std::time::Duration::from_secs(2));

        log::info!("All embedded services started successfully");

        (db_manager, backend_manager, system_deps)
      };

      // Store managers and dependencies in app state
      app.manage(AppState {
        database_manager: Mutex::new(db_manager),
        backend_manager: Mutex::new(backend_manager),
        system_dependencies: system_deps,
      });

      Ok(())
    })
    .on_window_event(|window, event| {
      // Prevenir que el botón X cierre la app - en su lugar, minimizar al tray
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        window.hide().unwrap();
        api.prevent_close();
      }
    })
    .invoke_handler(tauri::generate_handler![check_services_health, get_system_dependencies])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
