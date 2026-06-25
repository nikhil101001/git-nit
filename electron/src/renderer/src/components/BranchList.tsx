// Left sidebar: the Working Directory node (selects the staging view) plus local
// and remote branches with create / checkout / rename / delete actions. Mirrors
// the Tauri build's `BranchList.svelte`, extended with M1 branch operations.

import { useMemo, useState } from 'react'

import { useRepo } from '../store'
import { useStatus } from '../status-store'
import { useGraph } from '../graph-store'
import * as actions from '../actions'

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
            <li key={b.fullName} className={`branch${b.isHead ? ' head' : ''}`}>
              <button
                className="branch-main"
                title={b.isHead ? 'current branch' : 'checkout'}
                disabled={b.isHead}
                onClick={() => void actions.checkoutBranch(b.name)}
              >
                {b.name}
              </button>
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
    </aside>
  )
}
