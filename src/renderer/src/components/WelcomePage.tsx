// Welcome / empty-state page (GitKraken-style): a prominent Open button, a search
// box, and the list of previously-opened repositories. Opening from here records
// the repo in the recent list (handled main-side on repo:open).

import { useEffect, useMemo, useState } from 'react'

import type { RecentRepo } from '../../../shared/types'
import * as ipc from '../ipc'
import * as actions from '../actions'
import { useRepo } from '../store'

export default function WelcomePage(): React.JSX.Element {
  const loading = useRepo((s) => s.loading)
  const [recents, setRecents] = useState<RecentRepo[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void ipc.recentRepos().then(setRecents).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recents
    return recents.filter(
      (r) => r.name.toLowerCase().includes(q) || r.display.toLowerCase().includes(q)
    )
  }, [recents, query])

  const remove = async (path: string): Promise<void> => {
    setRecents(await ipc.removeRecentRepo(path))
  }

  return (
    <div className="welcome">
      <div className="welcome-panel">
        <h1 className="welcome-title">Repositories</h1>

        <div className="welcome-actions">
          <button className="welcome-open" disabled={loading} onClick={() => void actions.pickAndOpen()}>
            <span className="welcome-open-icon">📂</span>
            <span>{loading ? 'Opening…' : 'Open a repository'}</span>
          </button>
        </div>

        <div className="welcome-search">
          <span className="welcome-search-icon">⌕</span>
          <input
            placeholder="Search repositories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <h2 className="welcome-recent-head">Recent</h2>
        <ul className="recent-list">
          {filtered.map((r) => (
            <li className="recent-item" key={r.path}>
              <button className="recent-open" title={r.path} onClick={() => void actions.openAndLoad(r.path)}>
                <span className="recent-name">{r.name}</span>
                <span className="recent-path">{r.display}</span>
              </button>
              <button
                className="recent-remove"
                title="Remove from recents"
                onClick={() => void remove(r.path)}
              >
                ✕
              </button>
            </li>
          ))}
          {recents.length === 0 && (
            <li className="recent-empty muted">No repositories yet — open one to get started.</li>
          )}
          {recents.length > 0 && filtered.length === 0 && (
            <li className="recent-empty muted">No matches for “{query}”.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
