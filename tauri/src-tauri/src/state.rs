//! Tauri-managed application state.
//!
//! M0 holds a single open repository. `git2::Repository` is `Send` but **not
//! `Sync`** and is not safe for concurrent use, so it lives behind a `Mutex`;
//! the `Arc` lets a clone move into `spawn_blocking` closures. The watcher
//! handle is stored so opening a new repo can drop (and thus stop) the old one.

use std::sync::{Arc, Mutex};

use crate::engine::git2_engine::Git2Engine;
use crate::watcher::WatcherHandle;

#[derive(Default)]
pub struct AppState {
    pub engine: Arc<Mutex<Option<Git2Engine>>>,
    pub watcher: Arc<Mutex<Option<WatcherHandle>>>,
}
