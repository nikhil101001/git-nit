// Preload: the entire trust boundary the renderer is allowed to touch. With
// contextIsolation on, this runs in an isolated world and exposes exactly one
// frozen object (`window.api`) via the contextBridge — the renderer never sees
// ipcRenderer or any Node API directly.
//
// Each call unwraps the main-process `IpcResult` envelope: resolve on `ok`,
// reject with the plain `{ kind, message }` payload on failure. That mirrors how
// the Tauri build's `invoke` rejects, so the renderer's error handling is
// identical across both stacks.

import { contextBridge, ipcRenderer } from 'electron'
import type {
  AuthInfo,
  BranchInfo,
  CommitInput,
  CommitPage,
  ConflictFile,
  FileDiff,
  GitApi,
  GraphFilters,
  GraphPage,
  HeadInfo,
  IpcResult,
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
} from '../shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (res.ok) return res.value
  throw res.error // plain ErrorPayload: { kind, message }
}

/** Subscribe to a main→renderer event; returns an unsubscribe fn. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: GitApi = {
  // M0
  openRepo: (path) => invoke<RepoInfo>('repo:open', path),
  getHead: () => invoke<HeadInfo>('repo:head'),
  listBranches: () => invoke<BranchInfo[]>('repo:branches'),
  listCommits: (start, limit) => invoke<CommitPage>('repo:commits', start, limit),
  pickDirectory: () => invoke<string | null>('dialog:pickDirectory'),
  confirm: (message, detail) => invoke<boolean>('dialog:confirm', message, detail),
  onRefresh: (cb: (e: RefreshEvent) => void) => subscribe('repo://refresh', cb),

  // M1 — graph
  graphPage: (start, limit, filters: GraphFilters) =>
    invoke<GraphPage>('repo:graph', start, limit, filters),

  // M1 — working directory
  workingStatus: () => invoke<WorkingStatus>('repo:status'),
  fileDiff: (path, staged) => invoke<FileDiff>('repo:diff', path, staged),
  stage: (sel: StageSelection) => invoke<void>('repo:stage', sel),
  unstage: (sel: StageSelection) => invoke<void>('repo:unstage', sel),
  discard: (sel: StageSelection) => invoke<void>('repo:discard', sel),

  // M1 — commit
  commit: (input: CommitInput) => invoke<void>('repo:commit', input),

  // M1 — branching
  createBranch: (name, startPoint) => invoke<void>('repo:branchCreate', name, startPoint),
  checkoutBranch: (name) => invoke<void>('repo:branchCheckout', name),
  renameBranch: (oldName, newName) => invoke<void>('repo:branchRename', oldName, newName),
  deleteBranch: (name, force) => invoke<void>('repo:branchDelete', name, force),

  // M1 — remotes & sync
  fetch: () => invoke<void>('repo:fetch'),
  pull: () => invoke<void>('repo:pull'),
  push: (force) => invoke<void>('repo:push', force),
  onSyncProgress: (cb: (p: SyncProgress) => void) => subscribe('repo://sync-progress', cb),

  // M2 — merge / rebase / cherry-pick / revert / reset
  merge: (ref, noFf) => invoke<void>('repo:merge', ref, noFf),
  rebase: (onto) => invoke<void>('repo:rebase', onto),
  cherryPick: (oids) => invoke<void>('repo:cherryPick', oids),
  revert: (oid) => invoke<void>('repo:revert', oid),
  reset: (oid, mode: ResetMode) => invoke<void>('repo:reset', oid, mode),
  opStatus: () => invoke<OpStatus>('repo:opStatus'),
  opContinue: () => invoke<void>('repo:opContinue'),
  opAbort: () => invoke<void>('repo:opAbort'),
  opSkip: () => invoke<void>('repo:opSkip'),

  // M2 — conflicts
  conflict: (path) => invoke<ConflictFile>('repo:conflict', path),
  resolveConflict: (path, content) => invoke<void>('repo:resolveConflict', path, content),

  // M2 — interactive rebase
  rebasePlan: (onto) => invoke<RebasePlan>('repo:rebasePlan', onto),
  rebaseInteractive: (plan: RebasePlan) => invoke<void>('repo:rebaseInteractive', plan),

  // M2 — undo / redo
  undo: () => invoke<void>('repo:undo'),
  redo: () => invoke<void>('repo:redo'),
  undoState: () => invoke<UndoState>('repo:undoState'),

  // M2 — stash
  stashPush: (message, includeUntracked) =>
    invoke<void>('repo:stashPush', message, includeUntracked),
  stashList: () => invoke<StashEntry[]>('repo:stashList'),
  stashApply: (index, pop) => invoke<void>('repo:stashApply', index, pop),
  stashDrop: (index) => invoke<void>('repo:stashDrop', index),

  // M2 — tags
  tagCreate: (input: TagInput) => invoke<void>('repo:tagCreate', input),
  tagDelete: (name) => invoke<void>('repo:tagDelete', name),
  tagPush: (name) => invoke<void>('repo:tagPush', name),

  // M2 — auth
  authInfo: () => invoke<AuthInfo[]>('repo:authInfo'),
  setToken: (host, token) => invoke<void>('repo:setToken', host, token),
  clearToken: (host) => invoke<void>('repo:clearToken', host),

  // M2 — long-op progress
  onOpProgress: (cb: (p: OpProgress) => void) => subscribe('repo://op-progress', cb)
}

contextBridge.exposeInMainWorld('api', api)
