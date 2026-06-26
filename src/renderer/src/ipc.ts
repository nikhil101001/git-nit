// Thin, typed wrappers around the `window.api` contextBridge surface. This is
// the only renderer module that reaches the IPC boundary, so the rest of the UI
// depends on the contract through here.

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
  GitFlowConfig,
  GitFlowKind,
  GitFlowStatus,
  GitHubAuthState,
  GitHubDeviceCode,
  GraphFilters,
  GraphPage,
  HeadInfo,
  Issue,
  OpProgress,
  OpStatus,
  PullRequest,
  PullRequestInput,
  RebasePlan,
  RefreshEvent,
  RepoInfo,
  ResetMode,
  StageSelection,
  StashEntry,
  SubmoduleInfo,
  SyncProgress,
  TagInput,
  UndoState,
  WorkingStatus,
  WorktreeInfo
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

// M3 — blame & file history
export const blame = (path: string): Promise<BlameLine[]> => window.api.blame(path)
export const fileHistory = (path: string, limit?: number): Promise<FileHistoryEntry[]> =>
  window.api.fileHistory(path, limit)
export const fileHistoryDiff = (oid: string, path: string): Promise<FileDiff> =>
  window.api.fileHistoryDiff(oid, path)

// M3 — GitHub
export const githubAuthState = (): Promise<GitHubAuthState> => window.api.githubAuthState()
export const githubStartDeviceFlow = (): Promise<GitHubDeviceCode> =>
  window.api.githubStartDeviceFlow()
export const githubAwaitAuth = (): Promise<GitHubAuthState> => window.api.githubAwaitAuth()
export const githubSignOut = (): Promise<void> => window.api.githubSignOut()
export const githubListPulls = (): Promise<PullRequest[]> => window.api.githubListPulls()
export const githubListIssues = (): Promise<Issue[]> => window.api.githubListIssues()
export const githubCreatePull = (input: PullRequestInput): Promise<PullRequest> =>
  window.api.githubCreatePull(input)

// M3 — AI commit messages
export const aiConfig = (): Promise<AiConfig> => window.api.aiConfig()
export const aiSetConfig = (input: AiConfigInput): Promise<AiConfig> => window.api.aiSetConfig(input)
export const aiSetKey = (provider: AiProviderId, key: string): Promise<void> =>
  window.api.aiSetKey(provider, key)
export const aiGenerateCommitMessage = (): Promise<AiResult> =>
  window.api.aiGenerateCommitMessage()

// M3 — GitFlow
export const gitflowStatus = (): Promise<GitFlowStatus> => window.api.gitflowStatus()
export const gitflowInit = (config: GitFlowConfig): Promise<void> => window.api.gitflowInit(config)
export const gitflowStart = (kind: GitFlowKind, name: string): Promise<void> =>
  window.api.gitflowStart(kind, name)
export const gitflowFinish = (kind: GitFlowKind, name: string): Promise<void> =>
  window.api.gitflowFinish(kind, name)

// M3 — worktrees & submodules
export const worktrees = (): Promise<WorktreeInfo[]> => window.api.worktrees()
export const worktreeAdd = (path: string, ref: string): Promise<void> =>
  window.api.worktreeAdd(path, ref)
export const worktreeRemove = (path: string, force: boolean): Promise<void> =>
  window.api.worktreeRemove(path, force)
export const submodules = (): Promise<SubmoduleInfo[]> => window.api.submodules()
export const submoduleUpdate = (): Promise<void> => window.api.submoduleUpdate()
