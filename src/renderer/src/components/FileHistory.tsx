// File-history pane (§1.1 — browseable, not a modal): the revisions that touched
// a file (newest→oldest, following renames) on the left, the selected revision's
// diff on the right. Rendered in the center column with a close button.

import { useHistory } from '../history-store'
import { relTime } from '../time'
import DiffBody from './DiffBody'

export default function FileHistory(): React.JSX.Element | null {
  const path = useHistory((s) => s.historyPath)
  const entries = useHistory((s) => s.historyEntries)
  const loading = useHistory((s) => s.historyLoading)
  const selectedOid = useHistory((s) => s.selectedOid)
  const diff = useHistory((s) => s.historyDiff)
  const diffLoading = useHistory((s) => s.diffLoading)
  const select = useHistory((s) => s.selectRevision)
  const close = useHistory((s) => s.closeHistory)
  if (!path) return null

  return (
    <div className="center-pane">
      <div className="diff-head">
        <span className="diff-path">History</span>
        <span className="diff-side">{path}</span>
        <span className="diff-head-right">
          <button className="mini diff-close" title="Close history" onClick={close}>
            ✕
          </button>
        </span>
      </div>
      <div className="history-body">
        <ul className="history-list">
          {loading && <li className="muted">Loading history…</li>}
          {!loading && entries.length === 0 && <li className="muted">No history.</li>}
          {entries.map((e) => (
            <li
              key={e.oid}
              className={`history-item${e.oid === selectedOid ? ' selected' : ''}`}
              onClick={() => void select(e.oid)}
            >
              <span className="history-summary" title={e.summary}>
                {e.summary}
              </span>
              <span className="history-meta">
                <span className="sha">{e.shortOid}</span>
                <span className="history-author">{e.authorName}</span>
                <span className="history-time">{relTime(e.timeUnix)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="history-diff">
          {diffLoading ? <div className="diff empty">Loading diff…</div> : <DiffBody diff={diff} />}
        </div>
      </div>
    </div>
  )
}
