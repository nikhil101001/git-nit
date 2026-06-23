//! Application error type, serialized to the frontend as a typed payload.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("no repository is open")]
    NoRepoOpen,

    #[error("invalid path: {0}")]
    InvalidPath(String),

    #[error("git error: {0}")]
    Git(#[from] git2::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("filesystem watcher error: {0}")]
    Watch(String),

    #[error("internal task failure")]
    TaskJoin,

    #[error("internal state lock was poisoned")]
    Poisoned,
}

/// Short machine-readable discriminant so the frontend can branch on error kind
/// without parsing the message.
impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::NoRepoOpen => "noRepoOpen",
            AppError::InvalidPath(_) => "invalidPath",
            AppError::Git(_) => "git",
            AppError::Io(_) => "io",
            AppError::Watch(_) => "watch",
            AppError::TaskJoin => "taskJoin",
            AppError::Poisoned => "poisoned",
        }
    }
}

/// Typed shape the frontend receives on a rejected `invoke`.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub kind: String,
    pub message: String,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            kind: self.kind().to_string(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
