// ⌘K command palette: a fuzzy launcher over the global command registry. Arrow
// keys move the selection, Enter runs it, Esc closes. Opened via the ui store
// (the global ⌘K handler lives in App).

import { useEffect, useMemo, useState } from 'react'

import { buildCommands, fuzzyMatch } from '../commands'
import { useUi } from '../ui-store'

export default function CommandPalette(): React.JSX.Element | null {
  const show = useUi((s) => s.showPalette)
  const close = (): void => useUi.getState().setShowPalette(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  // Rebuild the command list fresh each open (captures current store setters).
  const all = useMemo(() => (show ? buildCommands() : []), [show])
  const matches = useMemo(() => all.filter((c) => fuzzyMatch(query, c.title)), [all, query])

  useEffect(() => {
    if (show) {
      setQuery('')
      setActive(0)
    }
  }, [show])

  useEffect(() => setActive(0), [query])

  if (!show) return null

  const run = (i: number): void => {
    const cmd = matches[i]
    if (cmd) {
      close()
      cmd.run()
    }
  }

  return (
    <div className="modal-overlay palette-overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, matches.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(active)
            } else if (e.key === 'Escape') {
              close()
            }
          }}
        />
        <ul className="palette-list">
          {matches.map((c, i) => (
            <li
              key={c.id}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              {c.title}
            </li>
          ))}
          {matches.length === 0 && <li className="muted">No matching commands.</li>}
        </ul>
      </div>
    </div>
  )
}
