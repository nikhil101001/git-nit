// Repo store: the open repository plus HEAD and branch refs. The commit list is
// now owned by the graph store and the working tree by the status store; this
// store keeps the repo identity, HEAD bar, and branch sidebar. Mirrors the Tauri
// build's `repo.svelte.ts` (minus the commit list, promoted to the graph).

import { create } from 'zustand'

import type { BranchInfo, HeadInfo, RepoInfo } from '../../shared/types'
import * as ipc from './ipc'
import { errMessage } from './errors'

interface RepoState {
  repo: RepoInfo | null
  head: HeadInfo | null
  branches: BranchInfo[]
  loading: boolean
  error: string | null

  openRepo: (path: string) => Promise<void>
  refreshHead: () => Promise<void>
}

export const useRepo = create<RepoState>((set, get) => ({
  repo: null,
  head: null,
  branches: [],
  loading: false,
  error: null,

  async openRepo(path) {
    set({ loading: true, error: null })
    try {
      const repo = await ipc.openRepo(path)
      set({ repo })
      await get().refreshHead()
    } catch (e) {
      set({ error: errMessage(e) })
    } finally {
      set({ loading: false })
    }
  },

  async refreshHead() {
    try {
      const [head, branches] = await Promise.all([ipc.getHead(), ipc.listBranches()])
      set({ head, branches, error: null })
    } catch (e) {
      set({ error: errMessage(e) })
    }
  }
}))
