//! The Git engine abstraction.
//!
//! `GitEngine` is a deliberately small, **synchronous** trait. git2 is sync, and
//! a future `gix` engine is also sync; keeping the trait sync avoids async-trait
//! machinery. Callers (Tauri commands) run these on `spawn_blocking` so libgit2
//! never blocks the webview. For M0 there is exactly one impl, `Git2Engine`; the
//! trait exists so `gix` can later accelerate hot reads behind the same surface.

use std::path::PathBuf;

use crate::dto::{BranchInfo, CommitPage, HeadInfo, RepoInfo};
use crate::error::AppResult;

pub mod git2_engine;

pub trait GitEngine: Send {
    fn repo_info(&self) -> AppResult<RepoInfo>;
    fn head(&self) -> AppResult<HeadInfo>;
    fn list_branches(&self) -> AppResult<Vec<BranchInfo>>;

    /// Walk commits starting at `start` (oid hex), or from HEAD when `None`.
    /// `limit` caps the number of rows returned.
    fn list_commits(&self, start: Option<&str>, limit: usize) -> AppResult<CommitPage>;

    /// Absolute working-directory path, for the filesystem watcher to watch.
    fn workdir(&self) -> Option<PathBuf>;
}
