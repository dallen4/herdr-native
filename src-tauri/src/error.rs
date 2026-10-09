use serde::{Serialize, Serializer};

/// The one error type every `#[tauri::command]` returns.
///
/// Commands return `Result<T, Error>` rather than swallowing failures
/// into `Option`/unit, so the webview's `invoke` rejects with a stable,
/// matchable shape: `{ code, message }`.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error(transparent)]
    Keyring(#[from] keyring::Error),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    BadInput(String),
}

impl Error {
    fn code(&self) -> &'static str {
        match self {
            Error::Tauri(_) => "tauri",
            Error::Keyring(_) => "keychain",
            Error::NotFound(_) => "not_found",
            Error::BadInput(_) => "bad_input",
        }
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Error", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type Result<T> = std::result::Result<T, Error>;
