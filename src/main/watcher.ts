// Filesystem watcher -> debounced `repo://refresh` events.
//
// Uses Node's NATIVE `fs.watch(root, { recursive: true })` — a *single*
// OS-level handle for the whole tree (FSEvents on macOS, ReadDirectoryChangesW
// on Windows). This is the key to not exhausting file descriptors: chokidar
// (without its optional native fsevents addon, which doesn't load under pnpm
// here) falls back to one `fs.watch` *per directory*, so recursively watching a
// repo with node_modules / build dirs opens tens of thousands of handles →
// `EMFILE: too many open files`. A single recursive handle can't hit that no
// matter how large the tree is; we then just *filter* node_modules / .git
// object churn / lock files out of the event stream to reduce refresh noise
// (not to bound descriptors).
//
// On platforms without recursive support (older Linux), we degrade to a
// recursive `.git` watch (small) plus a shallow worktree watch so git ops still
// refresh — never the unbounded per-directory recursion that caused the crash.
//
// Bursts (a `git commit` or editor save touches many files) coalesce into at
// most one event per quiet window. Closing stops every handle.

import { watch, type FSWatcher } from 'node:fs'
import { sep } from 'node:path'
import type { WebContents } from 'electron'
import type { RefreshEvent } from '../shared/types'

const DEBOUNCE_MS = 300

// Heavy directories whose churn never changes repo state we render. Filtering
// them out of the event stream keeps refreshes from thrashing.
const HEAVY_DIRS = new Set([
  'node_modules',
  'dist',
  'out',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.vite',
  'coverage'
])

// `rel` is the path of the changed entry relative to the watched root.
function isNoise(rel: string): boolean {
  if (rel === '') return false
  if (rel.endsWith('.lock')) return true
  // git object writes are the bulk of commit churn; refs/logs already signal it.
  if (rel.includes(`.git${sep}objects`) || rel.startsWith(`objects${sep}`) || rel === 'objects') {
    return true
  }
  for (const seg of rel.split(sep)) {
    if (HEAVY_DIRS.has(seg)) return true
  }
  return false
}

export interface RepoWatcher {
  close(): Promise<void>
}

export function startWatcher(
  paths: { workdir: string | null; gitDir: string },
  target: WebContents
): RepoWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null

  const fire = (): void => {
    timer = null
    if (target.isDestroyed()) return
    const payload: RefreshEvent = { reason: 'fs-change' }
    target.send('repo://refresh', payload)
  }
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fire, DEBOUNCE_MS)
  }
  const onEvent = (_event: string, filename: string | Buffer | null): void => {
    const rel = typeof filename === 'string' ? filename : ''
    if (rel && isNoise(rel)) return
    schedule()
  }

  const watchers: FSWatcher[] = []
  const tryWatch = (dir: string, recursive: boolean): boolean => {
    try {
      const w = watch(dir, { recursive, persistent: true }, onEvent)
      w.on('error', (err) => console.error('[watcher] error:', err))
      watchers.push(w)
      return true
    } catch (err) {
      console.error(`[watcher] cannot watch ${dir} (recursive=${recursive}):`, err)
      return false
    }
  }

  const root = paths.workdir ?? paths.gitDir
  // Primary: one recursive handle over the whole tree — no per-directory fds.
  if (!tryWatch(root, true)) {
    // Recursive unsupported on this platform: watch .git (small) + shallow
    // worktree so git ops still trigger refresh, without unbounded recursion.
    if (!tryWatch(paths.gitDir, true)) tryWatch(paths.gitDir, false)
    if (paths.workdir) tryWatch(paths.workdir, false)
  }

  return {
    async close(): Promise<void> {
      if (timer) clearTimeout(timer)
      for (const w of watchers) {
        try {
          w.close()
        } catch {
          // already closed
        }
      }
    }
  }
}
