// Read-only renderer for a parsed FileDiff (hunks + lines), reusing the diff CSS.
// Used by the file-history viewer; the interactive DiffView keeps its own copy
// because it adds per-line staging.

import type { FileDiff } from '../../../shared/types'

export default function DiffBody({ diff }: { diff: FileDiff | null }): React.JSX.Element {
  if (!diff) return <div className="diff empty">No diff.</div>
  if (diff.isBinary) return <div className="diff empty">Binary file — no text diff.</div>
  if (diff.hunks.length === 0) return <div className="diff empty">No changes.</div>

  return (
    <div className="diff">
      {diff.hunks.map((h, hi) => (
        <div className="hunk" key={hi}>
          <div className="hunk-head">
            <code>{h.header}</code>
          </div>
          {h.lines.map((ln, li) => {
            const cls = ln.origin === '+' ? 'add' : ln.origin === '-' ? 'del' : 'ctx'
            return (
              <div key={li} className={`dl ${cls}`}>
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
