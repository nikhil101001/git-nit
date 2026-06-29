// Local branches sidebar section: create / checkout / rename / delete, M2
// ahead/behind chips, and drag-and-drop (drop branch A onto B → Merge / Rebase).
// Ported from the old BranchList.

import { useMemo, useState } from 'react'

import { useRepo } from '../../store'
import * as actions from '../../actions'
import SidebarSection from '../SidebarSection'

interface Drop {
  src: string
  target: string
  x: number
  y: number
}

export default function LocalSection(): React.JSX.Element {
  const branches = useRepo((s) => s.branches)
  const local = useMemo(() => branches.filter((b) => !b.isRemote), [branches])

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

  const action = (
    <button className="mini" title="New branch" onClick={() => setCreating((v) => !v)}>
      ＋
    </button>
  )

  return (
    <SidebarSection id="local" title="Local" count={local.length} action={action}>
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
                  <button className="mini danger" title="Delete" onClick={() => void actions.deleteBranch(b.name)}>
                    ✕
                  </button>
                )}
              </span>
            </li>
          )
        )}
        {local.length === 0 && <li className="muted">none</li>}
      </ul>

      {drop && (
        <div className="drop-overlay" onMouseDown={() => setDrop(null)}>
          <ul className="drop-menu" style={{ top: drop.y, left: drop.x }} onMouseDown={(e) => e.stopPropagation()}>
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
    </SidebarSection>
  )
}
