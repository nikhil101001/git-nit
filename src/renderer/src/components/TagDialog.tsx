// Create a tag on a commit. A message makes it annotated; empty = lightweight.

import { useState } from 'react'

import { useUi } from '../ui-store'
import * as actions from '../actions'

export default function TagDialog(): React.JSX.Element | null {
  const oid = useUi((s) => s.tagForOid)
  const close = (): void => useUi.getState().setTagFor(null)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  if (!oid) return null

  const create = async (): Promise<void> => {
    if (!name.trim()) return
    await actions.tagCreate({
      name: name.trim(),
      message: message.trim() || undefined,
      target: oid
    })
    close()
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="small-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">New tag {oid === 'HEAD' ? 'at HEAD' : `on ${oid.slice(0, 7)}`}</header>
        <input autoFocus placeholder="tag name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="annotation message (optional → annotated)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <footer className="modal-foot">
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void create()}>
            Create tag
          </button>
        </footer>
      </div>
    </div>
  )
}
