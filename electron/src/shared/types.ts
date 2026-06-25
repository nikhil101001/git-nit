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

/**
 * The full API surface exposed on `window.api` via the contextBridge. Both the
 * preload (which implements it) and the renderer (which consumes it) reference
 * this one type, so the boundary stays in sync.
 */
export interface GitApi {
  openRepo(path: string): Promise<RepoInfo>
  getHead(): Promise<HeadInfo>
  listBranches(): Promise<BranchInfo[]>
  listCommits(start?: string, limit?: number): Promise<CommitPage>
  /** Native "choose a folder" dialog; resolves to null if cancelled. */
  pickDirectory(): Promise<string | null>
  /** Subscribe to filesystem-change refresh events; returns an unsubscribe fn. */
  onRefresh(cb: (e: RefreshEvent) => void): () => void
}
