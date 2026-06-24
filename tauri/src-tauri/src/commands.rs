//! Tauri command surface (the IPC boundary).
//!
//! Commands are `async`; the actual (synchronous, possibly slow) git2 work runs
//! on `spawn_blocking` so the webview never blocks. `run_engine` is the shared
//! helper: clone the `Arc`, hop to a blocking thread, lock, run the closure.

use tauri::{AppHandle, State};

use crate::dto::{BranchInfo, CommitPage, HeadInfo, RepoInfo};
use crate::engine::git2_engine::Git2Engine;
use crate::engine::GitEngine;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::watcher;

/// Run `f` against the open engine on a blocking thread.
async fn run_engine<T, F>(state: &State<'_, AppState>, f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Git2Engine) -> AppResult<T> + Send + 'static,
{
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || {
        let guard = engine.lock().map_err(|_| AppError::Poisoned)?;
        let e = guard.as_ref().ok_or(AppError::NoRepoOpen)?;
        f(e)
    })
    .await
    .map_err(|_| AppError::TaskJoin)?
}

#[tauri::command]
pub async fn open_repo(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<RepoInfo> {
    // Validate the path in Rust (never trust the webview).
    let canonical =
        std::fs::canonicalize(&path).map_err(|_| AppError::InvalidPath(path.clone()))?;
    if !canonical.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "{} is not a directory",
            canonical.display()
        )));
    }
    let path_str = canonical.to_string_lossy().into_owned();

    // Open off-thread (discovery can touch the disk).
    let engine = tokio::task::spawn_blocking(move || Git2Engine::open(&path_str))
        .await
        .map_err(|_| AppError::TaskJoin)??;

    let info = engine.repo_info()?;
    let workdir = engine.workdir();

    {
        let mut guard = state.engine.lock().map_err(|_| AppError::Poisoned)?;
        *guard = Some(engine);
    }

    // (Re)target the filesystem watcher; dropping the old handle stops it.
    if let Some(dir) = workdir {
        let handle =
            watcher::start(app.clone(), &dir).map_err(|e| AppError::Watch(e.to_string()))?;
        let mut wguard = state.watcher.lock().map_err(|_| AppError::Poisoned)?;
        *wguard = Some(handle);
    }

    Ok(info)
}

#[tauri::command]
pub async fn get_head(state: State<'_, AppState>) -> AppResult<HeadInfo> {
    run_engine(&state, |e| e.head()).await
}

#[tauri::command]
pub async fn list_branches(state: State<'_, AppState>) -> AppResult<Vec<BranchInfo>> {
    run_engine(&state, |e| e.list_branches()).await
}

#[tauri::command]
pub async fn list_commits(
    start: Option<String>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> AppResult<CommitPage> {
    let limit = limit.unwrap_or(200);
    run_engine(&state, move |e| e.list_commits(start.as_deref(), limit)).await
}
