// Stashes sidebar section (replaces the StashPanel modal): create a stash
// (optionally incl. untracked) inline, and apply/pop/drop existing stashes.

import { useState } from 'react'

import { useStash } from '../../stash-store'
import * as actions from '../../actions'
import SidebarSection from '../SidebarSection'

export default function StashesSection(): React.JSX.Element {
  const stashes = useStash((s) => s.stashes)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const [untracked, setUntracked] = useState(false)

  const push = (): void => {
    void actions.stashPush(msg || undefined, untracked)
    setMsg('')
    setUntracked(false)
    setAdding(false)
  }

  const action = (
    <button className="mini" title="Stash changes" onClick={() => setAdding((v) => !v)}>
      ＋
    </button>
  )

  return (
    <SidebarSection id="stashes" title="Stashes" count={stashes.length} action={action}>
      {adding && (
        <div className="sb-form">
          <input
            autoFocus
            placeholder="stash message (optional)"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') push()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <label className="sb-check">
            <input type="checkbox" checked={untracked} onChange={(e) => setUntracked(e.target.checked)} />
            include untracked
          </label>
          <button className="primary mini" onClick={push}>
            Stash
          </button>
        </div>
      )}
      <ul>
        {stashes.map((s) => (
          <li key={s.index} className="sb-row">
            <span className="sb-row-main" title={s.message}>
              {s.message}
            </span>
            <span className="sb-row-actions">
              <button className="mini" title="Apply" onClick={() => void actions.stashApply(s.index, false)}>
                apply
              </button>
              <button className="mini" title="Pop" onClick={() => void actions.stashApply(s.index, true)}>
                pop
              </button>
              <button className="mini danger" title="Drop" onClick={() => void actions.stashDrop(s.index)}>
                ✕
              </button>
            </span>
          </li>
        ))}
        {stashes.length === 0 && <li className="muted">no stashes</li>}
      </ul>
    </SidebarSection>
  )
}
