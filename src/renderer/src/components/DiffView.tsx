// Interactive diff for the selected working-tree file. Renders the engine's
// structured FileDiff (hunks + lines) with three view modes — Split (side-by-
// side, default), Inline (unified), Hunk (changed lines only) — and exposes
// stage/unstage/discard at hunk and line granularity (P0 line-level staging).

import { useEffect, useMemo, useState } from 'react'

import type { DiffLine, StageSelection } from '../../../shared/types'
import { useStatus } from '../status-store'
import { useHistory } from '../history-store'
import { useLayout } from '../layout-store'
import type { DiffMode } from '../layout-store'
import { highlightLine, langFromPath } from '../highlight'
import * as actions from '../actions'

const MODES: DiffMode[] = ['split', 'inline', 'hunk']

/** A line plus its index into the hunk's `lines` (for selection/highlighting). */
interface Cell {
  ln: DiffLine
  idx: number
}

/** Pair removed/added runs into aligned side-by-side rows; context spans both. */
function splitRows(lines: DiffLine[]): { left: Cell | null; right: Cell | null }[] {
  const rows: { left: Cell | null; right: Cell | null }[] = []
  let dels: Cell[] = []
  let adds: Cell[] = []
  const flush = (): void => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    dels = []
    adds = []
  }
  lines.forEach((ln, idx) => {
    if (ln.origin === ' ') {
      flush()
      rows.push({ left: { ln, idx }, right: { ln, idx } })
    } else if (ln.origin === '-') dels.push({ ln, idx })
    else adds.push({ ln, idx })
  })
  flush()
  return rows
}

export default function DiffView(): React.JSX.Element {
  const sel = useStatus((s) => s.selected)
  const diff = useStatus((s) => s.diff)
  const loading = useStatus((s) => s.diffLoading)
  const view = useLayout((s) => s.diffView)
  // Selected line keys, "hunkIndex:lineIndex", for line-level staging.
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Reset the line selection whenever the file/side changes.
  const selKey = sel ? `${sel.path}:${sel.staged}` : ''
  useEffect(() => setPicked(new Set()), [selKey])

  // Syntax-highlight each line once per diff (not on every pick toggle).
  const lang = useMemo(() => (sel ? langFromPath(sel.path) : null), [sel])
  const highlighted = useMemo(
    () => (diff ? diff.hunks.map((h) => h.lines.map((l) => highlightLine(l.content, lang))) : []),
    [diff, lang]
  )

  if (!sel) return <div className="diff empty">Select a file to view its diff.</div>
  if (loading) return <div className="diff empty">Loading diff…</div>
  if (!diff) return <div className="diff empty">No diff.</div>
  if (diff.isBinary) return <div className="diff empty">Binary file — no text diff.</div>
  if (diff.hunks.length === 0) return <div className="diff empty">No changes.</div>

  const staged = sel.staged
  const path = sel.path

  const toggleLine = (h: number, l: number): void => {
    const key = `${h}:${l}`
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectionsFromPicked = (): StageSelection[] => {
    const byHunk = new Map<number, number[]>()
    for (const key of picked) {
      const [h, l] = key.split(':').map(Number)
      const arr = byHunk.get(h) ?? []
      arr.push(l)
      byHunk.set(h, arr)
    }
    return [...byHunk.entries()].map(([hunkIndex, lineIndices]) => ({ path, hunkIndex, lineIndices }))
  }

  const applyPicked = async (kind: 'stage' | 'unstage' | 'discard'): Promise<void> => {
    for (const s of selectionsFromPicked()) {
      if (kind === 'stage') await actions.stage(s)
      else if (kind === 'unstage') await actions.unstage(s)
      else await actions.discard(s, `${s.lineIndices?.length} line(s) in ${path}`)
    }
    setPicked(new Set())
  }

  // One inline (single-column) diff line.
  const inlineLine = (ln: DiffLine, hi: number, li: number): React.JSX.Element => {
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
        <span className="content" dangerouslySetInnerHTML={{ __html: highlighted[hi]?.[li] ?? ' ' }} />
      </div>
    )
  }

  // One side of a split row (null = padding cell on the shorter side).
  const splitCell = (cell: Cell | null, hi: number, side: 'old' | 'new'): React.JSX.Element => {
    if (!cell) return <div className="dl-cell empty" />
    const { ln, idx } = cell
    const selectable = ln.origin !== ' '
    const key = `${hi}:${idx}`
    const cls = ln.origin === '+' ? 'add' : ln.origin === '-' ? 'del' : 'ctx'
    return (
      <div
        className={`dl-cell ${cls}${picked.has(key) ? ' picked' : ''}${selectable ? ' selectable' : ''}`}
        onClick={selectable ? () => toggleLine(hi, idx) : undefined}
      >
        <span className="ln">{(side === 'old' ? ln.oldLineno : ln.newLineno) ?? ''}</span>
        <span className="content" dangerouslySetInnerHTML={{ __html: highlighted[hi]?.[idx] ?? ' ' }} />
      </div>
    )
  }

  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-path">{path}</span>
        <span className="diff-side">{staged ? 'staged' : 'unstaged'}</span>
        <span className="diff-head-right">
          <span className="diff-modes">
            {MODES.map((m) => (
              <button
                key={m}
                className={`diff-mode${view === m ? ' active' : ''}`}
                onClick={() => useLayout.getState().setDiffView(m)}
              >
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </span>
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
          <button className="mini" title="Blame this file" onClick={() => void useHistory.getState().openBlame(path)}>
            Blame
          </button>
          <button className="mini" title="File history" onClick={() => void useHistory.getState().openHistory(path)}>
            History
          </button>
          <button
            className="mini diff-close"
            title="Close diff"
            onClick={() => void useStatus.getState().selectFile(null)}
          >
            ✕
          </button>
        </span>
      </div>

      {diff.hunks.map((h, hi) => (
        <div className="hunk" key={hi}>
          <div className="hunk-head">
            <code>{h.header}</code>
            <span className="hunk-actions">
              {staged ? (
                <button onClick={() => void actions.unstage({ path, hunkIndex: hi })}>Unstage hunk</button>
              ) : (
                <>
                  <button onClick={() => void actions.stage({ path, hunkIndex: hi })}>Stage hunk</button>
                  <button
                    className="danger"
                    onClick={() => void actions.discard({ path, hunkIndex: hi }, `hunk in ${path}`)}
                  >
                    Discard hunk
                  </button>
                </>
              )}
            </span>
          </div>

          {view === 'split' ? (
            splitRows(h.lines).map((row, ri) => (
              <div className="dl-split" key={ri}>
                {splitCell(row.left, hi, 'old')}
                {splitCell(row.right, hi, 'new')}
              </div>
            ))
          ) : (
            <>
              {h.lines.map((ln, li) =>
                view === 'hunk' && ln.origin === ' ' ? null : inlineLine(ln, hi, li)
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
