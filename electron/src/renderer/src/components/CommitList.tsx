import { useRepo } from '../store'

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function relTime(unixSeconds: number): string {
  const diffMs = unixSeconds * 1000 - Date.now()
  const mins = Math.round(diffMs / 60000)
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return rtf.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return rtf.format(months, 'month')
  return rtf.format(Math.round(months / 12), 'year')
}

export default function CommitList(): React.JSX.Element {
  const commits = useRepo((s) => s.commits)

  return (
    <section className="commits">
      <h2>Commits ({commits.length})</h2>
      <ul>
        {commits.map((c) => (
          <li key={c.oid}>
            <code className="sha">{c.shortOid}</code>
            <span className="msg" title={c.summary}>
              {c.summary}
            </span>
            <span className="author">{c.authorName}</span>
            <span className="time">{relTime(c.timeUnix)}</span>
          </li>
        ))}
      </ul>
      {commits.length === 0 && <p className="muted">No commits yet.</p>}
    </section>
  )
}
