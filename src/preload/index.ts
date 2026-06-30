// Preload: the entire trust boundary the renderer is allowed to touch. With
// contextIsolation on, this runs in an isolated world and exposes exactly one
// frozen object (`window.api`) via the contextBridge — the renderer never sees
// ipcRenderer or any Node API directly.
//
// Each call unwraps the main-process `IpcResult` envelope: resolve on `ok`,
// reject with the plain `{ kind, message }` payload on failure.

import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiConfig,
  AiConfigInput,
  AiProviderId,
  AiResult,
  AuthInfo,
  BlameLine,
  BranchInfo,
  CommitInput,
  CommitPage,
  ConflictFile,
  FileDiff,
  FileHistoryEntry,
  GitApi,
  GitInfo,
  GitFlowConfig,
  GitFlowKind,
  GitFlowStatus,
  GitHubAuthState,
  GitHubDeviceCode,
  GraphFilters,
  GraphPage,
  HeadInfo,
  IpcResult,
  Issue,
  OpProgress,
  OpStatus,
  PullRequest,
  PullRequestInput,
  RebasePlan,
  RecentRepo,
  RefreshEvent,
  RepoInfo,
  ResetMode,
  StageSelection,
  StashEntry,
  SubmoduleInfo,
  SyncProgress,
  TagInput,
  TagRef,
  UndoState,
  UpdateState,
  WorkingStatus,
  WorktreeInfo
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

  // M5 — commit signing
  commitSignDefault: () => invoke<boolean>('repo:signDefault'),
  commitSignature: (oid) => invoke<string>('repo:signature', oid),

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
  resolveConflictSide: (path, side) => invoke<void>('repo:resolveConflictSide', path, side),

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
  listTags: () => invoke<TagRef[]>('repo:tagList'),

  // M2 — auth
  authInfo: () => invoke<AuthInfo[]>('repo:authInfo'),
  setToken: (host, token) => invoke<void>('repo:setToken', host, token),
  clearToken: (host) => invoke<void>('repo:clearToken', host),

  // M2 — long-op progress
  onOpProgress: (cb: (p: OpProgress) => void) => subscribe('repo://op-progress', cb),

  // M3 — blame & file history
  blame: (path) => invoke<BlameLine[]>('repo:blame', path),
  fileHistory: (path, limit) => invoke<FileHistoryEntry[]>('repo:fileHistory', path, limit),
  fileHistoryDiff: (oid, path) => invoke<FileDiff>('repo:fileHistoryDiff', oid, path),

  // M3 — GitHub
  githubAuthState: () => invoke<GitHubAuthState>('gh:authState'),
  githubStartDeviceFlow: () => invoke<GitHubDeviceCode>('gh:startDeviceFlow'),
  githubAwaitAuth: () => invoke<GitHubAuthState>('gh:awaitAuth'),
  githubSignOut: () => invoke<void>('gh:signOut'),
  githubListPulls: () => invoke<PullRequest[]>('gh:listPulls'),
  githubListIssues: () => invoke<Issue[]>('gh:listIssues'),
  githubCreatePull: (input: PullRequestInput) => invoke<PullRequest>('gh:createPull', input),

  // M3 — AI commit messages
  aiConfig: () => invoke<AiConfig>('ai:config'),
  aiSetConfig: (input: AiConfigInput) => invoke<AiConfig>('ai:setConfig', input),
  aiSetKey: (provider: AiProviderId, key) => invoke<void>('ai:setKey', provider, key),
  aiGenerateCommitMessage: () => invoke<AiResult>('ai:generate'),

  // M3 — GitFlow
  gitflowStatus: () => invoke<GitFlowStatus>('flow:status'),
  gitflowInit: (config: GitFlowConfig) => invoke<void>('flow:init', config),
  gitflowStart: (kind: GitFlowKind, name) => invoke<void>('flow:start', kind, name),
  gitflowFinish: (kind: GitFlowKind, name) => invoke<void>('flow:finish', kind, name),

  // M3 — worktrees & submodules
  worktrees: () => invoke<WorktreeInfo[]>('repo:worktrees'),
  worktreeAdd: (path, ref) => invoke<void>('repo:worktreeAdd', path, ref),
  worktreeRemove: (path, force) => invoke<void>('repo:worktreeRemove', path, force),
  submodules: () => invoke<SubmoduleInfo[]>('repo:submodules'),
  submoduleUpdate: () => invoke<void>('repo:submoduleUpdate'),

  // M3 — recent repositories
  recentRepos: () => invoke<RecentRepo[]>('repo:recents'),
  removeRecentRepo: (path) => invoke<RecentRepo[]>('repo:recentsRemove', path),

  // M5 — release hardening
  gitInfo: () => invoke<GitInfo>('app:gitInfo'),
  logError: (message) => invoke<void>('app:logError', message),
  revealLogs: () => invoke<void>('app:revealLogs'),
  updateState: () => invoke<UpdateState>('app:updateState'),
  checkForUpdate: () => invoke<void>('app:checkUpdate'),
  quitAndInstall: () => invoke<void>('app:quitInstall'),
  onUpdate: (cb: (s: UpdateState) => void) => subscribe('app://update', cb)
}

contextBridge.exposeInMainWorld('api', api)
