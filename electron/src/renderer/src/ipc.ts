// Thin, typed wrappers around the `window.api` contextBridge surface. This is
// the only renderer module that reaches the IPC boundary, so the rest of the UI
// depends on the contract through here (mirrors the Tauri build's `lib/ipc.ts`).

import type {
  BranchInfo,
  CommitInput,
  CommitPage,
  FileDiff,
  GraphFilters,
  GraphPage,
  HeadInfo,
  RefreshEvent,
  RepoInfo,
  StageSelection,
  SyncProgress,
  WorkingStatus
} from '../../shared/types'

// M0
export const openRepo = (path: string): Promise<RepoInfo> => window.api.openRepo(path)
export const getHead = (): Promise<HeadInfo> => window.api.getHead()
export const listBranches = (): Promise<BranchInfo[]> => window.api.listBranches()
export const listCommits = (start?: string, limit = 200): Promise<CommitPage> =>
  window.api.listCommits(start, limit)
export const pickDirectory = (): Promise<string | null> => window.api.pickDirectory()
export const confirm = (message: string, detail?: string): Promise<boolean> =>
  window.api.confirm(message, detail)
export const onRefresh = (cb: (e: RefreshEvent) => void): (() => void) =>
  window.api.onRefresh(cb)

// M1 — graph
export const graphPage = (
  start: string | undefined,
  limit: number,
  filters: GraphFilters
): Promise<GraphPage> => window.api.graphPage(start, limit, filters)

// M1 — working directory
export const workingStatus = (): Promise<WorkingStatus> => window.api.workingStatus()
export const fileDiff = (path: string, staged: boolean): Promise<FileDiff> =>
  window.api.fileDiff(path, staged)
export const stage = (sel: StageSelection): Promise<void> => window.api.stage(sel)
export const unstage = (sel: StageSelection): Promise<void> => window.api.unstage(sel)
export const discard = (sel: StageSelection): Promise<void> => window.api.discard(sel)

// M1 — commit
export const commit = (input: CommitInput): Promise<void> => window.api.commit(input)

// M1 — branching
export const createBranch = (name: string, startPoint?: string): Promise<void> =>
  window.api.createBranch(name, startPoint)
export const checkoutBranch = (name: string): Promise<void> => window.api.checkoutBranch(name)
export const renameBranch = (oldName: string, newName: string): Promise<void> =>
  window.api.renameBranch(oldName, newName)
export const deleteBranch = (name: string, force: boolean): Promise<void> =>
  window.api.deleteBranch(name, force)

// M1 — remotes & sync
export const fetch = (): Promise<void> => window.api.fetch()
export const pull = (): Promise<void> => window.api.pull()
export const push = (force: boolean): Promise<void> => window.api.push(force)
export const onSyncProgress = (cb: (p: SyncProgress) => void): (() => void) =>
  window.api.onSyncProgress(cb)
