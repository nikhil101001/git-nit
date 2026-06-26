import { describe, it, expect } from 'vitest'

import { flowBranchName, parseFlowBranch, finishTargets } from '../src/main/engine/gitflow'

describe('gitflow branch math', () => {
  it('builds prefixed branch names', () => {
    expect(flowBranchName('feature', 'login')).toBe('feature/login')
    expect(flowBranchName('release', '1.2.0')).toBe('release/1.2.0')
    expect(flowBranchName('hotfix', 'crash')).toBe('hotfix/crash')
  })

  it('classifies flow branches and ignores ordinary ones', () => {
    expect(parseFlowBranch('feature/login')).toEqual({ kind: 'feature', name: 'login' })
    expect(parseFlowBranch('hotfix/crash')).toEqual({ kind: 'hotfix', name: 'crash' })
    expect(parseFlowBranch('main')).toBeNull()
    expect(parseFlowBranch('develop')).toBeNull()
    // A bare prefix with no name is not a flow branch.
    expect(parseFlowBranch('feature/')).toBeNull()
  })

  it('routes finish merges: feature → develop; release/hotfix → main+develop+tag', () => {
    const cfg = { develop: 'develop', main: 'main' }
    expect(finishTargets('feature', cfg)).toEqual({ mergeInto: ['develop'], tag: false })
    expect(finishTargets('release', cfg)).toEqual({ mergeInto: ['main', 'develop'], tag: true })
    expect(finishTargets('hotfix', cfg)).toEqual({ mergeInto: ['main', 'develop'], tag: true })
  })
})
