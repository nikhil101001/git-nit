// Filesystem watcher -> debounced `repo://refresh` events.
//
// Watches the repository's `.git` directory and coalesces bursts — a single
// `git commit` touches many files — into at most one event per quiet window.
//
// Why .git and not the whole working tree: every piece of state M0 reflects
// (HEAD, refs, reflogs) lives under .git, and .git is small. Recursively
// watching the working tree would descend into node_modules / build dirs and,
// without an OS-level recursive backend, open one descriptor per directory —
// exhausting the limit (EMFILE) on large repos. Watching the working tree for
// staging/diff lands with that view in M1, behind proper ignore rules.

import { sep } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'
import type { RefreshEvent } from '../shared/types'

const DEBOUNCE_MS = 300

// Loose/packed object writes are the bulk of commit churn and carry no signal we
// need — the accompanying ref/HEAD/reflog updates (which we DO watch) already
// mark the meaningful change. Lock files churn rapidly mid-operation too.
function isNoise(path: string): boolean {
  return (
    path.includes(`${sep}objects${sep}`) ||
    path.endsWith(`${sep}objects`) ||
    path.endsWith('.lock')
  )
}

export interface RepoWatcher {
  close(): Promise<void>
}

export function startWatcher(gitDir: string, target: WebContents): RepoWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null

  const watcher: FSWatcher = chokidar.watch(gitDir, {
    ignoreInitial: true, // don't fire for the initial scan of existing files
    ignored: (path: string) => isNoise(path)
  })

  const fire = (): void => {
    timer = null
    if (target.isDestroyed()) return
    const payload: RefreshEvent = { reason: 'fs-change' }
    target.send('repo://refresh', payload)
  }

  const onChange = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fire, DEBOUNCE_MS)
  }

  watcher.on('all', onChange)
  // A watcher error must never become an unhandled rejection / crash the app;
  // log it and keep running with whatever watches remain.
  watcher.on('error', (err) => {
    console.error('[watcher] error:', err)
  })

  return {
    async close(): Promise<void> {
      if (timer) clearTimeout(timer)
      await watcher.close()
    }
  }
}
