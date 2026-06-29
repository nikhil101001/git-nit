// Blame pane (§1.1 — browseable, not a modal): per-line author / short-oid /
// time alongside the file content. Rendered in the center column over the graph,
// with a close button. Consecutive lines from the same commit show the
// attribution only on the first row of the run, like a gutter.

import { useHistory } from '../history-store'
import { relTime } from '../time'

export default function BlameView(): React.JSX.Element | null {
  const path = useHistory((s) => s.blamePath)
  const lines = useHistory((s) => s.blameLines)
  const loading = useHistory((s) => s.blameLoading)
  const close = useHistory((s) => s.closeBlame)
  if (!path) return null

  return (
    <div className="center-pane">
      <div className="diff-head">
        <span className="diff-path">Blame</span>
        <span className="diff-side">{path}</span>
        <span className="diff-head-right">
          <button className="mini diff-close" title="Close blame" onClick={close}>
            ✕
          </button>
        </span>
      </div>
      <div className="blame-body">
        {loading && <div className="muted blame-empty">Loading blame…</div>}
        {!loading && lines.length === 0 && <div className="muted blame-empty">No blame data.</div>}
        {!loading &&
          lines.map((ln, i) => {
            const firstOfRun = i === 0 || lines[i - 1].oid !== ln.oid
            return (
              <div className="blame-line" key={i}>
                <span className="blame-gutter" title={firstOfRun ? ln.summary : undefined}>
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
  )
}
