use serde::Serialize;
use tauri::AppHandle;

use crate::error::Result;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    os: &'static str,
    arch: &'static str,
}

/// Build metadata for the status bar and diagnostics.
#[tauri::command]
pub fn app_info(app: AppHandle) -> Result<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    })
}
