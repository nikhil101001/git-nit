// Remotes & sync — fetch / pull / push via the system `git`, streaming progress.
//
// Kept separate from the GitEngine (mirrors the Tauri build's `sync.rs`): sync is
// inherently CLI/credential-helper driven even when a libgit2 engine is present,
// so it spawns `git` directly in the repo workdir — the user's SSH agent / OS
// credential helpers apply unchanged. git writes progress ("Receiving objects:
// 42%") to stderr, so we stream stderr line-by-line and report each line via the
// `onProgress` callback (the IPC layer turns those into `repo://sync-progress`).

import { spawn } from 'node:child_process'

import type { SyncProgress } from '../shared/types'
import { AppError } from './errors'

export type SyncOp = 'fetch' | 'pull' | 'push'

const ARGS: Record<SyncOp, (force: boolean) => string[]> = {
  fetch: () => ['fetch', '--all', '--prune', '--progress'],
  pull: () => ['pull', '--progress'],
  push: (force) => ['push', '--progress', ...(force ? ['--force-with-lease'] : [])]
}

const PERCENT_RE = /:\s+(\d{1,3})%/

/** Run a sync op, streaming each stderr line to `onProgress`. Resolves on
 *  success, rejects with a typed AppError (incl. `gitNotFound`) on failure. */
export function runSync(
  cwd: string,
  op: SyncOp,
  force: boolean,
  onProgress: (p: SyncProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cp = spawn('git', ARGS[op](force), { cwd, windowsHide: true })
    let errTail = ''

    cp.on('error', (e: NodeJS.ErrnoException) => {
      reject(
        e.code === 'ENOENT'
          ? new AppError('gitNotFound', 'git was not found on PATH')
          : new AppError('git', e.message)
      )
    })

    // git prints progress + most errors to stderr.
    cp.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      errTail = (errTail + text).slice(-4000) // keep a tail for the failure message
      // Progress uses \r to overwrite; split on both so each update is a line.
      for (const raw of text.split(/[\r\n]+/)) {
        const line = raw.trim()
        if (line === '') continue
        const pm = PERCENT_RE.exec(line)
        onProgress({ op, raw: line, percent: pm ? Number(pm[1]) : null, done: false })
      }
    })

    cp.on('close', (code) => {
      if (code === 0) {
        onProgress({ op, raw: `${op} complete`, percent: 100, done: true })
        resolve()
      } else {
        reject(new AppError('git', errTail.trim() || `git ${op} exited with ${code}`))
      }
    })
  })
}
