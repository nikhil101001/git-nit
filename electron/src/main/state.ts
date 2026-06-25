// Process-wide application state. Holds the single open repository, its
// filesystem watcher, and (M2) the undo stack. Opening a new repo swaps the
// engine, stops the previous watcher, and clears undo history.

import type { GitEngine } from './engine'
import type { RepoWatcher } from './watcher'
import { UndoStack } from './undo'

interface AppState {
  engine: GitEngine | null
  watcher: RepoWatcher | null
  undo: UndoStack
}

export const state: AppState = {
  engine: null,
  watcher: null,
  undo: new UndoStack()
}
