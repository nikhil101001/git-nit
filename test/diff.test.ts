import { describe, it, expect } from 'vitest'

import { parseUnifiedDiff, buildPatch } from '../src/main/engine/diff'

const SAMPLE = [
  'diff --git a/foo.txt b/foo.txt',
  'index 111..222 100644',
  '--- a/foo.txt',
  '+++ b/foo.txt',
  '@@ -1,3 +1,4 @@',
  ' one',
  '-two',
  '+too',
  '+two-and-a-half',
  ' three',
  ''
].join('\n')

describe('parseUnifiedDiff', () => {
  it('parses hunk headers and tracks line numbers per origin', () => {
    const diff = parseUnifiedDiff(SAMPLE, 'foo.txt')
    expect(diff.isBinary).toBe(false)
    expect(diff.hunks).toHaveLength(1)
    const h = diff.hunks[0]
    expect(h).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4 })

    const origins = h.lines.map((l) => l.origin).join('')
    expect(origins).toBe(' -++ ') // context, del, add, add, context

    const ctx = h.lines[0]
    expect(ctx).toMatchObject({ origin: ' ', oldLineno: 1, newLineno: 1, content: 'one' })
    const del = h.lines[1]
    expect(del).toMatchObject({ origin: '-', oldLineno: 2, newLineno: null })
    const add = h.lines[2]
    expect(add).toMatchObject({ origin: '+', oldLineno: null, newLineno: 2 })
  })

  it('flags binary diffs', () => {
    const diff = parseUnifiedDiff('Binary files a/x and b/x differ\n', 'x')
    expect(diff.isBinary).toBe(true)
    expect(diff.hunks).toEqual([])
  })

  it('returns an empty FileDiff for empty input', () => {
    expect(parseUnifiedDiff('', 'x').hunks).toEqual([])
  })
})

describe('buildPatch', () => {
  it('emits a valid header and the whole hunk by default', () => {
    const diff = parseUnifiedDiff(SAMPLE, 'foo.txt')
    const patch = buildPatch(diff)
    expect(patch.startsWith('diff --git a/foo.txt b/foo.txt\n--- a/foo.txt\n+++ b/foo.txt\n')).toBe(true)
    expect(patch).toContain('@@ -1,3 +1,4 @@')
  })

  it('demotes unselected removals to context and drops unselected additions', () => {
    const diff = parseUnifiedDiff(SAMPLE, 'foo.txt')
    // Keep only the first addition (index 2: "+too"); the deletion (idx 1) and
    // the other addition (idx 3) are unselected.
    const patch = buildPatch(diff, 0, [2])
    const bodyLines = patch.split('\n')
    // The unselected "+two-and-a-half" addition must be gone.
    expect(patch).not.toContain('two-and-a-half')
    // The unselected "-two" removal becomes a context line (leading space).
    expect(bodyLines).toContain(' two')
    expect(bodyLines).toContain('+too')
    // Recomputed counts: 3 old context/removed-as-context, 4 new.
    expect(patch).toContain('@@ -1,3 +1,4 @@')
  })
})
