// Data-transfer objects crossing the Electron IPC boundary.
//
// This is the single source of truth shared by main, preload, and renderer.
// Field names are camelCase on the wire. No engine-specific types appear here — the GitEngine maps into
// these plain, serializable shapes so a future NodeGit engine satisfies the same
// surface. All fields are type-only, so importing this from any process erases
// at build time.

export interface RepoInfo {
  /** Canonical path to the working directory (or the repo/git path if bare). */
  path: string
  isBare: boolean
  /** "clean" | "merge" | "rebase" | "cherryPick" | "revert" | "bisect" | "applyMailbox" */
  state: string
}

export interface HeadInfo {
  isDetached: boolean
  /** Short branch name when HEAD points at a branch (incl. an unborn one). */
  branch: string | null
  /** Full hex oid of the HEAD commit; null on an unborn branch. */
  target: string | null
  /** Subject line of the HEAD commit; null on an unborn branch. */
  summary: string | null
}

export interface BranchInfo {
  /** Short name, e.g. "main" or "origin/main". */
  name: string
  /** Full ref name, e.g. "refs/heads/main". */
  fullName: string
  isRemote: boolean
  isHead: boolean
  /** Tip commit oid (hex); null if the ref cannot be resolved. */
  target: string | null
  /** Upstream short name (e.g. "origin/main"); null if untracked. (M2) */
  upstream: string | null
  /** Commits ahead of / behind upstream; 0 with no upstream. (M2) */
  ahead: number
  behind: number
}

export interface CommitSummary {
  oid: string
  shortOid: string
  summary: string
  authorName: string
  authorEmail: string
  /** Author time, seconds since the Unix epoch (UTC). Frontend formats it. */
  timeUnix: number
  /** Parent oids (hex). Carried now so the M1 graph builder needs no change. */
  parents: string[]
}

export interface CommitPage {
  commits: CommitSummary[]
  /** Oid to continue the walk from for the next page; null at the end. */
  nextCursor: string | null
}

/** Payload of the `repo://refresh` event emitted by the filesystem watcher. */
export interface RefreshEvent {
  reason: string
}

/** Typed shape the renderer receives on a rejected IPC call. */
export interface ErrorPayload {
  kind: string
  message: string
}

/**
 * Result envelope every IPC handler returns. Electron only preserves a thrown
 * Error's `message` across `ipcRenderer.invoke`, which would lose our structured
 * `kind`. So handlers never throw across the boundary — they return this, and
 * the preload unwraps it: resolve on `ok`, reject with the `ErrorPayload` on
 * failure.
 */
export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorPayload }

// ───────────────────────────── M1 additions ─────────────────────────────
// M1 DTOs; camelCase on the wire.

/** A ref label drawn on a graph row. */
export interface RefBadge {
  kind: 'localBranch' | 'remoteBranch' | 'tag' | 'head'
  name: string
}

/** A parent→child connection leaving a graph row, for drawing lane lines. */
export interface GraphEdge {
  /** Lane this row's dot sits in. */
  fromLane: number
  /** Lane the parent occupies (where the line travels to). */
  toLane: number
  /** Color index of the edge (matches its branch-line color). */
  color: number
}

/** One row of the commit graph: a commit plus its layout + ref data. */
export interface GraphRow {
  oid: string
  shortOid: string
  summary: string
  authorName: string
  authorEmail: string
  timeUnix: number
  parents: string[]
  /** Column this commit's dot sits in. */
  lane: number
  /** Color index for this commit's lane. */
  color: number
  /** Branches/tags/HEAD pointing at this commit. */
  refs: RefBadge[]
  /** Outgoing edges toward parents (for lane-line drawing). */
  edges: GraphEdge[]
}

export interface GraphPage {
  rows: GraphRow[]
  /** Oid to continue the walk from for the next page; null at the end. */
  nextCursor: string | null
}

/** Filters applied to the graph walk. */
export interface GraphFilters {
  includeRemotes: boolean
  currentBranchOnly: boolean
  /** Substring match on message / author / SHA; empty = no filter. */
  query: string
}

/** A single changed path in the working directory. */
export interface StatusEntry {
  path: string
  /** Original path for renames/copies. */
  oldPath?: string
  /** 'M'odified | 'A'dded | 'D'eleted | 'R'enamed | '?' untracked. */
  status: 'M' | 'A' | 'D' | 'R' | '?'
}

export interface WorkingStatus {
  staged: StatusEntry[]
  unstaged: StatusEntry[]
  untracked: StatusEntry[]
}

