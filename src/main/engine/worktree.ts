// Pure parsers for `git worktree list --porcelain` and `git submodule status`.
// Kept separate from the engine so the vitest suite can exercise them directly.

import type { SubmoduleInfo, WorktreeInfo } from '../../shared/types'

/**
 * `git worktree list --porcelain` emits blank-line-separated blocks, each with a
 * `worktree <path>` line plus `HEAD <oid>`, `branch refs/heads/<name>` (or
 * `detached`), and optional `bare` / `locked` markers. The first block is always
 * the main working tree.
 */
export function parseWorktreeList(out: string): WorktreeInfo[] {
  const result: WorktreeInfo[] = []
  let first = true
  for (const block of out.split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length === 0) continue

    let path = ''
    let head = ''
    let branch: string | null = null
    let isBare = false
    let locked = false
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
      } else if (line === 'bare') isBare = true
      else if (line === 'locked' || line.startsWith('locked ')) locked = true
    }
    if (!path) continue
    result.push({ path, branch, head, isBare, isMain: first, locked })
    first = false
  }
  return result
}

/**
 * `git submodule status` lines: a leading flag (' ' up-to-date · '-'
 * uninitialized · '+' out-of-date · 'U' conflict), then `<sha> <path>` and an
 * optional ` (describe)`.
 */
export function parseSubmoduleStatus(out: string): SubmoduleInfo[] {
  const result: SubmoduleInfo[] = []
  for (const line of out.split('\n')) {
    if (line === '') continue
    const flag = line[0]
    const m = /^([0-9a-f]{7,64}) (.+?)(?: \((.+)\))?$/.exec(line.slice(1))
    if (!m) continue
    const status: SubmoduleInfo['status'] =
      flag === '-' ? 'uninitialized' : flag === '+' ? 'outOfDate' : flag === 'U' ? 'conflict' : 'upToDate'
    result.push({ path: m[2], head: m[1], describe: m[3] ?? null, status })
  }
  return result
}
