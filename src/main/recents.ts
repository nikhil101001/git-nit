// Recent repositories for the welcome page. A small MRU list persisted in
// userData; opening a repo records it, and the renderer reads it to show a
// GitKraken-style "Recent" list. Paths are stored absolute (to re-open) with a
// home-collapsed display string.

import { app } from 'electron'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'

import type { RecentRepo } from '../shared/types'

const MAX = 20
const file = (): string => join(app.getPath('userData'), 'recents.json')

function read(): RecentRepo[] {
  try {
    const list = JSON.parse(readFileSync(file(), 'utf8')) as RecentRepo[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list: RecentRepo[]): void {
  writeFileSync(file(), JSON.stringify(list), { mode: 0o600 })
}

/** Collapse the home dir to `~` for display. */
function display(path: string): string {
  const home = homedir()
  return home && path.startsWith(home) ? '~' + path.slice(home.length) : path
}

/** Most-recent-first. */
export function list(): RecentRepo[] {
  return read().sort((a, b) => b.lastOpenedUnix - a.lastOpenedUnix)
}

/** Record (or bump) a repo as most-recently opened. */
export function add(path: string): RecentRepo[] {
  const entry: RecentRepo = {
    path,
    name: basename(path) || path,
    display: display(path),
    lastOpenedUnix: Math.floor(Date.now() / 1000)
  }
  const next = [entry, ...read().filter((r) => r.path !== path)].slice(0, MAX)
  write(next)
  return next
}

export function remove(path: string): RecentRepo[] {
  const next = read().filter((r) => r.path !== path)
  write(next)
  return list()
}
