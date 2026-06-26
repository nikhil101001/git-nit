// Worktrees + submodules store (M3). Worktree add/remove and submodule update
// refresh the lists; worktree add/remove also nudges the global refresh since a
// linked tree can change branch checkout state.

import { create } from 'zustand'

import type { SubmoduleInfo, WorktreeInfo } from '../../shared/types'
import * as ipc from './ipc'
import { refreshAll } from './actions'
import { errMessage } from './errors'

interface WorktreeState {
  worktrees: WorktreeInfo[]
  submodules: SubmoduleInfo[]
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  add: (path: string, ref: string) => Promise<void>
  remove: (path: string, force: boolean) => Promise<void>
  updateSubmodules: () => Promise<void>
}

export const useWorktrees = create<WorktreeState>((set, get) => ({
  worktrees: [],
  submodules: [],
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true })
    try {
      const [worktrees, submodules] = await Promise.all([ipc.worktrees(), ipc.submodules()])
      set({ worktrees, submodules, loading: false, error: null })
    } catch (e) {
      set({ error: errMessage(e), loading: false })
    }
  },

  async add(path, ref) {
    set({ error: null })
    try {
      await ipc.worktreeAdd(path, ref)
      await get().refresh()
      await refreshAll()
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async remove(path, force) {
    set({ error: null })
    try {
      await ipc.worktreeRemove(path, force)
      await get().refresh()
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async updateSubmodules() {
    set({ error: null })
    try {
      await ipc.submoduleUpdate()
      await get().refresh()
    } catch (e) {
      set({ error: errMessage(e) })
    }
  }
}))
