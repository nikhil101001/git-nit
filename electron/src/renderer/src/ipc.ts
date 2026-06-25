// Thin, typed wrappers around the `window.api` contextBridge surface. This is
// the only renderer module that reaches the IPC boundary, so the rest of the UI
// depends on the contract through here (mirrors the Tauri build's `lib/ipc.ts`).

import type {
  BranchInfo,
  CommitPage,
  HeadInfo,
  RefreshEvent,
  RepoInfo
} from '../../shared/types'

export const openRepo = (path: string): Promise<RepoInfo> => window.api.openRepo(path)

export const getHead = (): Promise<HeadInfo> => window.api.getHead()

export const listBranches = (): Promise<BranchInfo[]> => window.api.listBranches()

export const listCommits = (start?: string, limit = 200): Promise<CommitPage> =>
  window.api.listCommits(start, limit)

export const pickDirectory = (): Promise<string | null> => window.api.pickDirectory()

export const onRefresh = (cb: (e: RefreshEvent) => void): (() => void) =>
  window.api.onRefresh(cb)
