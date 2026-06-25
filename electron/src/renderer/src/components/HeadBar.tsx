import { useRepo } from '../store'

export default function HeadBar(): React.JSX.Element {
  const head = useRepo((s) => s.head)
  const repo = useRepo((s) => s.repo)

  return (
    <div className="headbar">
      {head ? (
        <>
          {head.isDetached ? (
            <span className="ref detached">detached @ {head.target?.slice(0, 7)}</span>
          ) : (
            <span className="ref branch">⎇ {head.branch ?? '(unknown)'}</span>
          )}
          {head.summary && <span className="summary">{head.summary}</span>}
        </>
      ) : (
        <span className="ref">(no HEAD)</span>
      )}
      <span className="path" title={repo?.path}>
        {repo?.path}
      </span>
    </div>
  )
}
