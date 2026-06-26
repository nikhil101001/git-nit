import { describe, it, expect } from 'vitest'

import { parseWorktreeList, parseSubmoduleStatus } from '../src/main/engine/worktree'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

describe('parseWorktreeList', () => {
  it('parses main + linked + detached worktrees, marking the first as main', () => {
    const out = parseWorktreeList(
      [
        `worktree /repo`,
        `HEAD ${A}`,
        `branch refs/heads/main`,
        ``,
        `worktree /repo/wt-feature`,
        `HEAD ${B}`,
        `branch refs/heads/feature`,
        `locked needs work`,
        ``,
        `worktree /repo/wt-detached`,
        `HEAD ${C}`,
        `detached`,
        ``
      ].join('\n')
    )
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ path: '/repo', branch: 'main', isMain: true, head: A })
    expect(out[1]).toMatchObject({ path: '/repo/wt-feature', branch: 'feature', isMain: false, locked: true })
    expect(out[2]).toMatchObject({ path: '/repo/wt-detached', branch: null, isMain: false })
  })

  it('handles a bare main worktree', () => {
    const out = parseWorktreeList([`worktree /repo.git`, `bare`, ``].join('\n'))
    expect(out[0]).toMatchObject({ path: '/repo.git', isBare: true, isMain: true })
  })
})

describe('parseSubmoduleStatus', () => {
  it('maps the leading flag to a status and extracts describe', () => {
    const out = parseSubmoduleStatus(
      [
        ` ${A} libs/foo (v1.0.0)`,
        `-${B} libs/bar`,
        `+${C} libs/baz (heads/main)`,
        `U${A} libs/conf`,
        ``
      ].join('\n')
    )
    expect(out).toEqual([
      { path: 'libs/foo', head: A, describe: 'v1.0.0', status: 'upToDate' },
      { path: 'libs/bar', head: B, describe: null, status: 'uninitialized' },
      { path: 'libs/baz', head: C, describe: 'heads/main', status: 'outOfDate' },
      { path: 'libs/conf', head: A, describe: null, status: 'conflict' }
    ])
  })

  it('returns nothing for no submodules', () => {
    expect(parseSubmoduleStatus('')).toEqual([])
  })
})
