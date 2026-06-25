// Data-transfer objects crossing the Electron IPC boundary.
//
// This is the single source of truth shared by main, preload, and renderer.
// It is a faithful mirror of the Tauri build's `src-tauri/src/dto.rs` (camelCase
// on the wire) so both stacks expose the *same* contract and can be compared
// like-for-like. No engine-specific types appear here — the GitEngine maps into
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
 * failure (matching how Tauri's `invoke` rejects with the serialized error).
 */
export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorPayload }

// ───────────────────────────── M1 additions ─────────────────────────────
// Mirror the Tauri M1 DTOs (tauri/m1-mvp.md §4); camelCase on the wire.

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
}