/** One line of a diff hunk. */
export interface DiffLine {
  /** '+' added · '-' removed · ' ' context. */
  origin: '+' | '-' | ' '
  content: string
  oldLineno: number | null
  newLineno: number | null
}

export interface DiffHunk {
  /** The `@@ -a,b +c,d @@` header line (incl. any section heading). */
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  oldPath?: string
  isBinary: boolean
  hunks: DiffHunk[]
}

/**
 * A staging/discard target: a whole file (path only), a whole hunk
 * (`hunkIndex`), or specific lines within a hunk (`lineIndices`, indices into
 * `DiffHunk.lines`).
 */
export interface StageSelection {
  path: string
  hunkIndex?: number
  lineIndices?: number[]
}

export interface CommitInput {
  message: string
  /** Amend the tip commit instead of creating a new one. */
  amend: boolean
  /** M5: true → force-sign (-S), false → force-unsigned, undefined → git config. */
  sign?: boolean
}

/** Streamed progress for a fetch/pull/push, emitted on `repo://sync-progress`. */
export interface SyncProgress {
  op: 'fetch' | 'pull' | 'push'
  /** One raw progress/status line from git's stderr. */
  raw: string
  /** Parsed percent (0–100) when git reports one; null otherwise. */
  percent: number | null
  /** True on the final line of the operation. */
  done: boolean
}

/**
 * The full API surface exposed on `window.api` via the contextBridge. Both the
 * preload (which implements it) and the renderer (which consumes it) reference
 * this one type, so the boundary stays in sync.
 */
export interface GitApi {
  // M0 — repo open + reads
  openRepo(path: string): Promise<RepoInfo>
  getHead(): Promise<HeadInfo>
  listBranches(): Promise<BranchInfo[]>
  listCommits(start?: string, limit?: number): Promise<CommitPage>
  /** Native "choose a folder" dialog; resolves to null if cancelled. */
  pickDirectory(): Promise<string | null>
  /** Native confirm dialog for destructive actions; true = confirmed. */
  confirm(message: string, detail?: string): Promise<boolean>
  /** Subscribe to filesystem-change refresh events; returns an unsubscribe fn. */
  onRefresh(cb: (e: RefreshEvent) => void): () => void

  // M1 — commit graph
  graphPage(start: string | undefined, limit: number, filters: GraphFilters): Promise<GraphPage>

  // M1 — working directory
  workingStatus(): Promise<WorkingStatus>
  fileDiff(path: string, staged: boolean): Promise<FileDiff>
  stage(sel: StageSelection): Promise<void>
  unstage(sel: StageSelection): Promise<void>
  discard(sel: StageSelection): Promise<void>

  // M1 — commit
  commit(input: CommitInput): Promise<void>

  // M5 — commit signing
  /** Whether commit.gpgsign is true in the repo's git config (toggle default). */
  commitSignDefault(): Promise<boolean>
  /** Signature status of a commit — git's %G? (G good · B bad · U/X/Y/R/E · N none). */
  commitSignature(oid: string): Promise<string>

