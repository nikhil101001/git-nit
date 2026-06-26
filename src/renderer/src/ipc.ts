// Thin, typed wrappers around the `window.api` contextBridge surface. This is
// the only renderer module that reaches the IPC boundary, so the rest of the UI
// depends on the contract through here.

import type {
  AuthInfo,
  BranchInfo,
  CommitInput,
  CommitPage,
  ConflictFile,
  FileDiff,
  GraphFilters,
  GraphPage,
  HeadInfo,
  OpProgress,
  OpStatus,
  RebasePlan,
  RefreshEvent,
  RepoInfo,
  ResetMode,
  StageSelection,
  StashEntry,
  SyncProgress,
  TagInput,
  UndoState,
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

// M2 — merge / rebase / cherry-pick / revert / reset
export const merge = (ref: string, noFf: boolean): Promise<void> => window.api.merge(ref, noFf)
export const rebase = (onto: string): Promise<void> => window.api.rebase(onto)
export const cherryPick = (oids: string[]): Promise<void> => window.api.cherryPick(oids)
export const revert = (oid: string): Promise<void> => window.api.revert(oid)
export const reset = (oid: string, mode: ResetMode): Promise<void> => window.api.reset(oid, mode)
export const opStatus = (): Promise<OpStatus> => window.api.opStatus()
export const opContinue = (): Promise<void> => window.api.opContinue()
export const opAbort = (): Promise<void> => window.api.opAbort()
export const opSkip = (): Promise<void> => window.api.opSkip()

// M2 — conflicts
export const conflict = (path: string): Promise<ConflictFile> => window.api.conflict(path)
export const resolveConflict = (path: string, content: string): Promise<void> =>
  window.api.resolveConflict(path, content)

// M2 — interactive rebase
export const rebasePlan = (onto: string): Promise<RebasePlan> => window.api.rebasePlan(onto)
export const rebaseInteractive = (plan: RebasePlan): Promise<void> =>
  window.api.rebaseInteractive(plan)

// M2 — undo / redo
export const undo = (): Promise<void> => window.api.undo()
export const redo = (): Promise<void> => window.api.redo()
export const undoState = (): Promise<UndoState> => window.api.undoState()

// M2 — stash
export const stashPush = (message: string | undefined, includeUntracked: boolean): Promise<void> =>
  window.api.stashPush(message, includeUntracked)
export const stashList = (): Promise<StashEntry[]> => window.api.stashList()
export const stashApply = (index: number, pop: boolean): Promise<void> =>
  window.api.stashApply(index, pop)
export const stashDrop = (index: number): Promise<void> => window.api.stashDrop(index)

// M2 — tags
export const tagCreate = (input: TagInput): Promise<void> => window.api.tagCreate(input)
export const tagDelete = (name: string): Promise<void> => window.api.tagDelete(name)
export const tagPush = (name: string | null): Promise<void> => window.api.tagPush(name)

// M2 — auth
export const authInfo = (): Promise<AuthInfo[]> => window.api.authInfo()
export const setToken = (host: string, token: string): Promise<void> =>
  window.api.setToken(host, token)
export const clearToken = (host: string): Promise<void> => window.api.clearToken(host)

// M2 — long-op progress
export const onOpProgress = (cb: (p: OpProgress) => void): (() => void) =>
  window.api.onOpProgress(cb)
