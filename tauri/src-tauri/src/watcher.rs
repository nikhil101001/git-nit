//! Filesystem watcher → debounced `repo://refresh` events.
//!
//! Watches the working directory recursively and coalesces bursts (a single
//! `git commit` touches many `.git` files) into at most one event per ~300ms
//! quiet window. Dropping the returned `WatcherHandle` stops the watch and the
//! debounce thread.

use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::dto::RefreshEvent;

const DEBOUNCE: Duration = Duration::from_millis(300);

pub struct WatcherHandle {
    // Dropped first: stops native FS events and disconnects the channel.
    _watcher: RecommendedWatcher,
    // Belt-and-suspenders: signals the debounce thread to exit promptly.
    _stop: StopSignal,
}

struct StopSignal(mpsc::Sender<()>);
impl Drop for StopSignal {
    fn drop(&mut self) {
        let _ = self.0.send(());
    }
}

pub fn start(app: AppHandle, workdir: &Path) -> notify::Result<WatcherHandle> {
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })?;
    watcher.watch(workdir, RecursiveMode::Recursive)?;

    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    std::thread::spawn(move || loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }
        match rx.recv_timeout(Duration::from_millis(150)) {
            Ok(_event) => {
                // Drain the rest of the burst until it goes quiet for DEBOUNCE.
                while rx.recv_timeout(DEBOUNCE).is_ok() {}
                let _ = app.emit(
                    "repo://refresh",
                    RefreshEvent {
                        reason: "fs-change".into(),
                    },
                );
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    });

    Ok(WatcherHandle {
        _watcher: watcher,
        _stop: StopSignal(stop_tx),
    })
}
