// Detail panel for the commit selected in the graph: full message, identity,
// SHA, parents, and ref badges. (A per-commit file diff is a later refinement;
// M1 shows the metadata, matching the plan's "full message, parents,
// author/committer".)

import { useEffect, useState } from 'react'

import { useGraph } from '../graph-store'
import { relTime } from '../time'
import * as ipc from '../ipc'

// git %G? → a label + badge class. N (none) renders nothing.
const SIG: Record<string, { label: string; cls: string }> = {
  G: { label: 'signed', cls: 'sig-good' },
  U: { label: 'signed (unknown validity)', cls: 'sig-good' },
  B: { label: 'bad signature', cls: 'sig-bad' },
  X: { label: 'signature expired', cls: 'sig-warn' },
  Y: { label: 'signing key expired', cls: 'sig-warn' },
  R: { label: 'signing key revoked', cls: 'sig-bad' },
  E: { label: 'signature error', cls: 'sig-warn' }
}

export default function CommitDetail(): React.JSX.Element {
  const selectedOid = useGraph((s) => s.selectedOid)
  const row = useGraph((s) => s.rows.find((r) => r.oid === s.selectedOid))
  const [sig, setSig] = useState<string>('N')

  useEffect(() => {
    setSig('N')
    if (selectedOid) void ipc.commitSignature(selectedOid).then(setSig).catch(() => {})
  }, [selectedOid])

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
        {SIG[sig] && (
          <span className={`sig-badge ${SIG[sig].cls}`} title={`commit signature: ${SIG[sig].label}`}>
            🔏 {SIG[sig].label}
          </span>
        )}
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
