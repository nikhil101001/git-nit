// Blame overlay: per-line author / short-oid / time alongside the file content.
// Consecutive lines from the same commit show the attribution only on the first
// row of the run, like a gutter.

import { useHistory } from '../history-store'
import { relTime } from '../time'

export default function BlameView(): React.JSX.Element | null {
  const path = useHistory((s) => s.blamePath)
  const lines = useHistory((s) => s.blameLines)
  const loading = useHistory((s) => s.blameLoading)
  const close = useHistory((s) => s.closeBlame)
  if (!path) return null

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="blame-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="conflict-head">
          <span className="conflict-title">Blame — {path}</span>
          <div className="conflict-quick">
            <button onClick={close}>Close</button>
          </div>
        </div>
        <div className="blame-body">
          {loading && <div className="muted blame-empty">Loading blame…</div>}
          {!loading && lines.length === 0 && <div className="muted blame-empty">No blame data.</div>}
          {!loading &&
            lines.map((ln, i) => {
              const firstOfRun = i === 0 || lines[i - 1].oid !== ln.oid
              return (
                <div className="blame-line" key={i}>
                  <span className="blame-gutter" title={firstOfRun ? `${ln.summary}` : undefined}>
                    {firstOfRun && (
                      <>
                        <span className="sha">{ln.shortOid}</span>
                        <span className="blame-author">{ln.author}</span>
                        <span className="blame-time">{ln.timeUnix ? relTime(ln.timeUnix) : ''}</span>
                      </>
                    )}
                  </span>
                  <span className="blame-no">{ln.line}</span>
                  <span className="blame-content">{ln.content || ' '}</span>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
