// GitFlow store (M3): the current flow status plus init/start/finish. Mutations
// run via IPC then trigger the global refresh so the graph/branches reflect the
// new flow branch. (Cross-branch finish is not snapshot-undoable; the menu
// confirms before finishing.)

import { create } from 'zustand'

import type { GitFlowConfig, GitFlowKind, GitFlowStatus } from '../../shared/types'
import * as ipc from './ipc'
import { refreshAll } from './actions'
import { errMessage } from './errors'

interface GitFlowState {
  status: GitFlowStatus | null
  loading: boolean
  error: string | null

  refresh: () => Promise<void>
  init: (config: GitFlowConfig) => Promise<void>
  start: (kind: GitFlowKind, name: string) => Promise<void>
  finish: (kind: GitFlowKind, name: string) => Promise<void>
}

async function run(set: (p: Partial<GitFlowState>) => void, fn: () => Promise<void>): Promise<void> {
  set({ error: null })
  try {
    await fn()
    await refreshAll()
  } catch (e) {
    set({ error: errMessage(e) })
  }
}

export const useGitFlow = create<GitFlowState>((set, get) => ({
  status: null,
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true })
    try {
      set({ status: await ipc.gitflowStatus(), loading: false, error: null })
    } catch (e) {
      set({ error: errMessage(e), loading: false })
    }
  },

  init: (config) => run(set, async () => { await ipc.gitflowInit(config); await get().refresh() }),
  start: (kind, name) => run(set, async () => { await ipc.gitflowStart(kind, name); await get().refresh() }),
  finish: (kind, name) => run(set, async () => { await ipc.gitflowFinish(kind, name); await get().refresh() })
}))
