// The IPC boundary (main side). Every handler returns an `IpcResult` envelope
// instead of throwing across `invoke`, so the structured error `kind` survives
// to the renderer (Electron would otherwise flatten a thrown error to a bare
// message). The preload unwraps the envelope. Mirrors the Tauri command surface:
// open_repo, get_head, list_branches, list_commits (+ a native folder picker).

import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent
} from 'electron'
import { realpathSync } from 'node:fs'

import type { GraphFilters, IpcResult, StageSelection } from '../shared/types'
import { AppError } from './errors'
import { CliEngine, type GitEngine } from './engine'
import { state } from './state'
import { startWatcher } from './watcher'
import { runSync, type SyncOp } from './sync'

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

    // Watch the working tree (incl. .git refs) for both file edits and git ops.
    state.watcher = startWatcher(
      { workdir: engine.workdir(), gitDir: engine.gitDir() },
      e.sender
    )
    return info
  })

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

  // ── M1: commit ──
  handle('repo:commit', async (_e, input) => {
    const i = (input ?? {}) as { message?: unknown; amend?: unknown }
    if (typeof i.message !== 'string' || i.message.trim() === '') {
      throw new AppError('git', 'commit message is required')
    }
    return requireEngine().commit({ message: i.message, amend: i.amend === true })
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

  // ── M1: remotes & sync (streams repo://sync-progress) ──
  const sync = (op: SyncOp): void => {
    handle(`repo:${op}`, async (e, force) => {
      const engine = requireEngine()
      const cwd = engine.workdir() ?? engine.gitDir()
      await runSync(cwd, op, force === true, (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('repo://sync-progress', p)
      })
    })
  }
  sync('fetch')
  sync('pull')
  sync('push')

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
