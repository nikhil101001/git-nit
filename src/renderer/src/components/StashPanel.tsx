// Stash modal: create a stash (optionally incl. untracked) and apply/pop/drop
// existing stashes.

import { useState } from 'react'

import { useStash } from '../stash-store'
import { useUi } from '../ui-store'
import * as actions from '../actions'

export default function StashPanel(): React.JSX.Element | null {
  const show = useUi((s) => s.showStash)
  const close = (): void => useUi.getState().setShowStash(false)
  const stashes = useStash((s) => s.stashes)
  const [msg, setMsg] = useState('')
  const [untracked, setUntracked] = useState(false)
  if (!show) return null

  const push = (): void => {
    void actions.stashPush(msg || undefined, untracked)
    setMsg('')
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="stash-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">Stash</header>
        <div className="stash-new">
          <input
            placeholder="stash message (optional)"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={untracked}
              onChange={(e) => setUntracked(e.target.checked)}
            />
            include untracked
          </label>
          <button className="primary" onClick={push}>
            Stash changes
          </button>
        </div>
        <ul className="stash-list">
          {stashes.map((s) => (
            <li key={s.index}>
              <span className="stash-msg" title={s.message}>
                {`stash@{${s.index}}`}: {s.message}
              </span>
              <span className="stash-actions">
                <button onClick={() => void actions.stashApply(s.index, false)}>Apply</button>
                <button onClick={() => void actions.stashApply(s.index, true)}>Pop</button>
                <button className="danger" onClick={() => void actions.stashDrop(s.index)}>
                  Drop
                </button>
              </span>
            </li>
          ))}
          {stashes.length === 0 && <li className="muted">no stashes</li>}
        </ul>
        <footer className="modal-foot">
          <button onClick={close}>Close</button>
        </footer>
      </div>
    </div>
  )
}
