// The Git engine abstraction.
//
// `GitEngine` is a deliberately small interface — the M0 read surface only.
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
  GraphFilters,
  GraphPage,
  HeadInfo,
  OpStatus,
  RebasePlan,
  RepoInfo,
  ResetMode,
  StageSelection,
  StashEntry,
  SubmoduleInfo,
  TagInput,
  TagRef,
  WorkingStatus,
  WorktreeInfo
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

  // ── M5 — commit signing ──
  commitSignDefault(): Promise<boolean>
  commitSignature(oid: string): Promise<string>

  // ── M1 — branching ──
  createBranch(name: string, startPoint?: string): Promise<void>
  checkoutBranch(name: string): Promise<void>
  renameBranch(oldName: string, newName: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>

  // ── M2 — merge / rebase / cherry-pick / revert / reset ──
  merge(ref: string, noFf: boolean): Promise<void>
  rebase(onto: string): Promise<void>
  cherryPick(oids: string[]): Promise<void>
  revert(oid: string): Promise<void>
  reset(oid: string, mode: ResetMode): Promise<void>
  /** Which multi-step op is in progress + its conflicts (drives banner/resume). */
  opStatus(): Promise<OpStatus>
  opContinue(): Promise<void>
  opAbort(): Promise<void>
  opSkip(): Promise<void>

  // ── M2 — conflicts ──
  conflict(path: string): Promise<ConflictFile>
  resolveConflict(path: string, content: string): Promise<void>

  // ── M2 — interactive rebase (drives `git rebase -i` via GIT_SEQUENCE_EDITOR) ──
  /** A default pick-all plan for the range onto..HEAD, to seed the editor. */
  rebasePlan(onto: string): Promise<RebasePlan>
  rebaseInteractive(plan: RebasePlan): Promise<void>

  // ── M2 — stash ──
  stashPush(message: string | undefined, includeUntracked: boolean): Promise<void>
  stashList(): Promise<StashEntry[]>
  stashApply(index: number, pop: boolean): Promise<void>
  stashDrop(index: number): Promise<void>

  // ── M2 — tags ──
  tagCreate(input: TagInput): Promise<void>
  tagDelete(name: string): Promise<void>
  /** Push one tag, or all tags when name is null. */
  tagPush(name: string | null): Promise<void>
  listTags(): Promise<TagRef[]>

  /** Resolve a ref/commit-ish to a full oid (used by the undo snapshotter). */
  resolveOid(rev: string): Promise<string | null>
  /** Move a branch ref to an oid (used by undo to restore a snapshot). */
  setBranchRef(branch: string, oid: string): Promise<void>
  /** The `origin` remote URL, or null if unset (used to pick an auth token). */
  originUrl(): Promise<string | null>

  // ── M3 — blame & file history ──
  /** Per-line attribution for `path` (git blame --porcelain). */
  blame(path: string): Promise<BlameLine[]>
  /** Revisions touching `path`, newest→oldest, following renames. */
  fileHistory(path: string, limit: number): Promise<FileHistoryEntry[]>
  /** The diff a single commit introduced for `path` (file-history viewer). */
  fileHistoryDiff(oid: string, path: string): Promise<FileDiff>

  // ── M3 — GitFlow (branch conventions driven directly on git) ──
  gitflowStatus(): Promise<GitFlowStatus>
  gitflowInit(config: GitFlowConfig): Promise<void>
  gitflowStart(kind: GitFlowKind, name: string): Promise<void>
  gitflowFinish(kind: GitFlowKind, name: string): Promise<void>

  // ── M3 — worktrees & submodules ──
  worktrees(): Promise<WorktreeInfo[]>
  worktreeAdd(path: string, ref: string): Promise<void>
  worktreeRemove(path: string, force: boolean): Promise<void>
  submodules(): Promise<SubmoduleInfo[]>
  submoduleUpdate(): Promise<void>

  /** Raw staged diff text + its --stat summary (input for AI commit messages). */
  stagedDiff(): Promise<{ patch: string; stat: string }>

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
