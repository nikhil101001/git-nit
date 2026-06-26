// Working-directory file lists: unstaged + untracked on top, staged below, with
// whole-file stage/unstage/discard. Clicking a file selects it for the DiffView.

import type { StatusEntry } from '../../../shared/types'
import { useStatus } from '../status-store'
import * as actions from '../actions'

function Row({
  entry,
  staged
}: {
  entry: StatusEntry
  staged: boolean
}): React.JSX.Element {
  const selected = useStatus((s) => s.selected)
  const selectFile = useStatus((s) => s.selectFile)
  const isSel = selected?.path === entry.path && selected?.staged === staged

  return (
    <li className={`file-row${isSel ? ' selected' : ''}`}>
      <button className="file-main" onClick={() => void selectFile({ path: entry.path, staged })}>
        <span className={`glyph s-${entry.status}`}>{entry.status}</span>
        <span className="file-path" title={entry.path}>
          {entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
        </span>
      </button>
      <span className="file-actions">
        {staged ? (
          <button title="Unstage" onClick={() => void actions.unstage({ path: entry.path })}>
            −
          </button>
        ) : (
          <>
            <button title="Stage" onClick={() => void actions.stage({ path: entry.path })}>
              +
            </button>
            <button
              className="danger"
              title="Discard"
              onClick={() => void actions.discard({ path: entry.path }, entry.path)}
            >
              ✕
            </button>
          </>
        )}
      </span>
    </li>
  )
}

export default function StagingPanel(): React.JSX.Element {
  const status = useStatus((s) => s.status)

  const unstaged = [...(status?.unstaged ?? []), ...(status?.untracked ?? [])]
  const staged = status?.staged ?? []

  const stageAll = (): void => {
    for (const e of unstaged) void actions.stage({ path: e.path })
  }
  const unstageAll = (): void => {
    for (const e of staged) void actions.unstage({ path: e.path })
  }

  return (
    <div className="staging">
      <div className="staging-section">
        <header>
          <h3>Unstaged ({unstaged.length})</h3>
          {unstaged.length > 0 && <button onClick={stageAll}>Stage all</button>}
        </header>
        <ul>
          {unstaged.map((e) => (
            <Row key={`u:${e.path}`} entry={e} staged={false} />
          ))}
          {unstaged.length === 0 && <li className="muted">nothing to stage</li>}
        </ul>
      </div>

      <div className="staging-section">
        <header>
          <h3>Staged ({staged.length})</h3>
          {staged.length > 0 && <button onClick={unstageAll}>Unstage all</button>}
        </header>
        <ul>
          {staged.map((e) => (
            <Row key={`s:${e.path}`} entry={e} staged />
          ))}
          {staged.length === 0 && <li className="muted">nothing staged</li>}
        </ul>
      </div>
    </div>
  )
}
