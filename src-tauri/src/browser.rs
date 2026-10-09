use tauri::{AppHandle, Manager, Url, Webview};

use crate::error::{Error, Result};

// Browser panes are child webviews created from the webview
// (`new Webview(...)` in src/lib/native-browser.ts). The JS API can
// position, size, show and close them, but not navigate or read their
// URL, so those few calls live here.

fn webview(app: &AppHandle, label: &str) -> Result<Webview> {
    app.get_webview(label)
        .ok_or_else(|| Error::NotFound(format!("no browser pane {label}")))
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, label: String, url: String) -> Result<()> {
    let url = Url::parse(&url).map_err(|e| Error::BadInput(e.to_string()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(Error::BadInput("only http(s) URLs".into()));
    }
    webview(&app, &label)?.navigate(url)?;
    Ok(())
}

#[tauri::command]
pub fn browser_history(app: AppHandle, label: String, action: String) -> Result<()> {
    let js = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        other => return Err(Error::BadInput(format!("unknown action {other}"))),
    };
    webview(&app, &label)?.eval(js)?;
    Ok(())
}

#[tauri::command]
pub fn browser_url(app: AppHandle, label: String) -> Result<String> {
    Ok(webview(&app, &label)?.url()?.to_string())
}
