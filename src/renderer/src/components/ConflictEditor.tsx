// 3-way conflict resolution (M2.2, locked decision: Monaco only here). Ours and
// theirs are read-only; the editable Result pane starts as the working-tree file
// with conflict markers. "Use ours / theirs / both" seed the result; "Mark
// resolved" writes it + `git add`s the path, after which the OpBanner's Continue
// completes the merge/rebase.

import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'

import type { ConflictFile } from '../../../shared/types'
import { useUi } from '../ui-store'
import * as ipc from '../ipc'
import * as actions from '../actions'

const READONLY = { readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false }
const EDITABLE = { minimap: { enabled: false }, scrollBeyondLastLine: false }

export default function ConflictEditor(): React.JSX.Element | null {
  const path = useUi((s) => s.conflictPath)
  const close = (): void => useUi.getState().openConflict(null)
  const [cf, setCf] = useState<ConflictFile | null>(null)
  const [result, setResult] = useState('')

  useEffect(() => {
    if (!path) {
      setCf(null)
      return
    }
    let live = true
    ipc
      .conflict(path)
      .then((c) => {
        if (!live) return
        setCf(c)
        setResult(c.merged)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [path])

  if (!path || !cf) return null

  const save = async (): Promise<void> => {
    await actions.resolveConflict(path, result)
    close()
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="conflict-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="conflict-head">
          <span className="conflict-title">Resolve conflict — {path}</span>
          <span className="conflict-quick">
            <button onClick={() => setResult(cf.ours ?? '')}>Use ours</button>
            <button onClick={() => setResult(cf.theirs ?? '')}>Use theirs</button>
            <button onClick={() => setResult(`${cf.ours ?? ''}${cf.theirs ?? ''}`)}>Use both</button>
          </span>
          <button onClick={close}>Cancel</button>
        </header>
        <div className="conflict-panes">
          <div className="cpane">
            <h4>Ours</h4>
            <Editor height="100%" theme="vs-dark" value={cf.ours ?? ''} options={READONLY} />
          </div>
          <div className="cpane">
            <h4>Result (editable)</h4>
            <Editor
              height="100%"
              theme="vs-dark"
              value={result}
              onChange={(v) => setResult(v ?? '')}
              options={EDITABLE}
            />
          </div>
          <div className="cpane">
            <h4>Theirs</h4>
            <Editor height="100%" theme="vs-dark" value={cf.theirs ?? ''} options={READONLY} />
          </div>
        </div>
        <footer className="conflict-foot">
          <button className="primary" onClick={() => void save()}>
            Mark resolved
          </button>
        </footer>
      </div>
    </div>
  )
}
