// GitFlow branch conventions, implemented directly on git (no dependency on the
// external `git-flow` binary). Only the pure branch-name math lives here so the
// vitest suite can pin it; the merge/tag orchestration lives in the engine.

import type { GitFlowKind } from '../../shared/types'

/** Fixed prefixes for the three flow branch kinds. */
export const FLOW_PREFIX: Record<GitFlowKind, string> = {
  feature: 'feature/',
  release: 'release/',
  hotfix: 'hotfix/'
}

export const FLOW_KINDS: GitFlowKind[] = ['feature', 'release', 'hotfix']

/** The full branch name for a flow branch, e.g. ("feature", "login") → "feature/login". */
export function flowBranchName(kind: GitFlowKind, name: string): string {
  return FLOW_PREFIX[kind] + name
}

/** Classify a branch as a flow branch, or null when it is an ordinary branch. */
export function parseFlowBranch(branch: string): { kind: GitFlowKind; name: string } | null {
  for (const kind of FLOW_KINDS) {
    const prefix = FLOW_PREFIX[kind]
    if (branch.startsWith(prefix) && branch.length > prefix.length) {
      return { kind, name: branch.slice(prefix.length) }
    }
  }
  return null
}

/**
 * Where a finished flow branch merges, and whether it is tagged:
 *  - feature → develop only
 *  - release / hotfix → main AND develop, and tag the release on main.
 */
export function finishTargets(
  kind: GitFlowKind,
  config: { develop: string; main: string }
): { mergeInto: string[]; tag: boolean } {
  if (kind === 'feature') return { mergeInto: [config.develop], tag: false }
  return { mergeInto: [config.main, config.develop], tag: true }
}