  // M1 — branching
  createBranch(name: string, startPoint?: string): Promise<void>
  checkoutBranch(name: string): Promise<void>
  renameBranch(oldName: string, newName: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>

  // M1 — remotes & sync (streams repo://sync-progress)
  fetch(): Promise<void>
  pull(): Promise<void>
  push(force: boolean): Promise<void>
  onSyncProgress(cb: (p: SyncProgress) => void): () => void

  // M2 — merge / rebase / cherry-pick / revert / reset
  merge(ref: string, noFf: boolean): Promise<void>
  rebase(onto: string): Promise<void>
  cherryPick(oids: string[]): Promise<void>
  revert(oid: string): Promise<void>
  reset(oid: string, mode: ResetMode): Promise<void>
  opStatus(): Promise<OpStatus>
  opContinue(): Promise<void>
  opAbort(): Promise<void>
  opSkip(): Promise<void>

  // M2 — conflicts
  conflict(path: string): Promise<ConflictFile>
  resolveConflict(path: string, content: string): Promise<void>

  // M2 — interactive rebase
  rebasePlan(onto: string): Promise<RebasePlan>
  rebaseInteractive(plan: RebasePlan): Promise<void>

  // M2 — undo / redo
  undo(): Promise<void>
  redo(): Promise<void>
  undoState(): Promise<UndoState>

  // M2 — stash
  stashPush(message: string | undefined, includeUntracked: boolean): Promise<void>
  stashList(): Promise<StashEntry[]>
  stashApply(index: number, pop: boolean): Promise<void>
  stashDrop(index: number): Promise<void>

  // M2 — tags
  tagCreate(input: TagInput): Promise<void>
  tagDelete(name: string): Promise<void>
  /** Push one tag, or all tags when name is null. */
  tagPush(name: string | null): Promise<void>
  /** List all tags (for the M4 sidebar Tags section). */
  listTags(): Promise<TagRef[]>

  // M2 — auth (the token itself never crosses the bridge)
  authInfo(): Promise<AuthInfo[]>
  setToken(host: string, token: string): Promise<void>
  clearToken(host: string): Promise<void>

  // M2 — long-op progress (rebase steps, etc.)
  onOpProgress(cb: (p: OpProgress) => void): () => void

  // M3 — blame & file history
  blame(path: string): Promise<BlameLine[]>
  fileHistory(path: string, limit?: number): Promise<FileHistoryEntry[]>
  /** Diff a single file introduced by a commit (for the file-history viewer). */
  fileHistoryDiff(oid: string, path: string): Promise<FileDiff>

  // M3 — GitHub (token/keys never cross the bridge; only DTOs do)
  githubAuthState(): Promise<GitHubAuthState>
  /** Request a device code; main begins the flow but does not poll yet. */
  githubStartDeviceFlow(): Promise<GitHubDeviceCode>
  /** Poll until the user authorizes (or the code expires); stores the token. */
  githubAwaitAuth(): Promise<GitHubAuthState>
  githubSignOut(): Promise<void>
  githubListPulls(): Promise<PullRequest[]>
  githubListIssues(): Promise<Issue[]>
  githubCreatePull(input: PullRequestInput): Promise<PullRequest>

  // M3 — AI commit messages (key + SDK stay in main)
  aiConfig(): Promise<AiConfig>
  aiSetConfig(input: AiConfigInput): Promise<AiConfig>
  aiSetKey(provider: AiProviderId, key: string): Promise<void>
  aiGenerateCommitMessage(): Promise<AiResult>

  // M3 — GitFlow
  gitflowStatus(): Promise<GitFlowStatus>
  gitflowInit(config: GitFlowConfig): Promise<void>
  gitflowStart(kind: GitFlowKind, name: string): Promise<void>
  gitflowFinish(kind: GitFlowKind, name: string): Promise<void>

  // M3 — worktrees & submodules
  worktrees(): Promise<WorktreeInfo[]>
  worktreeAdd(path: string, ref: string): Promise<void>
  worktreeRemove(path: string, force: boolean): Promise<void>
  submodules(): Promise<SubmoduleInfo[]>
  submoduleUpdate(): Promise<void>

  // M3 — recent repositories (welcome page)
  recentRepos(): Promise<RecentRepo[]>
  removeRecentRepo(path: string): Promise<RecentRepo[]>

  // M5 — release hardening: git check, local logging, auto-update
  gitInfo(): Promise<GitInfo>
  logError(message: string): Promise<void>
  revealLogs(): Promise<void>
  updateState(): Promise<UpdateState>
  checkForUpdate(): Promise<void>
  quitAndInstall(): Promise<void>
  onUpdate(cb: (s: UpdateState) => void): () => void
}

// ───────────────────────────── M2 additions ─────────────────────────────
// M2 DTOs; camelCase on the wire.

/** A file in conflict; each side's full content (null = absent on that side). */
export interface ConflictFile {
  path: string
  base: string | null
  ours: string | null
  theirs: string | null
  /** The working-tree file with conflict markers, as the merge left it. */
  merged: string
}

/** Which multi-step operation (if any) is mid-flight — drives the banner + resume. */
export interface OpStatus {
  kind: 'none' | 'merge' | 'rebase' | 'cherryPick' | 'revert'
  /** Conflicted paths that must be resolved before continue. */
  conflicts: string[]
  canContinue: boolean
  canAbort: boolean
  canSkip: boolean
  /** Rebase progress like "3/12", else null. */
  progress: string | null
}

export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

export interface RebaseStep {
  action: RebaseAction
  oid: string
  shortOid: string
  summary: string
  /** New message for a `reword` step (consumed in todo order). */
  message?: string
}

export interface RebasePlan {
  /** Commit/ref to rebase onto. */
  onto: string
  /** Steps oldest→newest, as the rebase todo expects. */
  steps: RebaseStep[]
}

export interface StashEntry {
  /** Index in `git stash list` (stash@{index}). */
  index: number
  message: string
  branch: string
  oid: string
}

export interface TagInput {
  name: string
  /** Annotated when a message is given, else lightweight. */
  message?: string
  /** Target commit-ish; defaults to HEAD. */
  target?: string
}

/** A tag and the commit oid it points at (annotated tags resolve to the commit). */
export interface TagRef {
  name: string
  target: string
}

export type ResetMode = 'soft' | 'mixed' | 'hard'

/** Labels of the next undo/redo (null when the stack end is reached). */
export interface UndoState {
  undo: string | null
  redo: string | null
}

/** Whether a host has a stored token; the token never crosses the wire. */
export interface AuthInfo {
  host: string
  hasToken: boolean
}

/** One streamed line of a long operation (interactive rebase, etc.). */
export interface OpProgress {
  raw: string
  done: boolean
}

// ───────────────────────────── M3 additions ─────────────────────────────
// M3 DTOs; camelCase on the wire.

/** One line's blame attribution (parsed from `git blame --porcelain`). */
export interface BlameLine {
  /** 1-based line number in the final file. */
  line: number
  oid: string
  shortOid: string
  author: string
  /** Author time, seconds since the Unix epoch. */
  timeUnix: number
  summary: string
  /** The line's text content. */
  content: string
}

/** One revision in a file's history (`git log --follow`). */
export interface FileHistoryEntry {
  oid: string
  shortOid: string
  summary: string
  authorName: string
  timeUnix: number
  /** The file's path at this revision (follows renames). */
  path: string
}

// ── GitHub ──

/** Whether a GitHub session exists; the token never crosses the bridge. */
export interface GitHubAuthState {
  signedIn: boolean
  /** The authenticated user's login, when signed in. */
  login: string | null
}

/** The user-facing half of an OAuth device-flow grant. */
export interface GitHubDeviceCode {
  userCode: string
  verificationUri: string
  /** Seconds until the code expires. */
  expiresIn: number
  /** Minimum seconds between poll attempts. */
  interval: number
}

export interface PullRequest {
  number: number
  title: string
  author: string
  state: string
  url: string
  headRef: string
  baseRef: string
  draft: boolean
}

export interface Issue {
  number: number
  title: string
  author: string
  state: string
  url: string
}

export interface PullRequestInput {
  title: string
  body: string
  /** Base branch (e.g. "main"). */
  base: string
  /** Head branch; defaults to the current branch when empty. */
  head: string
}

// ── AI commit messages ──

export type AiProviderId = 'anthropic' | 'ollama'

/** Current AI settings the renderer may read (never the key itself). */
export interface AiConfig {
  enabled: boolean
  provider: AiProviderId
  model: string
  /** Whether a key is stored for the active provider (anthropic). */
  hasKey: boolean
}

export interface AiConfigInput {
  enabled?: boolean
  provider?: AiProviderId
  model?: string
}

export interface AiResult {
  message: string
  /** True when the staged diff was too large and was reduced to a stat summary. */
  truncated: boolean
}

// ── GitFlow ──

export type GitFlowKind = 'feature' | 'release' | 'hotfix'

export interface GitFlowConfig {
  /** Integration branch (default "develop"). */
  develop: string
  /** Production branch (default "main"). */
  main: string
}

export interface GitFlowStatus {
  initialized: boolean
  develop: string
  main: string
  /** The active flow branch, if the current branch is one. */
  current: { kind: GitFlowKind; name: string } | null
}

// ── Worktrees & submodules ──

export interface WorktreeInfo {
  path: string
  /** Short branch name, or null when detached. */
  branch: string | null
  head: string
  isBare: boolean
  /** The main working tree (cannot be removed). */
  isMain: boolean
  locked: boolean
}

export interface SubmoduleInfo {
  path: string
  head: string
  /** `git describe` of the submodule HEAD, when available. */
  describe: string | null
  /** ' ' up-to-date · '-' uninitialized · '+' out-of-date · 'U' conflict. */
  status: 'upToDate' | 'uninitialized' | 'outOfDate' | 'conflict'
}

/** Result of the startup `git` availability/version check (M5). */
export interface GitInfo {
  present: boolean
  /** Parsed git version (e.g. "2.39.3"), or null. */
  version: string | null
  /** present AND >= the minimum supported version. */
  ok: boolean
  min: string
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'none'
  | 'error'

/** Auto-update state streamed on `app://update` (M5). */
export interface UpdateState {
  status: UpdateStatus
  version: string | null
  message: string | null
  /** Download progress 0–100 while downloading. */
  percent: number | null
}

/** A previously-opened repository, for the welcome page's Recent list. */
export interface RecentRepo {
  /** Absolute path used to re-open. */
  path: string
  /** Basename, shown as the title. */
  name: string
  /** Path with the home dir collapsed to `~`, for display. */
  display: string
  /** Last opened, seconds since the Unix epoch. */
  lastOpenedUnix: number
}
