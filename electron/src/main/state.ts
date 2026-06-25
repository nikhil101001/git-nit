// Process-wide application state. M0 holds a single open repository and its
// filesystem watcher, mirroring the Tauri build's `AppState`. Opening a new repo
// swaps the engine and stops the previous watcher.

import type { GitEngine } from './engine'
import type { RepoWatcher } from './watcher'

interface AppState {
  engine: GitEngine | null
  watcher: RepoWatcher | null
}

export const state: AppState = {
  engine: null,
  watcher: null
}
