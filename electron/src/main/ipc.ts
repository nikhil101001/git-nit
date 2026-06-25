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

import type { IpcResult } from '../shared/types'
import { AppError } from './errors'
import { CliEngine, type GitEngine } from './engine'
import { state } from './state'
import { startWatcher } from './watcher'

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

    // Watch the .git directory (small; holds all the state M0 reflects).
    state.watcher = startWatcher(engine.gitDir(), e.sender)
    return info
  })

  handle('repo:head', async () => requireEngine().head())

  handle('repo:branches', async () => requireEngine().listBranches())

  handle('repo:commits', async (_e, start, limit) => {
    const s = typeof start === 'string' && start !== '' ? start : undefined
    const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 200
    return requireEngine().listCommits(s, n)
  })

  handle('dialog:pickDirectory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0
      ? null
      : result.filePaths[0]
  })
}
