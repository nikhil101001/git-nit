// Interactive diff for the selected working-tree file. Renders the engine's
// structured FileDiff (hunks + lines) and exposes stage/unstage/discard at hunk
// and line granularity — the P0 line-level staging from SPEC §2.3. (A custom,
// structured view rather than Monaco: the diff is already parsed by the engine,
// and per-line staging needs clickable lines, which a read-only diff editor
// doesn't give. Monaco lands in M2 for the 3-way merge editor — its real
// strength — per the M1 plan note.)

import { useEffect, useState } from 'react'

import type { StageSelection } from '../../../shared/types'
import { useStatus } from '../status-store'
import * as actions from '../actions'

export default function DiffView(): React.JSX.Element {
  const sel = useStatus((s) => s.selected)
  const diff = useStatus((s) => s.diff)
  const loading = useStatus((s) => s.diffLoading)
  // Selected line keys, "hunkIndex:lineIndex", for line-level staging.
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Reset the line selection whenever the file/side changes.
  const selKey = sel ? `${sel.path}:${sel.staged}` : ''
  useEffect(() => setPicked(new Set()), [selKey])

  if (!sel) return <div className="diff empty">Select a file to view its diff.</div>
  if (loading) return <div className="diff empty">Loading diff…</div>
  if (!diff) return <div className="diff empty">No diff.</div>
  if (diff.isBinary) return <div className="diff empty">Binary file — no text diff.</div>
  if (diff.hunks.length === 0) return <div className="diff empty">No changes.</div>

  const staged = sel.staged

  const toggleLine = (h: number, l: number): void => {
    const key = `${h}:${l}`
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Group the picked line keys by hunk into stage selections.
  const selectionsFromPicked = (): StageSelection[] => {
    const byHunk = new Map<number, number[]>()
    for (const key of picked) {
      const [h, l] = key.split(':').map(Number)
      const arr = byHunk.get(h) ?? []
      arr.push(l)
      byHunk.set(h, arr)
    }
    return [...byHunk.entries()].map(([hunkIndex, lineIndices]) => ({
      path: sel.path,
      hunkIndex,
      lineIndices
    }))
  }

  const applyPicked = async (kind: 'stage' | 'unstage' | 'discard'): Promise<void> => {
    for (const s of selectionsFromPicked()) {
      if (kind === 'stage') await actions.stage(s)
      else if (kind === 'unstage') await actions.unstage(s)
      else await actions.discard(s, `${s.lineIndices?.length} line(s) in ${sel.path}`)
    }
    setPicked(new Set())
  }

  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-path">{sel.path}</span>
        <span className="diff-side">{staged ? 'staged' : 'unstaged'}</span>
        {picked.size > 0 && (
          <span className="diff-lineactions">
            {staged ? (
              <button onClick={() => void applyPicked('unstage')}>Unstage {picked.size} line(s)</button>
            ) : (
              <>
                <button onClick={() => void applyPicked('stage')}>Stage {picked.size} line(s)</button>
                <button className="danger" onClick={() => void applyPicked('discard')}>
                  Discard {picked.size}
                </button>
              </>
            )}
          </span>
        )}
      </div>

      {diff.hunks.map((h, hi) => (
        <div className="hunk" key={hi}>
          <div className="hunk-head">
            <code>{h.header}</code>
            <span className="hunk-actions">
              {staged ? (
                <button onClick={() => void actions.unstage({ path: sel.path, hunkIndex: hi })}>
                  Unstage hunk
                </button>
              ) : (
                <>
                  <button onClick={() => void actions.stage({ path: sel.path, hunkIndex: hi })}>
                    Stage hunk
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      void actions.discard({ path: sel.path, hunkIndex: hi }, `hunk in ${sel.path}`)
                    }
                  >
                    Discard hunk
                  </button>
                </>
              )}
            </span>
          </div>
          {h.lines.map((ln, li) => {
            const selectable = ln.origin !== ' '
            const key = `${hi}:${li}`
            const cls = ln.origin === '+' ? 'add' : ln.origin === '-' ? 'del' : 'ctx'
            return (
              <div
                key={li}
                className={`dl ${cls}${picked.has(key) ? ' picked' : ''}${selectable ? ' selectable' : ''}`}
                onClick={selectable ? () => toggleLine(hi, li) : undefined}
              >
                <span className="ln old">{ln.oldLineno ?? ''}</span>
                <span className="ln new">{ln.newLineno ?? ''}</span>
                <span className="origin">{ln.origin}</span>
                <span className="content">{ln.content || ' '}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
