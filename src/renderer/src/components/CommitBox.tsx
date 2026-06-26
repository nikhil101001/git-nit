// Commit message editor + commit / amend. Disabled until something is staged
// (unless amending). When AI commit messages are enabled (M3), a ✨ Generate
// button fills the message from the staged diff — always editable before commit.

import { useEffect, useState } from 'react'

import { useStatus } from '../status-store'
import { useAi } from '../ai-store'
import { useUi } from '../ui-store'
import * as actions from '../actions'

export default function CommitBox(): React.JSX.Element {
  const stagedCount = useStatus((s) => s.status?.staged.length ?? 0)
  const aiEnabled = useAi((s) => s.config.enabled)
  const generating = useAi((s) => s.generating)
  const truncated = useAi((s) => s.lastTruncated)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [busy, setBusy] = useState(false)

  // Load AI config once so the button visibility is correct.
  useEffect(() => void useAi.getState().refresh(), [])

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

  const generate = async (): Promise<void> => {
    const msg = await useAi.getState().generate()
    if (msg) setMessage(msg)
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
        {truncated && <span className="muted ai-trunc" title="Diff was large — summarized">stat-summarized</span>}
        {aiEnabled && (stagedCount > 0 || amend) && (
          <button
            className="ai-generate"
            disabled={generating || (stagedCount === 0 && !amend)}
            title="Generate a commit message from the staged diff"
            onClick={() => void generate()}
          >
            {generating ? '✨ …' : '✨ Generate'}
          </button>
        )}
        {!aiEnabled && (
          <button className="mini" title="Set up AI commit messages" onClick={() => useUi.getState().setShowAiSettings(true)}>
            ✨ AI…
          </button>
        )}
        <button className="primary" disabled={!canCommit} onClick={() => void submit()}>
          {amend ? 'Amend' : 'Commit'}
          {stagedCount > 0 ? ` (${stagedCount})` : ''}
        </button>
      </div>
    </div>
  )
}
