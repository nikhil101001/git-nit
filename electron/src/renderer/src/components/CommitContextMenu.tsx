// Right-click menu on a graph commit: cherry-pick, revert, reset (soft/mixed/
// hard), tag, and start an interactive rebase of the commits after this one.

import { useUi } from '../ui-store'
import { useRepo } from '../store'
import * as actions from '../actions'

export default function CommitContextMenu(): React.JSX.Element | null {
  const ctx = useUi((s) => s.context)
  const close = useUi((s) => s.closeContext)
  const setTagFor = useUi((s) => s.setTagFor)
  const branch = useRepo((s) => s.head?.branch)
  if (!ctx) return null

  const run = (fn: () => void) => (): void => {
    fn()
    close()
  }

  return (
    <div className="context-overlay" onMouseDown={close} onContextMenu={(e) => e.preventDefault()}>
      <ul
        className="context-menu"
        style={{ top: ctx.y, left: ctx.x }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <li onClick={run(() => void actions.cherryPick([ctx.oid]))}>Cherry-pick</li>
        <li onClick={run(() => void actions.revert(ctx.oid))}>Revert</li>
        <li className="ctx-head">Reset {branch ?? 'HEAD'} to {ctx.shortOid}</li>
        <li onClick={run(() => void actions.reset(ctx.oid, 'soft'))}>Reset (soft)</li>
        <li onClick={run(() => void actions.reset(ctx.oid, 'mixed'))}>Reset (mixed)</li>
        <li onClick={run(() => void actions.reset(ctx.oid, 'hard'))}>Reset (hard)</li>
        <li className="ctx-sep" onClick={run(() => setTagFor(ctx.oid))}>Create tag…</li>
        <li onClick={run(() => void actions.openInteractiveRebase(ctx.oid))}>
          Interactive rebase children…
        </li>
      </ul>
    </div>
  )
}
