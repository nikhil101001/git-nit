// Commit message editor + commit / amend. Disabled until something is staged
// (unless amending).

import { useState } from 'react'

import { useStatus } from '../status-store'
import * as actions from '../actions'

export default function CommitBox(): React.JSX.Element {
  const stagedCount = useStatus((s) => s.status?.staged.length ?? 0)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [busy, setBusy] = useState(false)

  const canCommit = message.trim() !== '' && (stagedCount > 0 || amend) && !busy

  const submit = async (): Promise<void> => {
    if (!canCommit) return
    setBusy(true)
    try {
      await actions.commit({ message, amend })
      setMessage('')
      setAmend(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="commit-box">
      <textarea
        className="commit-msg"
        placeholder={amend ? 'Amend commit message…' : 'Commit message…'}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        // ⌘/Ctrl+Enter to commit.
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
        }}
      />
      <div className="commit-actions">
        <label>
          <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
          Amend
        </label>
        <button className="primary" disabled={!canCommit} onClick={() => void submit()}>
          {amend ? 'Amend' : 'Commit'}
          {stagedCount > 0 ? ` (${stagedCount})` : ''}
        </button>
      </div>
    </div>
  )
}
