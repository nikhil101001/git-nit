import { describe, it, expect } from 'vitest'

import { parseGitVersion, meetsMin } from '../src/main/gitcheck'

describe('parseGitVersion', () => {
  it('parses common `git --version` outputs', () => {
    expect(parseGitVersion('git version 2.39.3 (Apple Git-145)')).toBe('2.39.3')
    expect(parseGitVersion('git version 2.43.0')).toBe('2.43.0')
    expect(parseGitVersion('git version 2.30.windows.1')).toBe('2.30')
    expect(parseGitVersion('not git')).toBeNull()
  })
})

describe('meetsMin', () => {
  it('compares dotted versions against the minimum', () => {
    expect(meetsMin('2.39.3', '2.20.0')).toBe(true)
    expect(meetsMin('2.20.0', '2.20.0')).toBe(true) // equal passes
    expect(meetsMin('2.19.9', '2.20.0')).toBe(false)
    expect(meetsMin('3.0.0', '2.20.0')).toBe(true)
    expect(meetsMin('2.20', '2.20.0')).toBe(true) // missing patch = 0
    expect(meetsMin('2.2', '2.20.0')).toBe(false) // 2.2 < 2.20 numerically
  })
})
