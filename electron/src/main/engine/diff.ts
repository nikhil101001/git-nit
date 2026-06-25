// Unified-diff parsing + partial-patch construction.
//
// `parseUnifiedDiff` turns `git diff` output into the structured `FileDiff` the
// renderer draws. `buildPatch` does the inverse for staging: given a parsed diff
// and a selection (whole file / one hunk / specific lines), it emits a minimal,
// valid unified patch that `git apply` accepts — the CLI analog of the git2
// `apply(..., ApplyLocation::Index)` path in the Tauri build. Line-level staging
// is the classic transform: unselected `+` lines are dropped, unselected `-`
// lines become context, and the hunk counts are recomputed.

import type { DiffHunk, FileDiff } from '../../shared/types'

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/** Parse `git diff` text for a single file into a structured `FileDiff`. */
export function parseUnifiedDiff(text: string, path: string, oldPath?: string): FileDiff {
  const diff: FileDiff = { path, isBinary: false, hunks: [] }
  if (oldPath) diff.oldPath = oldPath
  if (text.trim() === '') return diff

  const lines = text.split('\n')
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const line of lines) {
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      diff.isBinary = true
      diff.hunks = []
      return diff
    }
    const m = HUNK_RE.exec(line)
    if (m) {
      hunk = {
        header: line,
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        lines: []
      }
      oldNo = hunk.oldStart
      newNo = hunk.newStart
      diff.hunks.push(hunk)
      continue
    }
    if (!hunk) continue // skip the `diff --git` / index / ---/+++ preamble
    const tag = line[0]
    if (tag === '\\') {
      // "\ No newline at end of file" — annotate the previous content line.
      continue
    }
    if (tag === '+') {
      hunk.lines.push({ origin: '+', content: line.slice(1), oldLineno: null, newLineno: newNo++ })
    } else if (tag === '-') {
      hunk.lines.push({ origin: '-', content: line.slice(1), oldLineno: oldNo++, newLineno: null })
    } else if (tag === ' ') {
      hunk.lines.push({ origin: ' ', content: line.slice(1), oldLineno: oldNo++, newLineno: newNo++ })
    }
    // any other line (e.g. trailing empty string from split) is ignored
  }
  return diff
}

/**
 * Build a minimal unified patch for `git apply` from a parsed diff.
 *
 * - whole file: `hunkIndex` undefined → all hunks verbatim.
 * - whole hunk: `hunkIndex` set, `lineIndices` undefined → that hunk verbatim.
 * - specific lines: `lineIndices` (indices into `hunk.lines`) → unselected `+`
 *   are dropped, unselected `-` become context, counts recomputed.
 *
 * Caller applies it with `git apply --cached [--reverse]` (stage/unstage) or
 * `git apply --reverse` (discard). `--recount` makes git tolerant of the
 * recomputed line counts.
 */
export function buildPatch(
  diff: FileDiff,
  hunkIndex?: number,
  lineIndices?: number[]
): string {
  const a = diff.oldPath ?? diff.path
  const b = diff.path
  const head = `diff --git a/${a} b/${b}\n--- a/${a}\n+++ b/${b}\n`

  const chosen =
    hunkIndex === undefined ? diff.hunks : diff.hunks.slice(hunkIndex, hunkIndex + 1)

  const body = chosen
    .map((h, idx) => {
      const isTarget = hunkIndex !== undefined && idx === 0
      if (!isTarget || lineIndices === undefined) return renderHunk(h, h.lines.map((_, i) => i), false)
      return renderHunk(h, lineIndices, true)
    })
    .join('')

  return head + body
}

/** Render one hunk, keeping only `keep` line indices; `transform` enables the
 *  line-level rewrite (drop unselected +, demote unselected - to context). */
function renderHunk(h: DiffHunk, keep: number[], transform: boolean): string {
  const keepSet = new Set(keep)
  const out: string[] = []
  let oldCount = 0
  let newCount = 0

  for (let i = 0; i < h.lines.length; i++) {
    const ln = h.lines[i]
    const selected = keepSet.has(i)
    let origin = ln.origin
    if (transform && !selected) {
      if (ln.origin === '+') continue // unselected addition: omit entirely
      if (ln.origin === '-') origin = ' ' // unselected removal: keep as context
    }
    out.push(origin + ln.content)
    if (origin === ' ') {
      oldCount++
      newCount++
    } else if (origin === '-') {
      oldCount++
    } else {
      newCount++
    }
  }

  const oldStart = oldCount === 0 ? 0 : h.oldStart
  const newStart = newCount === 0 ? 0 : h.newStart
  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`
  return header + '\n' + out.join('\n') + '\n'
}
