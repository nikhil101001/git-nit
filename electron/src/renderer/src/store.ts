// Zustand store holding the open repository's state (SPEC §3.2 names Zustand for
// renderer state). Mirrors the Tauri build's runes store in `repo.svelte.ts`:
// open a repo, then fetch head/branches/commits together; the filesystem watcher
// drives `refreshAll`.

import { create } from 'zustand'

import type {
  BranchInfo,
  CommitSummary,
  ErrorPayload,
  HeadInfo,
  RepoInfo
} from '../../shared/types'
import * as ipc from './ipc'

interface RepoState {
  repo: RepoInfo | null
  head: HeadInfo | null
  branches: BranchInfo[]
  commits: CommitSummary[]
  loading: boolean
  error: string | null

  openRepo: (path: string) => Promise<void>
  pickAndOpen: () => Promise<void>
  refreshAll: () => Promise<void>
}

// IPC rejections arrive as the serialized ErrorPayload { kind, message }.
function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as ErrorPayload).message)
  }
  return String(e)
}

export const useRepo = create<RepoState>((set, get) => ({
  repo: null,
  head: null,
  branches: [],
  commits: [],
  loading: false,
  error: null,

  async openRepo(path) {
    set({ loading: true, error: null })
    try {
      const repo = await ipc.openRepo(path)
      set({ repo })
      await get().refreshAll()
    } catch (e) {
      set({ error: errMessage(e) })
    } finally {
      set({ loading: false })
    }
  },

  async pickAndOpen() {
    const path = await ipc.pickDirectory()
    if (path) await get().openRepo(path)
  },

  async refreshAll() {
    if (!get().repo) return
    try {
      const [head, branches, page] = await Promise.all([
        ipc.getHead(),
        ipc.listBranches(),
        ipc.listCommits(undefined, 200)
      ])
      set({ head, branches, commits: page.commits, error: null })
    } catch (e) {
      set({ error: errMessage(e) })
    }
  }
}))
