// Remote branches sidebar section: a read-only list (checkout-as-local would be
// a future refinement). Ported from the old BranchList.

import { useMemo } from 'react'

import { useRepo } from '../../store'
import SidebarSection from '../SidebarSection'

export default function RemotesSection(): React.JSX.Element {
  const branches = useRepo((s) => s.branches)
  const remote = useMemo(() => branches.filter((b) => b.isRemote), [branches])

  return (
    <SidebarSection id="remotes" title="Remotes" count={remote.length}>
      <ul>
        {remote.map((b) => (
          <li key={b.fullName} className="branch remote">
            <span className="branch-main" title={b.name}>
              {b.name}
            </span>
          </li>
        ))}
        {remote.length === 0 && <li className="muted">none</li>}
      </ul>
    </SidebarSection>
  )
}
