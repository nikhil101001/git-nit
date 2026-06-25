import { useEffect } from 'react'

import { useRepo } from './store'
import { onRefresh } from './ipc'
import RepoPicker from './components/RepoPicker'
import HeadBar from './components/HeadBar'
import BranchList from './components/BranchList'
import CommitList from './components/CommitList'

export default function App(): React.JSX.Element {
  const repo = useRepo((s) => s.repo)
  const error = useRepo((s) => s.error)
  const loading = useRepo((s) => s.loading)
  const refreshAll = useRepo((s) => s.refreshAll)

  // Re-fetch whenever the backend reports a filesystem change.
  useEffect(() => onRefresh(() => void refreshAll()), [refreshAll])

  return (
    <main className="app">
      <header className="topbar">
        <h1>git-nit</h1>
        <RepoPicker />
      </header>

      {error && <div className="banner error">{error}</div>}

      {repo ? (
        <>
          <HeadBar />
          <div className="panes">
            <BranchList />
            <CommitList />
          </div>
        </>
      ) : (
        <div className="empty">
          {loading ? 'Opening…' : 'Open a Git repository to get started.'}
        </div>
      )}
    </main>
  )
}
