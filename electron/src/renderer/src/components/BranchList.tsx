import { useMemo } from 'react'

import { useRepo } from '../store'

export default function BranchList(): React.JSX.Element {
  const branches = useRepo((s) => s.branches)
  const local = useMemo(() => branches.filter((b) => !b.isRemote), [branches])
  const remote = useMemo(() => branches.filter((b) => b.isRemote), [branches])

  return (
    <aside className="branches">
      <h2>Branches</h2>
      <ul>
        {local.map((b) => (
          <li key={b.fullName} className={b.isHead ? 'head' : undefined}>
            {b.name}
          </li>
        ))}
        {local.length === 0 && <li className="muted">none</li>}
      </ul>

      {remote.length > 0 && (
        <>
          <h2>Remotes</h2>
          <ul>
            {remote.map((b) => (
              <li key={b.fullName} className="remote">
                {b.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
