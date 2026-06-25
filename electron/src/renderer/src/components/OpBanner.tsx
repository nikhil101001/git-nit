// Banner for an in-progress merge/rebase/cherry-pick/revert: shows progress +
// conflicts (click a conflict to open the editor) and Continue/Skip/Abort.

import { useOp } from '../op-store'
import { useUi } from '../ui-store'
import * as actions from '../actions'

const LABEL: Record<string, string> = {
  merge: 'Merging',
  rebase: 'Rebasing',
  cherryPick: 'Cherry-picking',
  revert: 'Reverting'
}

export default function OpBanner(): React.JSX.Element | null {
  const status = useOp((s) => s.status)
  const openConflict = useUi((s) => s.openConflict)
  if (!status || status.kind === 'none') return null
  const hasConflicts = status.conflicts.length > 0

  return (
    <div className="op-banner">
      <span className="op-label">
        {LABEL[status.kind] ?? status.kind}
        {status.progress ? ` ${status.progress}` : ''}
      </span>
      {hasConflicts && (
        <span className="op-conflicts">
          {status.conflicts.length} conflict(s):
          {status.conflicts.map((p) => (
            <button key={p} className="op-conflict" onClick={() => openConflict(p)}>
              {p}
            </button>
          ))}
        </span>
      )}
      <span className="op-actions">
        {status.canContinue && (
          <button
            className="primary"
            disabled={hasConflicts}
            title={hasConflicts ? 'resolve conflicts first' : ''}
            onClick={() => void actions.opContinue()}
          >
            Continue
          </button>
        )}
        {status.canSkip && <button onClick={() => void actions.opSkip()}>Skip</button>}
        {status.canAbort && (
          <button className="danger" onClick={() => void actions.opAbort()}>
            Abort
          </button>
        )}
      </span>
    </div>
  )
}
