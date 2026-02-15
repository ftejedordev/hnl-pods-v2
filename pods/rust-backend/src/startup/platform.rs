use std::path::PathBuf;

/// Get the user's Documents directory (cross-platform)
pub fn get_documents_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(|p| PathBuf::from(p).join("Documents"))
    }
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|p| p.join("Documents"))
    }
    #[cfg(target_os = "linux")]
    {
        dirs::home_dir().map(|p| p.join("Documents"))
    }
}

/// Get the app data directory
#[allow(dead_code)]
pub fn get_app_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string()))
                    .join("AppData")
                    .join("Local")
            })
            .join("HypernovaLabs-Pods")
    }
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Library")
            .join("Application Support")
            .join("HypernovaLabs-Pods")
    }
    #[cfg(target_os = "linux")]
    {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".local")
            .join("share")
            .join("HypernovaLabs-Pods")
    }
}
