// The IPC boundary (main side). Every handler returns an `IpcResult` envelope
// instead of throwing across `invoke`, so the structured error `kind` survives
// to the renderer (Electron would otherwise flatten a thrown error to a bare
// message). The preload unwraps the envelope.

import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent
} from 'electron'
import { realpathSync } from 'node:fs'

import type {
  AiConfigInput,
  AiProviderId,
  GitFlowConfig,
  GitFlowKind,
  GraphFilters,
  IpcResult,
  PullRequestInput,
  RebasePlan,
  ResetMode,
  StageSelection,
  TagInput
} from '../shared/types'
import { AppError } from './errors'
import { CliEngine, type GitEngine } from './engine'
import { state } from './state'
import { startWatcher } from './watcher'
import { runSync, type SyncOp } from './sync'
import * as auth from './auth'
import * as github from './github'
import * as ai from './ai'
import * as recents from './recents'

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new AppError('git', `${field} must be a non-empty string`)
  }
  return v
}

function asFilters(v: unknown): GraphFilters {
  const f = (v ?? {}) as Partial<GraphFilters>
  return {
    includeRemotes: f.includeRemotes === true,
    currentBranchOnly: f.currentBranchOnly === true,
    query: typeof f.query === 'string' ? f.query : ''
  }
}

function asSelection(v: unknown): StageSelection {
  const s = (v ?? {}) as Partial<StageSelection>
  const path = requireString(s.path, 'path')
  const sel: StageSelection = { path }
  if (typeof s.hunkIndex === 'number') sel.hunkIndex = s.hunkIndex
  if (Array.isArray(s.lineIndices)) sel.lineIndices = s.lineIndices.filter((n) => typeof n === 'number')
  return sel
}

function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value }
}

function fail(e: unknown): IpcResult<never> {
  return { ok: false, error: AppError.from(e).toPayload() }
}

function requireEngine(): GitEngine {
  if (!state.engine) throw new AppError('noRepoOpen', 'no repository is open')
  return state.engine
}

/** Register an `invoke` handler that wraps its result/error in the envelope. */
function handle<T>(
  channel: string,
  fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>
): void {
  ipcMain.handle(channel, async (e, ...args): Promise<IpcResult<T>> => {
    try {
      return ok(await fn(e, ...args))
    } catch (err) {
      return fail(err)
    }
  })
}

