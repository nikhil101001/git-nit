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

import type { BranchInfo, CommitPage, HeadInfo, RepoInfo } from '../../shared/types'

export interface GitEngine {
  repoInfo(): Promise<RepoInfo>
  head(): Promise<HeadInfo>
  listBranches(): Promise<BranchInfo[]>

  /**
   * Walk commits starting at `start` (oid hex), or from HEAD when undefined.
   * `limit` caps the rows returned; the page carries a cursor to continue.
   */
  listCommits(start: string | undefined, limit: number): Promise<CommitPage>

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
