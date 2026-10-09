mod app_info;
mod browser;
mod error;
mod keychain;

use app_info::app_info;
use browser::{browser_history, browser_navigate, browser_url};
use keychain::{secret_delete, secret_get, secret_set};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(feature = "devtools")]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            browser_navigate,
            browser_history,
            browser_url,
            secret_get,
            secret_set,
            secret_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
