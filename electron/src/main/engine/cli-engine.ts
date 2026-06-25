// The git-CLI implementation of `GitEngine` — the only engine in M0.
//
// Every operation shells out to the system `git` with `execFile` (no shell, so
// no injection surface) pinned to the opened repo's working directory. Output is
// parsed from stable, machine-oriented formats (`for-each-ref`, `log
// --format=…`, `rev-parse`) using ASCII unit/record separators so commit
// subjects and author names can contain anything but \x1f/\x1e. This maps 1:1
// onto the same DTOs the libgit2 (`git2`) engine produces on the Tauri side.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  BranchInfo,
  CommitInput,
  CommitPage,
  CommitSummary,
  FileDiff,
  GraphFilters,
  GraphPage,
  RefBadge,
  RepoInfo,
  HeadInfo,
  StageSelection,
  StatusEntry,
  WorkingStatus
} from '../../shared/types'
import { AppError } from '../errors'
import { assignLanes } from './graph'
import { buildPatch, parseUnifiedDiff } from './diff'
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

/** Run `git <args>` in `cwd`, feeding `input` on stdin (for `apply`/`commit -F -`). */
function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cp = spawn('git', args, { cwd, windowsHide: true })
    let out = ''
    let err = ''
    cp.stdout.on('data', (d) => (out += d))
    cp.stderr.on('data', (d) => (err += d))
    cp.on('error', (e) => reject(new AppError('git', e.message)))
    cp.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new AppError('git', err.trim() || `git ${args[0]} exited with ${code}`))
    )
    cp.stdin.on('error', () => {}) // ignore EPIPE if git rejects before reading
    cp.stdin.write(input)
    cp.stdin.end()
  })
}

