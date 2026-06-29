// Startup check that a usable `git` is on PATH. We ship the git-CLI engine, so a
// missing/ancient git is a hard prerequisite — surface it clearly rather than
// failing cryptically later. (Bundling a git sidecar is a flagged M5 decision;
// v1 requires git on PATH.) The version-compare helpers are pure + tested.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { GitInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

/** Minimum git that supports the porcelain/format flags the engine relies on. */
export const MIN_GIT = '2.20.0'

/** Parse `git version 2.39.3 (Apple Git-145)` → `2.39.3` (or null). */
export function parseGitVersion(out: string): string | null {
  const m = /git version (\d+\.\d+(?:\.\d+)?)/.exec(out)
  return m ? m[1] : null
}

/** Dotted-numeric `version >= min`. Missing components count as 0. */
export function meetsMin(version: string, min: string): boolean {
  const a = version.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

export async function checkGit(): Promise<GitInfo> {
  try {
    const { stdout } = await execFileAsync('git', ['--version'], { windowsHide: true })
    const version = parseGitVersion(stdout)
    return {
      present: true,
      version,
      ok: version ? meetsMin(version, MIN_GIT) : false,
      min: MIN_GIT
    }
  } catch {
    return { present: false, version: null, ok: false, min: MIN_GIT }
  }
}
