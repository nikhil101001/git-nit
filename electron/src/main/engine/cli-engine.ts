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
import { existsSync, readFileSync, statSync } from 'node:fs'
import { rm, readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type {
  BranchInfo,
  CommitInput,
  CommitPage,
  CommitSummary,
  ConflictFile,
  FileDiff,
  GraphFilters,
  GraphPage,
  OpStatus,
  RebasePlan,
  RefBadge,
  RepoInfo,
  ResetMode,
  HeadInfo,
  StageSelection,
  StashEntry,
  StatusEntry,
  TagInput,
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
    const format = [
      '%(refname)',
      '%(objectname)',
      '%(HEAD)',
      '%(symref)',
      '%(upstream:short)',
      '%(upstream:track,nobracket)'
    ].join(US)
    const out = await this.run([
      'for-each-ref',
      `--format=${format}`,
      'refs/heads',
      'refs/remotes'
    ])

    const branches: BranchInfo[] = []
    for (const line of out.split('\n')) {
      if (line === '') continue
      const [refname, objectname, headMark, symref, upstream, track] = line.split(US)
      // Skip symbolic refs such as refs/remotes/origin/HEAD (they have a symref
      // target and are pointers, not real branches).
      if (symref) continue
      const isRemote = refname.startsWith('refs/remotes/')
      const name = isRemote
        ? refname.slice('refs/remotes/'.length)
        : refname.slice('refs/heads/'.length)
      const ahead = Number(/ahead (\d+)/.exec(track ?? '')?.[1] ?? 0)
      const behind = Number(/behind (\d+)/.exec(track ?? '')?.[1] ?? 0)
      branches.push({
        name,
        fullName: refname,
        isRemote,
        isHead: headMark === '*',
        target: objectname || null,
        upstream: upstream || null,
        ahead,
        behind
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

  // ════════════════════════════════ M2 ════════════════════════════════

  private get cwd(): string {
    return this.workdirPath ?? this.gitDirPath
  }

  /** Run git with extra env (GIT_EDITOR / GIT_SEQUENCE_EDITOR for non-interactive ops). */
  private async runEnv(args: string[], env: Record<string, string>): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.cwd,
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true
    })
    return stdout
  }

  /** Run an op that may legitimately stop at a conflict: a left-behind unmerged
   *  state is success-with-conflicts (the UI resolves), not an error. */
  private async runAllowConflict(args: string[], env: Record<string, string> = {}): Promise<void> {
    try {
      await this.runEnv(args, env)
    } catch (e) {
      const unmerged = await this.run(['diff', '--name-only', '--diff-filter=U']).catch(() => '')
      if (unmerged.trim() !== '') return // paused on conflicts — expected
      // A still-in-progress op (e.g. rebase 'edit' stop) is also not an error.
      if ((await this.opStatus()).kind !== 'none') return
      throw asGitError(e)
    }
  }

  // ── merge / rebase / cherry-pick / revert / reset ──

  async merge(ref: string, noFf: boolean): Promise<void> {
    await this.runAllowConflict(
      ['merge', ...(noFf ? ['--no-ff'] : []), ref],
      { GIT_EDITOR: 'true' }
    )
  }

  async rebase(onto: string): Promise<void> {
    await this.runAllowConflict(['rebase', onto], { GIT_EDITOR: 'true' })
  }

  async cherryPick(oids: string[]): Promise<void> {
    if (oids.length === 0) throw new AppError('git', 'no commits to cherry-pick')
    await this.runAllowConflict(['cherry-pick', ...oids])
  }

  async revert(oid: string): Promise<void> {
    await this.runAllowConflict(['revert', '--no-edit', oid])
  }

  async reset(oid: string, mode: ResetMode): Promise<void> {
    await this.run(['reset', `--${mode}`, oid]).catch(asThrow)
  }

  async opStatus(): Promise<OpStatus> {
    const state = this.detectState()
    const kind =
      state === 'merge'
        ? 'merge'
        : state === 'rebase'
          ? 'rebase'
          : state === 'cherryPick'
            ? 'cherryPick'
            : state === 'revert'
              ? 'revert'
              : 'none'
    if (kind === 'none') {
      return { kind, conflicts: [], canContinue: false, canAbort: false, canSkip: false, progress: null }
    }
    const conflicts = (await this.run(['diff', '--name-only', '--diff-filter=U']).catch(() => ''))
      .split('\n')
      .filter(Boolean)
    return {
      kind,
      conflicts,
      canContinue: true,
      canAbort: true,
      canSkip: kind !== 'merge', // merge has no --skip
      progress: kind === 'rebase' ? this.rebaseProgress() : null
    }
  }

  private rebaseProgress(): string | null {
    const read = (p: string): string | null => {
      try {
        return readFileSync(join(this.gitDirPath, p), 'utf8').trim()
      } catch {
        return null
      }
    }
    const cur = read('rebase-merge/msgnum') ?? read('rebase-apply/next')
    const end = read('rebase-merge/end') ?? read('rebase-apply/last')
    return cur && end ? `${cur}/${end}` : null
  }

  private opCommand(kind: OpStatus['kind']): string | null {
    return kind === 'merge'
      ? 'merge'
      : kind === 'rebase'
        ? 'rebase'
        : kind === 'cherryPick'
          ? 'cherry-pick'
          : kind === 'revert'
            ? 'revert'
            : null
  }

  async opContinue(): Promise<void> {
    const cmd = this.opCommand((await this.opStatus()).kind)
    if (!cmd) throw new AppError('git', 'no operation to continue')
    await this.runAllowConflict([cmd, '--continue'], { GIT_EDITOR: 'true' })
  }

  async opAbort(): Promise<void> {
    const cmd = this.opCommand((await this.opStatus()).kind)
    if (!cmd) throw new AppError('git', 'no operation to abort')
    await this.run([cmd, '--abort']).catch(asThrow)
  }

  async opSkip(): Promise<void> {
    const cmd = this.opCommand((await this.opStatus()).kind)
    if (!cmd || cmd === 'merge') throw new AppError('git', 'cannot skip this operation')
    await this.runAllowConflict([cmd, '--skip'], { GIT_EDITOR: 'true' })
  }

  // ── conflicts ──

  async conflict(path: string): Promise<ConflictFile> {
    const side = (stage: number): Promise<string | null> =>
      this.run(['show', `:${stage}:${path}`]).then((s) => s).catch(() => null)
    const [base, ours, theirs] = await Promise.all([side(1), side(2), side(3)])
    const merged = await readFile(join(this.cwd, path), 'utf8').catch(() => '')
    return { path, base, ours, theirs, merged }
  }

  async resolveConflict(path: string, content: string): Promise<void> {
    await writeFile(join(this.cwd, path), content, 'utf8')
    await this.run(['add', '--', path]).catch(asThrow)
  }

  // ── interactive rebase (drive the real `git rebase -i`) ──

  async rebasePlan(onto: string): Promise<RebasePlan> {
    const out = await this.run([
      'log',
      '--reverse',
      `--format=%H${US}%h${US}%s`,
      `${onto}..HEAD`
    ]).catch(asThrow)
    const steps = out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [oid, shortOid, summary] = line.split(US)
        return { action: 'pick' as const, oid, shortOid, summary }
      })
    return { onto, steps }
  }

  async rebaseInteractive(plan: RebasePlan): Promise<void> {
    if (plan.steps.length === 0) throw new AppError('git', 'rebase plan is empty')
    const dir = await mkdtemp(join(tmpdir(), 'gitnit-rebase-'))
    const todoPath = join(dir, 'todo')
    const helperPath = join(dir, 'editor.cjs')
    const msgqPath = join(dir, 'msgq.json')

    // todo lines, oldest→newest; `drop` tells git to skip the commit.
    const todo =
      plan.steps.map((s) => `${s.action} ${s.oid} ${s.summary}`).join('\n') + '\n'
    // reword messages, consumed in todo order by the editor helper.
    const messages = plan.steps
      .filter((s) => s.action === 'reword' && typeof s.message === 'string')
      .map((s) => s.message as string)

    // One helper plays both roles: replace the rebase todo, or supply the next
    // queued reword message (else leave git's default, e.g. squash combined msg).
    const helper = [
      'const fs = require("fs");',
      'const file = process.argv[2];',
      'if (file.endsWith("git-rebase-todo")) {',
      '  fs.copyFileSync(process.env.GITNIT_TODO, file);',
      '} else {',
      '  try {',
      '    const q = JSON.parse(fs.readFileSync(process.env.GITNIT_MSGQ, "utf8"));',
      '    if (q.length) { fs.writeFileSync(file, q.shift()); fs.writeFileSync(process.env.GITNIT_MSGQ, JSON.stringify(q)); }',
      '  } catch (e) {}',
      '}'
    ].join('\n')

    await writeFile(todoPath, todo, 'utf8')
    await writeFile(helperPath, helper, 'utf8')
    await writeFile(msgqPath, JSON.stringify(messages), 'utf8')

    // Run the Electron binary as Node to execute the helper (no PATH `node` needed).
    const editor = `"${process.execPath}" "${helperPath}"`
    try {
      await this.runAllowConflict(['rebase', '-i', '--autostash', plan.onto], {
        ELECTRON_RUN_AS_NODE: '1',
        GIT_SEQUENCE_EDITOR: editor,
        GIT_EDITOR: editor,
        GITNIT_TODO: todoPath,
        GITNIT_MSGQ: msgqPath
      })
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  // ── stash ──

  async stashPush(message: string | undefined, includeUntracked: boolean): Promise<void> {
    const args = ['stash', 'push']
    if (includeUntracked) args.push('--include-untracked')
    if (message) args.push('-m', message)
    await this.run(args).catch(asThrow)
  }

  async stashList(): Promise<StashEntry[]> {
    const out = await this.run([
      'stash',
      'list',
      `--format=%gd${US}%gs${US}%H`
    ]).catch(() => '')
    const entries: StashEntry[] = []
    for (const line of out.split('\n')) {
      if (line === '') continue
      const [gd, gs, oid] = line.split(US)
      const index = Number(/stash@\{(\d+)\}/.exec(gd)?.[1] ?? 0)
      const branch = /(?:WIP on|On) ([^:]+):/.exec(gs)?.[1] ?? ''
      entries.push({ index, message: gs, branch, oid })
    }
    return entries
  }

  async stashApply(index: number, pop: boolean): Promise<void> {
    await this.runAllowConflict(['stash', pop ? 'pop' : 'apply', `stash@{${index}}`])
  }

  async stashDrop(index: number): Promise<void> {
    await this.run(['stash', 'drop', `stash@{${index}}`]).catch(asThrow)
  }

  // ── tags ──

  async tagCreate(input: TagInput): Promise<void> {
    const target = input.target ? [input.target] : []
    const args = input.message
      ? ['tag', '-a', input.name, '-m', input.message, ...target]
      : ['tag', input.name, ...target]
    await this.run(args).catch(asThrow)
  }

  async tagDelete(name: string): Promise<void> {
    await this.run(['tag', '-d', name]).catch(asThrow)
  }

  async tagPush(name: string | null): Promise<void> {
    await this.run(['push', 'origin', name ?? '--tags']).catch(asThrow)
  }

  // ── undo primitives ──

  async resolveOid(rev: string): Promise<string | null> {
    return this.run(['rev-parse', '--verify', '-q', rev])
      .then((s) => s.trim() || null)
      .catch(() => null)
  }

  async setBranchRef(branch: string, oid: string): Promise<void> {
    const current = (await this.head()).branch
    if (current === branch) {
      await this.run(['reset', '--hard', oid]).catch(asThrow)
    } else {
      await this.run(['branch', '-f', branch, oid]).catch(asThrow)
    }
  }

  async originUrl(): Promise<string | null> {
    return this.run(['remote', 'get-url', 'origin'])
      .then((s) => s.trim() || null)
      .catch(() => null)
  }

  workdir(): string | null {
    return this.workdirPath
  }

  gitDir(): string {
    return this.gitDirPath
  }
}
