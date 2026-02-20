use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

#[derive(Serialize)]
struct RuntimeInfo {
    backend_port: u16,
    pid: u32,
    started_at: String,
}

/// Get the path to the CLI's runtime file: ~/.config/pods-cli/runtime.json
pub fn runtime_file_path() -> Result<PathBuf, String> {
    let home = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").or_else(|_| {
            std::env::var("HOMEDRIVE").and_then(|drive| {
                std::env::var("HOMEPATH").map(|path| format!("{}{}", drive, path))
            })
        })
    } else {
        std::env::var("HOME")
    }
    .map_err(|_| "Cannot determine home directory".to_string())?;

    Ok(PathBuf::from(home)
        .join(".config")
        .join("pods-cli")
        .join("runtime.json"))
}

/// Write the runtime file after backend starts successfully.
pub fn write_runtime_file(backend_port: u16) -> Result<(), String> {
    let path = runtime_file_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create runtime dir: {}", e))?;
    }

    let info = RuntimeInfo {
        backend_port,
        pid: std::process::id(),
        started_at: format_system_time(SystemTime::now()),
    };

    let json = serde_json::to_string_pretty(&info)
        .map_err(|e| format!("Failed to serialize runtime info: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write runtime file: {}", e))?;

    log::info!("Runtime file written: {:?} (port={}, pid={})", path, backend_port, info.pid);
    Ok(())
}

/// Delete the runtime file. Errors are logged but not propagated.
pub fn remove_runtime_file() {
    match runtime_file_path() {
        Ok(path) => {
            if path.exists() {
                if let Err(e) = fs::remove_file(&path) {
                    log::warn!("Failed to remove runtime file {:?}: {}", path, e);
                } else {
                    log::info!("Runtime file removed: {:?}", path);
                }
            }
        }
        Err(e) => {
            log::warn!("Could not determine runtime file path for cleanup: {}", e);
        }
    }
}

/// Format SystemTime as ISO 8601 string without external crates.
fn format_system_time(time: SystemTime) -> String {
    let duration = time
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();

    let days = secs / 86400;
    let day_secs = secs % 86400;
    let hours = day_secs / 3600;
    let minutes = (day_secs % 3600) / 60;
    let seconds = day_secs % 60;

    // Civil date from days (Howard Hinnant's algorithm)
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, hours, minutes, seconds
    )
}
