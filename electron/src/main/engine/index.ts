// The Git engine abstraction.
//
// `GitEngine` is a deliberately small interface — the M0 read surface only. It
// mirrors the Tauri build's `GitEngine` trait so the two stacks stay aligned.
// For M0 there is exactly one implementation, `CliEngine` (shells out to the
// system `git`), chosen so the app boots on the latest Electron with zero native
// compilation. The locked engine, NodeGit (libgit2), will slot in behind this
// same interface as `NodeGitEngine` once prebuilt binaries are wired in CI; UI
// and IPC code depend only on this interface, never on a concrete engine.
//
// Methods are async because shelling out is async (and NodeGit's heavy ops will
// run off the main thread too). Keeping the surface async now means the engine
// swap is invisible to callers.

import type {
  BranchInfo,
  CommitInput,
  CommitPage,
  FileDiff,
  GraphFilters,
  GraphPage,
  HeadInfo,
  RepoInfo,
  StageSelection,
  WorkingStatus
} from '../../shared/types'

export interface GitEngine {
  repoInfo(): Promise<RepoInfo>
  head(): Promise<HeadInfo>
  listBranches(): Promise<BranchInfo[]>

  /**
   * Walk commits starting at `start` (oid hex), or from HEAD when undefined.
   * `limit` caps the rows returned; the page carries a cursor to continue.
   */
  listCommits(start: string | undefined, limit: number): Promise<CommitPage>

  // ── M1 — commit graph ──
  /**
   * Like `listCommits`, but each row carries lane/color/edge layout + ref
   * badges for the graph. `start`/`limit` paginate as in M0; `filters` scope
   * the walk (remotes, current-branch-only, query). Lane assignment is the one
   * read NodeGit may later accelerate behind this same method (perf spike).
   */
  graphPage(
    start: string | undefined,
    limit: number,
    filters: GraphFilters
  ): Promise<GraphPage>

  // ── M1 — working directory ──
  workingStatus(): Promise<WorkingStatus>
  /** Structured diff for `path`: staged (index↔HEAD) when `staged`, else workdir↔index. */
  fileDiff(path: string, staged: boolean): Promise<FileDiff>
  stage(sel: StageSelection): Promise<void>
  unstage(sel: StageSelection): Promise<void>
  discard(sel: StageSelection): Promise<void>

  // ── M1 — commit ──
  commit(input: CommitInput): Promise<void>

  // ── M1 — branching ──
  createBranch(name: string, startPoint?: string): Promise<void>
  checkoutBranch(name: string): Promise<void>
  renameBranch(oldName: string, newName: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>

  /** Absolute working-directory path; null if bare. */
  workdir(): string | null

  /**
   * Absolute path to the `.git` directory. This is what the filesystem watcher
   * watches: all the state M0 reflects (HEAD, refs, logs) lives here, and it is
   * small — unlike the working tree, which can hold node_modules/build dirs and
   * would exhaust file descriptors under a recursive watch.
   */
  gitDir(): string
}

export { CliEngine } from './cli-engine'
