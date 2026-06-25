// Left sidebar: the Working Directory node plus local/remote branches with
// create/checkout/rename/delete, M2 ahead/behind chips, and drag-and-drop:
// drop branch A onto branch B → Merge A into B / Rebase B onto A.

import { useMemo, useState } from 'react'

import { useRepo } from '../store'
import { useStatus } from '../status-store'
import { useGraph } from '../graph-store'
import * as actions from '../actions'

interface Drop {
  src: string
  target: string
  x: number
  y: number
}

export default function BranchList(): React.JSX.Element {
  const branches = useRepo((s) => s.branches)
  const status = useStatus((s) => s.status)
  const selectedOid = useGraph((s) => s.selectedOid)
  const select = useGraph((s) => s.select)

  const local = useMemo(() => branches.filter((b) => !b.isRemote), [branches])
  const remote = useMemo(() => branches.filter((b) => b.isRemote), [branches])

  const changes =
    (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [drop, setDrop] = useState<Drop | null>(null)

  const submitCreate = (): void => {
    const name = newName.trim()
    if (name) void actions.createBranch(name)
    setCreating(false)
    setNewName('')
  }
  const submitRename = (oldName: string): void => {
    const name = renameValue.trim()
    if (name && name !== oldName) void actions.renameBranch(oldName, name)
    setRenaming(null)
    setRenameValue('')
  }

  return (
    <aside className="branches">
      <button
        className={`wd-node${selectedOid === null ? ' selected' : ''}`}
        onClick={() => select(null)}
      >
        ● Working Directory
        {changes > 0 && <span className="wd-count">{changes}</span>}
      </button>

      <header className="branches-head">
        <h2>Branches</h2>
        <button className="mini" title="New branch" onClick={() => setCreating((v) => !v)}>
          ＋
        </button>
      </header>

      {creating && (
        <input
          className="branch-input"
          autoFocus
          placeholder="new-branch-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCreate()
            if (e.key === 'Escape') setCreating(false)
          }}
          onBlur={submitCreate}
        />
      )}

      <ul>
        {local.map((b) =>
          renaming === b.name ? (
            <li key={b.fullName}>
              <input
                className="branch-input"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(b.name)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={() => submitRename(b.name)}
              />
            </li>
          ) : (
            <li
              key={b.fullName}
              className={`branch${b.isHead ? ' head' : ''}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/branch', b.name)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('text/branch')) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                const src = e.dataTransfer.getData('text/branch')
                if (src && src !== b.name) setDrop({ src, target: b.name, x: e.clientX, y: e.clientY })
              }}
            >
              <button
                className="branch-main"
                title={b.isHead ? 'current branch' : 'checkout'}
                disabled={b.isHead}
                onClick={() => void actions.checkoutBranch(b.name)}
              >
                {b.name}
              </button>
              {(b.ahead > 0 || b.behind > 0) && (
                <span className="ab-chip" title={`${b.ahead} ahead, ${b.behind} behind ${b.upstream ?? ''}`}>
                  {b.ahead > 0 && <span className="ahead">↑{b.ahead}</span>}
                  {b.behind > 0 && <span className="behind">↓{b.behind}</span>}
                </span>
              )}
              <span className="branch-actions">
                <button
                  className="mini"
                  title="Rename"
                  onClick={() => {
                    setRenaming(b.name)
                    setRenameValue(b.name)
                  }}
                >
                  ✎
                </button>
                {!b.isHead && (
                  <button
                    className="mini danger"
                    title="Delete"
                    onClick={() => void actions.deleteBranch(b.name)}
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
          )
        )}
        {local.length === 0 && <li className="muted">none</li>}
      </ul>

      {remote.length > 0 && (
        <>
          <h2>Remotes</h2>
          <ul>
            {remote.map((b) => (
              <li key={b.fullName} className="branch remote">
                <span className="branch-main">{b.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {drop && (
        <div className="drop-overlay" onMouseDown={() => setDrop(null)}>
          <ul
            className="drop-menu"
            style={{ top: drop.y, left: drop.x }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <li
              onClick={() => {
                void actions.mergeBranchInto(drop.src, drop.target)
                setDrop(null)
              }}
            >
              Merge {drop.src} → {drop.target}
            </li>
            <li
              onClick={() => {
                void actions.rebaseBranchOnto(drop.target, drop.src)
                setDrop(null)
              }}
            >
              Rebase {drop.target} onto {drop.src}
            </li>
          </ul>
        </div>
      )}
    </aside>
  )
}
