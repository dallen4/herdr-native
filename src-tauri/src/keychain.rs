#[cfg(not(target_os = "ios"))]
use keyring::Entry;
use keyring::Error as KeyringError;

use crate::error::Result;

const SERVICE: &str = "devhub";

/// keyring's v1 API picks a store per OS but deliberately sets none on
/// iOS, so `keyring::Entry::new` fails there with "no default store".
/// On iOS, register the data-protection keychain the first time an entry
/// is needed (not in app setup, so nothing depends on startup order) and
/// build entries straight from keyring-core.
#[cfg(target_os = "ios")]
fn entry(account: &str) -> Result<keyring_core::Entry> {
    static STORE: std::sync::Once = std::sync::Once::new();
    STORE.call_once(|| {
        if let Ok(store) =
            apple_native_keyring_store::protected::Store::new()
        {
            keyring_core::set_default_store(store);
        }
    });
    Ok(keyring_core::Entry::new(SERVICE, account)?)
}

#[cfg(not(target_os = "ios"))]
fn entry(account: &str) -> Result<Entry> {
    Ok(Entry::new(SERVICE, account)?)
}

// Bridge tokens live in the OS keychain (macOS Keychain, Windows
// Credential Manager, Linux Secret Service), keyed per machine, never in
// webview storage. Same keyring crate and features as deadrop/desktop.

/// The stored secret for `account`, or None when there isn't one.
#[tauri::command]
pub fn secret_get(account: String) -> Result<Option<String>> {
    match entry(&account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub fn secret_set(account: String, secret: String) -> Result<()> {
    entry(&account)?.set_password(&secret)?;
    Ok(())
}

#[tauri::command]
pub fn secret_delete(account: String) -> Result<()> {
    match entry(&account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
