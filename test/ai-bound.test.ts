import { describe, it, expect } from 'vitest'

import { boundDiff, MAX_DIFF_CHARS } from '../src/main/ai-bound'

describe('boundDiff', () => {
  it('passes a small diff through untouched', () => {
    const diff = 'diff --git a/x b/x\n+hello\n'
    expect(boundDiff(diff, 'x | 1 +')).toEqual({ input: diff, truncated: false })
  })

  it('falls back to the --stat summary when the diff is oversized', () => {
    const big = 'x'.repeat(MAX_DIFF_CHARS + 1)
    const stat = ' 3 files changed, 900 insertions(+)'
    const out = boundDiff(big, stat)
    expect(out.truncated).toBe(true)
    expect(out.input).toContain(stat)
    expect(out.input).not.toContain(big)
  })

  it('honors a custom cap', () => {
    expect(boundDiff('123456', 'stat', 3).truncated).toBe(true)
    expect(boundDiff('12', 'stat', 3).truncated).toBe(false)
  })
})
