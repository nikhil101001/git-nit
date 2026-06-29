// Worktrees + submodules sidebar section (replaces the WorktreePanel modal):
// list/add/remove worktrees and update submodules inline.

import { useState } from 'react'

import { useWorktrees } from '../../worktree-store'
import * as ipc from '../../ipc'
import SidebarSection from '../SidebarSection'

const SUBMODULE_LABEL: Record<string, string> = {
  upToDate: 'up to date',
  uninitialized: 'uninitialized',
  outOfDate: 'out of date',
  conflict: 'conflict'
}

export default function WorktreesSection(): React.JSX.Element {
  const worktrees = useWorktrees((s) => s.worktrees)
  const submodules = useWorktrees((s) => s.submodules)
  const error = useWorktrees((s) => s.error)

  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState('')
  const [ref, setRef] = useState('')

  const add = async (): Promise<void> => {
    if (path.trim() === '') return
    await useWorktrees.getState().add(path.trim(), ref.trim())
    setPath('')
    setRef('')
    setAdding(false)
  }
  const remove = async (p: string): Promise<void> => {
    const ok = await ipc.confirm('Remove worktree?', p)
    if (ok) await useWorktrees.getState().remove(p, false)
  }

  const action = (
    <button className="mini" title="Add worktree" onClick={() => setAdding((v) => !v)}>
      ＋
    </button>
  )

  return (
    <SidebarSection
      id="worktrees"
      title="Worktrees"
      count={worktrees.length}
      action={action}
      onExpand={() => void useWorktrees.getState().refresh()}
    >
      {error && <div className="banner error sb-error">{error}</div>}
      {adding && (
        <div className="sb-form">
          <input autoFocus placeholder="new worktree path" value={path} onChange={(e) => setPath(e.target.value)} />
          <input placeholder="branch / ref (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
          <button className="primary mini" disabled={path.trim() === ''} onClick={() => void add()}>
            Add
          </button>
        </div>
      )}
      <ul>
        {worktrees.map((w) => (
          <li key={w.path} className="sb-row">
            <span className="sb-row-main" title={w.path}>
              {w.branch ?? (w.isBare ? 'bare' : `detached @ ${w.head.slice(0, 8)}`)}
              {w.isMain ? ' · main' : ''}
            </span>
            {!w.isMain && (
              <span className="sb-row-actions">
                <button className="mini danger" title="Remove" onClick={() => void remove(w.path)}>
                  ✕
                </button>
              </span>
            )}
          </li>
        ))}
        {worktrees.length === 0 && <li className="muted">none</li>}
      </ul>

      {submodules.length > 0 && (
        <>
          <div className="sb-subhead">
            Submodules
            <button className="mini" title="Update all" onClick={() => void useWorktrees.getState().updateSubmodules()}>
              update
            </button>
          </div>
          <ul>
            {submodules.map((s) => (
              <li key={s.path} className="sb-row">
                <span className="sb-row-main" title={s.path}>
                  {s.path}
                </span>
                <span className="muted sb-sub-status">{SUBMODULE_LABEL[s.status] ?? s.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SidebarSection>
  )
}