export function registerIpc(): void {
  handle('repo:open', async (e, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new AppError('invalidPath', 'path must be a non-empty string')
    }
    // Never trust the renderer: canonicalize and validate on this side.
    let canonical: string
    try {
      canonical = realpathSync(path)
    } catch {
      throw new AppError('invalidPath', `${path} does not exist`)
    }

    const engine = await CliEngine.open(canonical)
    const info = await engine.repoInfo()

    // Swap the engine; stop the previous watcher before starting a new one.
    if (state.watcher) {
      await state.watcher.close()
      state.watcher = null
    }
    state.engine = engine
    state.undo.clear() // undo history is per-repo
    recents.add(canonical) // remember it for the welcome page

    // Watch the working tree (incl. .git refs) for both file edits and git ops.
    state.watcher = startWatcher(
      { workdir: engine.workdir(), gitDir: engine.gitDir() },
      e.sender
    )
    return info
  })

  handle('repo:recents', async () => recents.list())
  handle('repo:recentsRemove', async (_e, path) => recents.remove(requireString(path, 'path')))

  handle('repo:head', async () => requireEngine().head())

  handle('repo:branches', async () => requireEngine().listBranches())

  handle('repo:commits', async (_e, start, limit) => {
    const s = typeof start === 'string' && start !== '' ? start : undefined
    const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 200
    return requireEngine().listCommits(s, n)
  })

  // ── M1: graph ──
  handle('repo:graph', async (_e, start, limit, filters) => {
    const s = typeof start === 'string' && start !== '' ? start : undefined
    const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 500
    return requireEngine().graphPage(s, n, asFilters(filters))
  })

  // ── M1: working directory ──
  handle('repo:status', async () => requireEngine().workingStatus())
  handle('repo:diff', async (_e, path, staged) =>
    requireEngine().fileDiff(requireString(path, 'path'), staged === true)
  )
  handle('repo:stage', async (_e, sel) => requireEngine().stage(asSelection(sel)))
  handle('repo:unstage', async (_e, sel) => requireEngine().unstage(asSelection(sel)))
  handle('repo:discard', async (_e, sel) => requireEngine().discard(asSelection(sel)))

  // ── M1: commit (undo-recorded) ──
  handle('repo:commit', async (_e, input) => {
    const i = (input ?? {}) as { message?: unknown; amend?: unknown }
    if (typeof i.message !== 'string' || i.message.trim() === '') {
      throw new AppError('git', 'commit message is required')
    }
    const engine = requireEngine()
    const amend = i.amend === true
    const message = i.message
    await state.undo.record(engine, amend ? 'Amend' : 'Commit', () =>
      engine.commit({ message, amend })
    )
  })

  // ── M1: branching ──
  handle('repo:branchCreate', async (_e, name, startPoint) =>
    requireEngine().createBranch(
      requireString(name, 'name'),
      typeof startPoint === 'string' && startPoint !== '' ? startPoint : undefined
    )
  )
  handle('repo:branchCheckout', async (_e, name) =>
    requireEngine().checkoutBranch(requireString(name, 'name'))
  )
  handle('repo:branchRename', async (_e, oldName, newName) =>
    requireEngine().renameBranch(requireString(oldName, 'oldName'), requireString(newName, 'newName'))
  )
  handle('repo:branchDelete', async (_e, name, force) =>
    requireEngine().deleteBranch(requireString(name, 'name'), force === true)
  )

  // ── M1: remotes & sync (streams repo://sync-progress; M2 attaches auth) ──
  const sync = (op: SyncOp): void => {
    handle(`repo:${op}`, async (e, force) => {
      const engine = requireEngine()
      const cwd = engine.workdir() ?? engine.gitDir()
      // Attach a stored HTTPS token (if any) for the origin host; SSH/credential
      // helpers handle the rest.
      const url = await engine.originUrl()
      const host = url ? auth.httpsHost(url) : null
      const env = host ? auth.askpassEnv(host) ?? {} : {}
      await runSync(
        cwd,
        op,
        force === true,
        (p) => {
          if (!e.sender.isDestroyed()) e.sender.send('repo://sync-progress', p)
        },
        env
      )
    })
  }
  sync('fetch')
  sync('pull')
  sync('push')

  // ── M2: merge / rebase / cherry-pick / revert / reset (undo-recorded) ──
  const record = (engine: GitEngine, label: string, fn: () => Promise<void>): Promise<void> =>
    state.undo.record(engine, label, fn)

  handle('repo:merge', async (_e, ref, noFf) =>
    record(requireEngine(), `Merge ${requireString(ref, 'ref')}`, () =>
      requireEngine().merge(requireString(ref, 'ref'), noFf === true)
    )
  )
  handle('repo:rebase', async (_e, onto) =>
    record(requireEngine(), `Rebase onto ${requireString(onto, 'onto')}`, () =>
      requireEngine().rebase(requireString(onto, 'onto'))
    )
  )
  handle('repo:cherryPick', async (_e, oids) => {
    const list = Array.isArray(oids) ? oids.filter((o): o is string => typeof o === 'string') : []
    return record(requireEngine(), 'Cherry-pick', () => requireEngine().cherryPick(list))
  })
  handle('repo:revert', async (_e, oid) =>
    record(requireEngine(), 'Revert', () => requireEngine().revert(requireString(oid, 'oid')))
  )
  handle('repo:reset', async (_e, oid, mode) => {
    const m = (['soft', 'mixed', 'hard'] as ResetMode[]).includes(mode as ResetMode)
      ? (mode as ResetMode)
      : 'mixed'
    return record(requireEngine(), `Reset (${m})`, () =>
      requireEngine().reset(requireString(oid, 'oid'), m)
    )
  })
  handle('repo:opStatus', async () => requireEngine().opStatus())
  handle('repo:opContinue', async () =>
    record(requireEngine(), 'Continue', () => requireEngine().opContinue())
  )
  handle('repo:opAbort', async () => requireEngine().opAbort())
  handle('repo:opSkip', async () =>
    record(requireEngine(), 'Skip', () => requireEngine().opSkip())
  )

  // ── M2: conflicts ──
  handle('repo:conflict', async (_e, path) =>
    requireEngine().conflict(requireString(path, 'path'))
  )
  handle('repo:resolveConflict', async (_e, path, content) =>
    requireEngine().resolveConflict(
      requireString(path, 'path'),
      typeof content === 'string' ? content : ''
    )
  )

  // ── M2: interactive rebase ──
  handle('repo:rebasePlan', async (_e, onto) =>
    requireEngine().rebasePlan(requireString(onto, 'onto'))
  )
  handle('repo:rebaseInteractive', async (_e, plan) => {
    const p = (plan ?? {}) as Partial<RebasePlan>
    if (typeof p.onto !== 'string' || !Array.isArray(p.steps)) {
      throw new AppError('git', 'invalid rebase plan')
    }
    const onto = p.onto
    const steps = p.steps
    return record(requireEngine(), 'Interactive rebase', () =>
      requireEngine().rebaseInteractive({ onto, steps })
    )
  })

  // ── M2: undo / redo ──
  handle('repo:undo', async () => state.undo.undo(requireEngine()))
  handle('repo:redo', async () => state.undo.redo(requireEngine()))
  handle('repo:undoState', async () => state.undo.state())

  // ── M2: stash ──
  handle('repo:stashPush', async (_e, message, includeUntracked) =>
    requireEngine().stashPush(
      typeof message === 'string' && message !== '' ? message : undefined,
      includeUntracked === true
    )
  )
  handle('repo:stashList', async () => requireEngine().stashList())
  handle('repo:stashApply', async (_e, index, pop) =>
    requireEngine().stashApply(typeof index === 'number' ? index : 0, pop === true)
  )
  handle('repo:stashDrop', async (_e, index) =>
    requireEngine().stashDrop(typeof index === 'number' ? index : 0)
  )

  // ── M2: tags ──
  handle('repo:tagCreate', async (_e, input) => {
    const i = (input ?? {}) as Partial<TagInput>
    const tag: TagInput = { name: requireString(i.name, 'name') }
    if (typeof i.message === 'string' && i.message !== '') tag.message = i.message
    if (typeof i.target === 'string' && i.target !== '') tag.target = i.target
    return requireEngine().tagCreate(tag)
  })
  handle('repo:tagDelete', async (_e, name) =>
    requireEngine().tagDelete(requireString(name, 'name'))
  )
  handle('repo:tagPush', async (_e, name) =>
    requireEngine().tagPush(typeof name === 'string' && name !== '' ? name : null)
  )

  // ── M2: auth (token never leaves the main process) ──
  handle('repo:authInfo', async () => auth.authInfo())
  handle('repo:setToken', async (_e, host, token) => {
    auth.setToken(requireString(host, 'host'), requireString(token, 'token'))
  })
  handle('repo:clearToken', async (_e, host) => {
    auth.clearToken(requireString(host, 'host'))
  })

  // ════════════════════════════════ M3 ════════════════════════════════

  // ── blame & file history ──
  handle('repo:blame', async (_e, path) => requireEngine().blame(requireString(path, 'path')))
  handle('repo:fileHistory', async (_e, path, limit) =>
    requireEngine().fileHistory(
      requireString(path, 'path'),
      typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 200
    )
  )
  handle('repo:fileHistoryDiff', async (_e, oid, path) =>
    requireEngine().fileHistoryDiff(requireString(oid, 'oid'), requireString(path, 'path'))
  )

  // ── GitHub (origin/branch resolved here; token stays in main) ──
  handle('gh:authState', async () => github.authState())
  handle('gh:startDeviceFlow', async () => github.startDeviceFlow())
  handle('gh:awaitAuth', async () => github.awaitAuth())
  handle('gh:signOut', async () => github.signOut())
  handle('gh:listPulls', async () => github.listPulls(await requireEngine().originUrl()))
  handle('gh:listIssues', async () => github.listIssues(await requireEngine().originUrl()))
  handle('gh:createPull', async (_e, input) => {
    const i = (input ?? {}) as Partial<PullRequestInput>
    const pr: PullRequestInput = {
      title: requireString(i.title, 'title'),
      body: typeof i.body === 'string' ? i.body : '',
      base: requireString(i.base, 'base'),
      head: typeof i.head === 'string' ? i.head : ''
    }
    const engine = requireEngine()
    const branch = (await engine.head()).branch
    return github.createPull(await engine.originUrl(), pr, branch)
  })

  // ── AI commit messages (key + SDK never leave main) ──
  handle('ai:config', async () => ai.getConfig())
  handle('ai:setConfig', async (_e, input) => {
    const i = (input ?? {}) as AiConfigInput
    const cfg: AiConfigInput = {}
    if (typeof i.enabled === 'boolean') cfg.enabled = i.enabled
    if (i.provider === 'anthropic' || i.provider === 'ollama') cfg.provider = i.provider
    if (typeof i.model === 'string') cfg.model = i.model
    return ai.setConfig(cfg)
  })
  handle('ai:setKey', async (_e, provider, key) => {
    const p: AiProviderId = provider === 'ollama' ? 'ollama' : 'anthropic'
    ai.setKey(p, requireString(key, 'key'))
  })
  handle('ai:generate', async () => {
    const { patch, stat } = await requireEngine().stagedDiff()
    return ai.generateCommitMessage(patch, stat)
  })

  // ── GitFlow (cross-branch finish is not snapshot-undoable; renderer confirms) ──
  const asFlowKind = (v: unknown): GitFlowKind =>
    v === 'release' ? 'release' : v === 'hotfix' ? 'hotfix' : 'feature'
  handle('flow:status', async () => requireEngine().gitflowStatus())
  handle('flow:init', async (_e, config) => {
    const c = (config ?? {}) as Partial<GitFlowConfig>
    return requireEngine().gitflowInit({
      develop: typeof c.develop === 'string' && c.develop ? c.develop : 'develop',
      main: typeof c.main === 'string' && c.main ? c.main : 'main'
    })
  })
  handle('flow:start', async (_e, kind, name) =>
    requireEngine().gitflowStart(asFlowKind(kind), requireString(name, 'name'))
  )
  handle('flow:finish', async (_e, kind, name) =>
    requireEngine().gitflowFinish(asFlowKind(kind), requireString(name, 'name'))
  )

  // ── worktrees & submodules ──
  handle('repo:worktrees', async () => requireEngine().worktrees())
  handle('repo:worktreeAdd', async (_e, path, ref) =>
    requireEngine().worktreeAdd(requireString(path, 'path'), typeof ref === 'string' ? ref : '')
  )
  handle('repo:worktreeRemove', async (_e, path, force) =>
    requireEngine().worktreeRemove(requireString(path, 'path'), force === true)
  )
  handle('repo:submodules', async () => requireEngine().submodules())
  handle('repo:submoduleUpdate', async () => requireEngine().submoduleUpdate())

  handle('dialog:pickDirectory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0
      ? null
      : result.filePaths[0]
  })

  handle('dialog:confirm', async (e, message, detail) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      type: 'warning' as const,
      buttons: ['Cancel', 'Confirm'],
      defaultId: 1,
      cancelId: 0,
      message: requireString(message, 'message'),
      detail: typeof detail === 'string' ? detail : undefined
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })
}
