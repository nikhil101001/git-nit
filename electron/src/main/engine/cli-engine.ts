// The git-CLI implementation of `GitEngine` — the only engine in M0.
//
// Every operation shells out to the system `git` with `execFile` (no shell, so
// no injection surface) pinned to the opened repo's working directory. Output is
// parsed from stable, machine-oriented formats (`for-each-ref`, `log
// --format=…`, `rev-parse`) using ASCII unit/record separators so commit
// subjects and author names can contain anything but \x1f/\x1e. This maps 1:1
// onto the same DTOs the libgit2 (`git2`) engine produces on the Tauri side.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type {
  BranchInfo,
  CommitPage,
  CommitSummary,
  HeadInfo,
  RepoInfo
} from '../../shared/types'
import { AppError } from '../errors'
import type { GitEngine } from './index'

const execFileAsync = promisify(execFile)

// Field/record separators: ASCII Unit Separator (0x1f) between fields, Record
// Separator (0x1e) between commits. Neither can appear in git's text output.
const US = '\x1f'
const RS = '\x1e'
const COMMIT_FORMAT = ['%H', '%h', '%s', '%an', '%ae', '%at', '%P'].join(US) + RS

/** Run `git <args>` in `cwd`, returning stdout. Throws on a non-zero exit. */
async function gitOut(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024, // commit pages can be large
    windowsHide: true
  })
  return stdout
}

/** Coerce a failed `git` invocation into a typed `git` AppError. */
function asGitError(e: unknown): AppError {
  if (e instanceof AppError) return e
  const stderr = (e as { stderr?: unknown } | null)?.stderr
  const message = stderr != null && String(stderr).trim() !== ''
    ? String(stderr).trim()
    : e instanceof Error
      ? e.message
      : String(e)
  return new AppError('git', message)
}

export class CliEngine implements GitEngine {
  private constructor(
    private readonly gitDirPath: string, // absolute path to the .git directory
    private readonly workdirPath: string | null, // null when bare
    private readonly bare: boolean
  ) {}

  /**
   * Open the repository containing `path` (walks up to find the .git dir, so any
   * subdirectory of a repo works — matching libgit2's `Repository::discover`).
   */
  static async open(path: string): Promise<CliEngine> {
    if (!existsSync(path)) {
      throw new AppError('invalidPath', `${path} does not exist`)
    }
    if (!statSync(path).isDirectory()) {
      throw new AppError('invalidPath', `${path} is not a directory`)
    }

    let gitDir: string
    let bareStr: string
    let top: string
    try {
      ;[gitDir, bareStr, top] = await Promise.all([
        gitOut(path, ['rev-parse', '--absolute-git-dir']),
        gitOut(path, ['rev-parse', '--is-bare-repository']),
        // --show-toplevel is empty/fails for a bare repo; tolerate that.
        gitOut(path, ['rev-parse', '--show-toplevel']).catch(() => '')
      ])
    } catch (e) {
      throw asGitError(e)
    }

    const bare = bareStr.trim() === 'true'
    const workdirPath = bare ? null : top.trim() || null
    return new CliEngine(gitDir.trim(), workdirPath, bare)
  }

  /** Run git pinned to this repo (workdir for normal repos, gitdir for bare). */
  private run(args: string[]): Promise<string> {
    return gitOut(this.workdirPath ?? this.gitDirPath, args)
  }

  async repoInfo(): Promise<RepoInfo> {
    return {
      path: this.workdirPath ?? this.gitDirPath,
      isBare: this.bare,
      state: this.detectState()
    }
  }

  /**
   * Determine the in-progress operation the same way git's porcelain does: by
   * the presence of marker files/dirs under .git. Maps onto the same state
   * strings the Tauri engine emits.
   */
  private detectState(): string {
    const has = (p: string): boolean => existsSync(join(this.gitDirPath, p))
    if (has('rebase-merge') || has('rebase-apply')) {
      return has('rebase-apply/applying') ? 'applyMailbox' : 'rebase'
    }
    if (has('MERGE_HEAD')) return 'merge'
    if (has('CHERRY_PICK_HEAD')) return 'cherryPick'
    if (has('REVERT_HEAD')) return 'revert'
    if (has('BISECT_LOG')) return 'bisect'
    return 'clean'
  }

  async head(): Promise<HeadInfo> {
    // HEAD oid: absent on an unborn branch (fresh repo, no commits).
    const target = await this.run(['rev-parse', '--verify', '-q', 'HEAD'])
      .then((s) => s.trim() || null)
      .catch(() => null)

    // Branch name: empty/non-zero exit when HEAD is detached. Note: on an unborn
    // branch `symbolic-ref` still returns the branch name, so branch is set even
    // with no commits — matching the Tauri engine's unborn handling.
    const branch = await this.run(['symbolic-ref', '--short', '-q', 'HEAD'])
      .then((s) => s.trim() || null)
      .catch(() => null)

    const isDetached = target !== null && branch === null

    const summary = target
      ? await this.run(['show', '-s', '--format=%s', target])
          .then((s) => s.trim())
          .catch(() => null)
      : null

    return { isDetached, branch, target, summary }
  }

  async listBranches(): Promise<BranchInfo[]> {
    const format = ['%(refname)', '%(objectname)', '%(HEAD)', '%(symref)'].join(US)
    const out = await this.run([
      'for-each-ref',
      `--format=${format}`,
      'refs/heads',
      'refs/remotes'
    ])

    const branches: BranchInfo[] = []
    for (const line of out.split('\n')) {
      if (line === '') continue
      const [refname, objectname, headMark, symref] = line.split(US)
      // Skip symbolic refs such as refs/remotes/origin/HEAD (they have a symref
      // target and are pointers, not real branches).
      if (symref) continue
      const isRemote = refname.startsWith('refs/remotes/')
      const name = isRemote
        ? refname.slice('refs/remotes/'.length)
        : refname.slice('refs/heads/'.length)
      branches.push({
        name,
        fullName: refname,
        isRemote,
        isHead: headMark === '*',
        target: objectname || null
      })
    }
    return branches
  }

  async listCommits(start: string | undefined, limit: number): Promise<CommitPage> {
    const rev = start ?? 'HEAD'
    // Fetch one extra row to know whether (and from where) a next page exists.
    let out: string
    try {
      out = await this.run([
        'log',
        '--topo-order',
        '-n',
        String(limit + 1),
        `--format=${COMMIT_FORMAT}`,
        rev,
        '--'
      ])
    } catch (e) {
      // Unborn HEAD (no commits yet) -> empty page, not an error — but only when
      // we were walking from HEAD; an explicit bad `start` is a real error.
      if (start === undefined && (await this.head()).target === null) {
        return { commits: [], nextCursor: null }
      }
      throw asGitError(e)
    }

    const commits: CommitSummary[] = []
    for (const record of out.split(RS)) {
      const rec = record.replace(/^[\r\n]+/, '') // drop the inter-record newline
      if (rec === '') continue
      const [oid, shortOid, summary, authorName, authorEmail, at, parents] =
        rec.split(US)
      commits.push({
        oid,
        shortOid,
        summary,
        authorName,
        authorEmail,
        timeUnix: Number(at),
        parents: parents ? parents.trim().split(' ').filter(Boolean) : []
      })
    }

    let nextCursor: string | null = null
    if (commits.length > limit) {
      nextCursor = commits[limit].oid
      commits.length = limit
    }
    return { commits, nextCursor }
  }

  workdir(): string | null {
    return this.workdirPath
  }

  gitDir(): string {
    return this.gitDirPath
  }
}
