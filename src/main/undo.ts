// Undo / redo via pre-op ref snapshots (SPEC §3.3 decision 4 of m2 plan).
//
// Before each mutating op we capture the current branch + its tip oid; after, the
// new tip. Undo restores the branch to the pre-op oid; redo re-applies the post-op
// oid. We move refs through the engine (reset --hard when it's the current branch,
// else branch -f), so undo/redo is a pure ref-history walk — no per-command
// inverse logic. Working-tree safety (dirty-tree confirm) is enforced in the
// renderer before calling undo.

import type { GitEngine } from './engine'
import type { UndoState } from '../shared/types'
import { AppError } from './errors'

interface Snapshot {
  label: string
  branch: string
  before: string
  after: string
}

export class UndoStack {
  private undoable: Snapshot[] = []
  private redoable: Snapshot[] = []

  /** Run `fn`, recording a reversible snapshot if it moved the current branch tip. */
  async record(engine: GitEngine, label: string, fn: () => Promise<void>): Promise<void> {
    const head = await engine.head()
    const before = await engine.resolveOid('HEAD')
    await fn()
    const after = await engine.resolveOid('HEAD')
    // Only ref-moving ops on a real branch are reversible this way.
    if (head.branch && before && after && before !== after) {
      this.undoable.push({ label, branch: head.branch, before, after })
      this.redoable = [] // a fresh action invalidates the redo chain
    }
  }

  async undo(engine: GitEngine): Promise<void> {
    const snap = this.undoable.pop()
    if (!snap) throw new AppError('git', 'nothing to undo')
    await engine.setBranchRef(snap.branch, snap.before)
    this.redoable.push(snap)
  }

  async redo(engine: GitEngine): Promise<void> {
    const snap = this.redoable.pop()
    if (!snap) throw new AppError('git', 'nothing to redo')
    await engine.setBranchRef(snap.branch, snap.after)
    this.undoable.push(snap)
  }

  state(): UndoState {
    return {
      undo: this.undoable.at(-1)?.label ?? null,
      redo: this.redoable.at(-1)?.label ?? null
    }
  }

  clear(): void {
    this.undoable = []
    this.redoable = []
  }
}