/** Parse RS/US-separated `git log` records into CommitSummary[]. */
function parseCommitRecords(out: string): CommitSummary[] {
  const commits: CommitSummary[] = []
  for (const record of out.split(RS)) {
    const rec = record.replace(/^[\r\n]+/, '') // drop the inter-record newline
    if (rec === '') continue
    const [oid, shortOid, summary, authorName, authorEmail, at, parents] = rec.split(US)
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
  return commits
}

/** Coerce a failed `git` invocation into a typed AppError. Detects the
 *  unconfigured-identity case so the commit path can surface it cleanly. */
function asGitError(e: unknown): AppError {
  if (e instanceof AppError) {
    if (e.kind === 'git' && /empty ident|tell me who you are|user\.(name|email)/i.test(e.message)) {
      return new AppError('identityUnset', 'git identity (user.name / user.email) is not configured')
    }
    return e
  }
  const stderr = (e as { stderr?: unknown } | null)?.stderr
  const message = stderr != null && String(stderr).trim() !== ''
    ? String(stderr).trim()
    : e instanceof Error
      ? e.message
      : String(e)
  if (/empty ident|tell me who you are|user\.(name|email)/i.test(message)) {
    return new AppError('identityUnset', 'git identity (user.name / user.email) is not configured')
  }
  return new AppError('git', message)
}

/** `.catch(asThrow)` rethrows any git failure as a typed AppError. */
const asThrow = (e: unknown): never => {
  throw asGitError(e)
}

/** Map a porcelain status char to the DTO's status set. */
function mapCode(c: string): StatusEntry['status'] {
  switch (c) {
    case 'A':
      return 'A'
    case 'D':
      return 'D'
    case 'R':
    case 'C':
      return 'R'
    default:
      return 'M' // M, T, U, …
  }
}

function entry(path: string, status: StatusEntry['status'], oldPath?: string): StatusEntry {
  return oldPath ? { path, status, oldPath } : { path, status }
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

    const commits = parseCommitRecords(out)

    let nextCursor: string | null = null
    if (commits.length > limit) {
      nextCursor = commits[limit].oid
      commits.length = limit
    }
    return { commits, nextCursor }
  }

  // ─────────────────────────────── M1: graph ───────────────────────────────

  async graphPage(
    start: string | undefined,
    limit: number,
    filters: GraphFilters
  ): Promise<GraphPage> {
    // The graph walk spans multiple tips, so pagination is offset-based (the
    // cursor is an opaque integer) rather than oid-based like listCommits.
    const offset = start ? Number.parseInt(start, 10) || 0 : 0
    const revArgs = filters.currentBranchOnly
      ? ['HEAD']
      : filters.includeRemotes
        ? ['--all']
        : ['--branches', 'HEAD']

    let out: string
    try {
      out = await this.run([
        'log',
        '--topo-order',
        `--skip=${offset}`,
        '-n',
        String(limit + 1),
        `--format=${COMMIT_FORMAT}`,
        ...revArgs
      ])
    } catch (e) {
      if ((await this.head()).target === null) return { rows: [], nextCursor: null }
      throw asGitError(e)
    }

    const raw = parseCommitRecords(out)
    const hasMore = raw.length > limit
    if (hasMore) raw.length = limit

    const badges = await this.refBadges()
    let rows = assignLanes(raw, badges)

    // Basic search collapses the graph to matching rows (flat), since removing
    // commits from a DAG mid-walk would break lane continuity.
    const q = filters.query.trim().toLowerCase()
    if (q) {
      rows = rows
        .filter(
          (r) =>
            r.summary.toLowerCase().includes(q) ||
            r.authorName.toLowerCase().includes(q) ||
            r.authorEmail.toLowerCase().includes(q) ||
            r.oid.startsWith(q)
        )
        .map((r) => ({ ...r, lane: 0, color: 0, edges: [] }))
    }

    return { rows, nextCursor: hasMore ? String(offset + limit) : null }
  }

  /** Map every branch/tag/HEAD to the commit oid it points at (tags peeled). */
  private async refBadges(): Promise<Map<string, RefBadge[]>> {
    const format = ['%(refname)', '%(objectname)', '%(*objectname)'].join(US)
    const out = await this.run([
      'for-each-ref',
      `--format=${format}`,
      'refs/heads',
      'refs/remotes',
      'refs/tags'
    ])
    const map = new Map<string, RefBadge[]>()
    const add = (oid: string, badge: RefBadge): void => {
      const list = map.get(oid)
      if (list) list.push(badge)
      else map.set(oid, [badge])
    }
    for (const line of out.split('\n')) {
      if (line === '') continue
      const [refname, objectname, peeled] = line.split(US)
      const oid = peeled || objectname // annotated tags resolve via *objectname
      if (refname.startsWith('refs/heads/')) {
        add(oid, { kind: 'localBranch', name: refname.slice('refs/heads/'.length) })
      } else if (refname.startsWith('refs/remotes/')) {
        const name = refname.slice('refs/remotes/'.length)
        if (!name.endsWith('/HEAD')) add(oid, { kind: 'remoteBranch', name })
      } else if (refname.startsWith('refs/tags/')) {
        add(oid, { kind: 'tag', name: refname.slice('refs/tags/'.length) })
      }
    }
    // HEAD badge on the checked-out commit.
    const headOid = await this.run(['rev-parse', '--verify', '-q', 'HEAD'])
      .then((s) => s.trim())
      .catch(() => '')
    if (headOid) add(headOid, { kind: 'head', name: 'HEAD' })
    return map
  }

  // ──────────────────────── M1: working directory ────────────────────────

  async workingStatus(): Promise<WorkingStatus> {
    // porcelain v1 with -z: stable, NUL-delimited; rename source follows in the
    // next token. XY = index (staged) / worktree (unstaged) status codes.
    const out = await this.run(['status', '--porcelain', '-z', '--untracked-files=all'])
    const tokens = out.split('\0')
    const staged: StatusEntry[] = []
    const unstaged: StatusEntry[] = []
    const untracked: StatusEntry[] = []

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t === '') continue
      const x = t[0]
      const y = t[1]
      const path = t.slice(3)
      if (x === '?' && y === '?') {
        untracked.push({ path, status: '?' })
        continue
      }
      let oldPath: string | undefined
      if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
        oldPath = tokens[++i] // rename/copy source is the next NUL token
      }
      if (x !== ' ' && x !== '?') {
        staged.push(entry(path, mapCode(x), oldPath))
      }
      if (y !== ' ' && y !== '?') {
        unstaged.push(entry(path, mapCode(y), oldPath))
      }
    }
    return { staged, unstaged, untracked }
  }

  async fileDiff(path: string, staged: boolean): Promise<FileDiff> {
    const base = ['diff', '--no-color', '-U3']
    const args = staged ? [...base, '--cached', '--', path] : [...base, '--', path]
    let out = await this.run(args).catch(asThrow)
    // Untracked files have no index entry; show their contents as all-added.
    if (!staged && out.trim() === '' && (await this.isUntracked(path))) {
      out = await this.run(['diff', '--no-color', '-U3', '--no-index', '--', '/dev/null', path])
        .catch((e: unknown) => {
          // --no-index exits 1 when files differ; that's expected, keep stdout.
          const so = (e as { stdout?: unknown } | null)?.stdout
          if (typeof so === 'string') return so
          throw asGitError(e)
        })
    }
    return parseUnifiedDiff(out, path)
  }

  private async isUntracked(path: string): Promise<boolean> {
    return this.run(['ls-files', '--error-unmatch', '--', path])
      .then(() => false)
      .catch(() => true)
  }

  async stage(sel: StageSelection): Promise<void> {
    if (sel.hunkIndex === undefined) {
      await this.run(['add', '-A', '--', sel.path]).catch(asThrow)
      return
    }
    const diff = await this.fileDiff(sel.path, false)
    const patch = buildPatch(diff, sel.hunkIndex, sel.lineIndices)
    await this.apply(['apply', '--cached', '--recount'], patch)
  }

  async unstage(sel: StageSelection): Promise<void> {
    if (sel.hunkIndex === undefined) {
      await this.run(['restore', '--staged', '--', sel.path]).catch(asThrow)
      return
    }
    const diff = await this.fileDiff(sel.path, true)
    const patch = buildPatch(diff, sel.hunkIndex, sel.lineIndices)
    await this.apply(['apply', '--cached', '--reverse', '--recount'], patch)
  }

  async discard(sel: StageSelection): Promise<void> {
    if (sel.hunkIndex === undefined) {
      if (await this.isUntracked(sel.path)) {
        await rm(join(this.workdirPath ?? this.gitDirPath, sel.path), { force: true })
      } else {
        await this.run(['restore', '--worktree', '--', sel.path]).catch(asThrow)
      }
      return
    }
    const diff = await this.fileDiff(sel.path, false)
    const patch = buildPatch(diff, sel.hunkIndex, sel.lineIndices)
    await this.apply(['apply', '--reverse', '--recount'], patch)
  }

  /** Feed a patch to `git apply …` on stdin. */
  private apply(args: string[], patch: string): Promise<void> {
    return gitWithInput(this.workdirPath ?? this.gitDirPath, args, patch).then(() => undefined)
  }

  // ──────────────────────────── M1: commit ────────────────────────────

  async commit(input: CommitInput): Promise<void> {
    const args = input.amend ? ['commit', '--amend', '-F', '-'] : ['commit', '-F', '-']
    await gitWithInput(this.workdirPath ?? this.gitDirPath, args, input.message).catch(asThrow)
  }

  // ─────────────────────────── M1: branching ───────────────────────────

  async createBranch(name: string, startPoint?: string): Promise<void> {
    const args = startPoint ? ['branch', name, startPoint] : ['branch', name]
    await this.run(args).catch(asThrow)
  }

  async checkoutBranch(name: string): Promise<void> {
    await this.run(['switch', name]).catch(asThrow)
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.run(['branch', '-m', oldName, newName]).catch(asThrow)
  }

  async deleteBranch(name: string, force: boolean): Promise<void> {
    await this.run(['branch', force ? '-D' : '-d', name]).catch(asThrow)
  }

  workdir(): string | null {
    return this.workdirPath
  }

  gitDir(): string {
    return this.gitDirPath
  }
}
