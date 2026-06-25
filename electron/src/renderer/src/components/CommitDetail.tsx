// Detail panel for the commit selected in the graph: full message, identity,
// SHA, parents, and ref badges. (A per-commit file diff is a later refinement;
// M1 shows the metadata, matching the plan's "full message, parents,
// author/committer".)

import { useGraph } from '../graph-store'
import { relTime } from '../time'

export default function CommitDetail(): React.JSX.Element {
  const selectedOid = useGraph((s) => s.selectedOid)
  const row = useGraph((s) => s.rows.find((r) => r.oid === s.selectedOid))

  if (!selectedOid) {
    return <div className="detail empty">Select a commit to see details.</div>
  }
  if (!row) {
    return <div className="detail empty">Commit {selectedOid.slice(0, 7)} not in the loaded window.</div>
  }

  return (
    <div className="detail">
      <div className="detail-subject">{row.summary || '(no message)'}</div>
      <div className="detail-meta">
        <span className="author">{row.authorName}</span>
        <span className="email">&lt;{row.authorEmail}&gt;</span>
        <span className="time">{relTime(row.timeUnix)}</span>
      </div>
      <dl className="detail-grid">
        <dt>Commit</dt>
        <dd><code>{row.oid}</code></dd>
        <dt>Parents</dt>
        <dd>
          {row.parents.length === 0 ? (
            <em>none (root)</em>
          ) : (
            row.parents.map((p) => (
              <code key={p} className="parent">
                {p.slice(0, 7)}
              </code>
            ))
          )}
        </dd>
        {row.refs.length > 0 && (
          <>
            <dt>Refs</dt>
            <dd>
              {row.refs.map((b) => (
                <span key={b.kind + b.name} className={`badge ${b.kind}`}>
                  {b.name}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
