// Commit-graph layout: assign each commit a lane (column), a color, and the
// edge segments that connect it to its parents, over a topologically-ordered
// commit list. Engine-agnostic and pure (commits + ref badges → GraphRow[]), so
// it works the same whether the rows came from the git CLI or a future NodeGit
// revwalk.
//
// Model: `lanes[k]` holds the oid that lane k is *waiting for* — the next commit
// expected to appear in that column, registered by an already-placed child.
// Walking newest→oldest, a commit takes the leftmost lane waiting for it (lanes
// of multiple children converge there), its first parent continues that lane,
// and extra parents (merges) branch into reused/new lanes. We never compact
// existing lanes, so a carried line keeps its column and renders as a straight
// vertical — only freed slots are reused.

import type { CommitSummary, GraphEdge, GraphRow, RefBadge } from '../../shared/types'

const firstFree = (lanes: (string | null)[]): number => {
  const i = lanes.indexOf(null)
  return i === -1 ? lanes.length : i
}

/**
 * @param commits topo-ordered (child before parent), as `listCommits` returns.
 * @param badgesByOid ref badges keyed by commit oid.
 */
export function assignLanes(
  commits: CommitSummary[],
  badgesByOid: Map<string, RefBadge[]>
): GraphRow[] {
  const rows: GraphRow[] = []
  let lanes: (string | null)[] = [] // oid each lane awaits, entering the current row

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]

    // This commit's column: the leftmost lane already waiting for it, or a new
    // lane if it's a tip with no loaded child.
    let myLane = lanes.indexOf(c.oid)
    if (myLane === -1) {
      myLane = firstFree(lanes)
      lanes[myLane] = c.oid
    }

    // Lane state leaving this row. Every lane awaiting this oid has converged
    // into the commit, so free them; then route the parents.
    const next = lanes.slice()
    for (let k = 0; k < next.length; k++) if (next[k] === c.oid) next[k] = null

    // parentLane: which lane each parent leaves this row in (used to mark the
    // edges that emanate from the commit dot rather than passing through).
    const parentLane = new Map<string, number>()
    if (c.parents.length > 0) {
      // First parent continues straight down in the commit's own lane.
      next[myLane] = c.parents[0]
      parentLane.set(c.parents[0], myLane)
      // Merge parents reuse a lane already awaiting them, else a fresh lane.
      for (let j = 1; j < c.parents.length; j++) {
        const p = c.parents[j]
        if (parentLane.has(p)) continue
        let l = next.indexOf(p)
        if (l === -1) {
          l = firstFree(next)
          next[l] = p
        }
        parentLane.set(p, l)
      }
    }

    // Edges occupy the gap BELOW this row (between row i and row i+1). Each
    // active outgoing lane becomes one segment: it emanates from the commit dot
    // if it's a parent edge, else straight down; and it bends into the next
    // commit's dot if that's where this lane terminates.
    const nextOid = i + 1 < commits.length ? commits[i + 1].oid : null
    const nextLane = nextOid !== null ? next.indexOf(nextOid) : -1
    const edges: GraphEdge[] = []
    for (let l = 0; l < next.length; l++) {
      const oid = next[l]
      if (oid === null) continue
      const emanates = parentLane.get(oid) === l
      const fromLane = emanates ? myLane : l
      const toLane = nextOid !== null && oid === nextOid && nextLane !== -1 ? nextLane : l
      edges.push({ fromLane, toLane, color: l })
    }

    rows.push({
      oid: c.oid,
      shortOid: c.shortOid,
      summary: c.summary,
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      timeUnix: c.timeUnix,
      parents: c.parents,
      lane: myLane,
      color: myLane,
      refs: badgesByOid.get(c.oid) ?? [],
      edges
    })

    // Carry state forward; drop trailing free lanes so widths stay tight.
    lanes = next
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
  }

  return rows
}
