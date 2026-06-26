// Working-directory store: the staged/unstaged/untracked status plus the diff of
// the currently-selected file.
// Mutations (stage/unstage/discard) live in actions.ts so they can trigger a
// coordinated refresh across all stores.

import { create } from 'zustand'

import type { FileDiff, WorkingStatus } from '../../shared/types'
import * as ipc from './ipc'
import { errMessage } from './errors'

export interface FileSelection {
  path: string
  staged: boolean
}

interface StatusState {
  status: WorkingStatus | null
  selected: FileSelection | null
  diff: FileDiff | null
  diffLoading: boolean
  error: string | null

  refresh: () => Promise<void>
  selectFile: (sel: FileSelection | null) => Promise<void>
  /** Re-fetch the diff of the currently-selected file (after a stage/discard). */
  reloadDiff: () => Promise<void>
}

export const useStatus = create<StatusState>((set, get) => ({
  status: null,
  selected: null,
  diff: null,
  diffLoading: false,
  error: null,

  async refresh() {
    try {
      const status = await ipc.workingStatus()
      set({ status, error: null })
      // Drop the selection if the file no longer has changes on that side.
      const sel = get().selected
      if (sel) {
        const side = sel.staged ? status.staged : [...status.unstaged, ...status.untracked]
        if (!side.some((e) => e.path === sel.path)) {
          set({ selected: null, diff: null })
        } else {
          await get().reloadDiff()
        }
      }
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async selectFile(sel) {
    set({ selected: sel, diff: null })
    if (sel) await get().reloadDiff()
  },

  async reloadDiff() {
    const sel = get().selected
    if (!sel) return
    set({ diffLoading: true })
    try {
      const diff = await ipc.fileDiff(sel.path, sel.staged)
      set({ diff, error: null })
    } catch (e) {
      set({ error: errMessage(e), diff: null })
    } finally {
      set({ diffLoading: false })
    }
  }
}))
