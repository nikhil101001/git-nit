//! git-nit Tauri application library.

mod commands;
mod dto;
mod engine;
mod error;
mod state;
mod watcher;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_repo,
            commands::get_head,
            commands::list_branches,
            commands::list_commits,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
