// Worktrees + submodules panel: list linked worktrees (add/remove) and
// submodules (status + update).

import { useEffect, useState } from 'react'

import { useWorktrees } from '../worktree-store'
import { useUi } from '../ui-store'
import * as ipc from '../ipc'

const SUBMODULE_LABEL: Record<string, string> = {
  upToDate: 'up to date',
  uninitialized: 'uninitialized',
  outOfDate: 'out of date',
  conflict: 'conflict'
}

export default function WorktreePanel(): React.JSX.Element | null {
  const show = useUi((s) => s.showWorktrees)
  const close = (): void => useUi.getState().setShowWorktrees(false)
  const worktrees = useWorktrees((s) => s.worktrees)
  const submodules = useWorktrees((s) => s.submodules)
  const loading = useWorktrees((s) => s.loading)
  const error = useWorktrees((s) => s.error)
  const refresh = useWorktrees((s) => s.refresh)

  const [path, setPath] = useState('')
  const [ref, setRef] = useState('')

  useEffect(() => {
    if (show) void refresh()
  }, [show, refresh])

  if (!show) return null

  const add = async (): Promise<void> => {
    if (path.trim() === '') return
    await useWorktrees.getState().add(path.trim(), ref.trim())
    setPath('')
    setRef('')
  }

  const remove = async (p: string): Promise<void> => {
    const ok = await ipc.confirm(`Remove worktree?`, p)
    if (ok) await useWorktrees.getState().remove(p, false)
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="wt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="conflict-head">
          <span className="conflict-title">Worktrees &amp; submodules</span>
          <div className="conflict-quick">
            <button onClick={close}>Close</button>
          </div>
        </div>

        {error && <div className="banner error">{error}</div>}

        <div className="wt-body">
          <h3>Worktrees {loading ? '…' : `(${worktrees.length})`}</h3>
          <ul className="wt-list">
            {worktrees.map((w) => (
              <li key={w.path}>
                <span className="wt-path" title={w.path}>
                  {w.path}
                </span>
                <span className="muted wt-branch">
                  {w.isBare ? 'bare' : w.branch ?? `detached @ ${w.head.slice(0, 8)}`}
                  {w.isMain ? ' · main' : ''}
                  {w.locked ? ' · locked' : ''}
                </span>
                {!w.isMain && (
                  <button className="danger mini" onClick={() => void remove(w.path)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
            {!loading && worktrees.length === 0 && <li className="muted">No worktrees.</li>}
          </ul>

          <div className="wt-add">
            <input placeholder="new worktree path" value={path} onChange={(e) => setPath(e.target.value)} />
            <input placeholder="branch / ref (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
            <button className="primary" disabled={path.trim() === ''} onClick={() => void add()}>
              Add
            </button>
          </div>

          <div className="wt-sub-head">
            <h3>Submodules ({submodules.length})</h3>
            {submodules.length > 0 && (
              <button onClick={() => void useWorktrees.getState().updateSubmodules()}>
                Update all
              </button>
            )}
          </div>
          <ul className="wt-list">
            {submodules.map((s) => (
              <li key={s.path}>
                <span className="wt-path" title={s.path}>
                  {s.path}
                </span>
                <span className="muted wt-branch">
                  {s.describe ?? s.head.slice(0, 8)} · {SUBMODULE_LABEL[s.status] ?? s.status}
                </span>
              </li>
            ))}
            {submodules.length === 0 && <li className="muted">No submodules.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
