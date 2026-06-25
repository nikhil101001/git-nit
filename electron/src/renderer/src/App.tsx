import { useEffect } from 'react'

import { useRepo } from './store'
import { useGraph } from './graph-store'
import { onRefresh } from './ipc'
import * as actions from './actions'
import RepoPicker from './components/RepoPicker'
import Toolbar from './components/Toolbar'
import HeadBar from './components/HeadBar'
import BranchList from './components/BranchList'
import GraphCanvas from './components/GraphCanvas'
import CommitDetail from './components/CommitDetail'
import WorkingArea from './components/WorkingArea'

export default function App(): React.JSX.Element {
  const repo = useRepo((s) => s.repo)
  const error = useRepo((s) => s.error)
  const loading = useRepo((s) => s.loading)
  const selectedOid = useGraph((s) => s.selectedOid)

  // Re-fetch every view whenever the backend reports a filesystem change.
  useEffect(() => onRefresh(() => void actions.refreshAll()), [])

  return (
    <main className="app">
      <header className="topbar">
        <h1>git-nit</h1>
        <RepoPicker />
        <div className="spacer" />
        {repo && <Toolbar />}
      </header>

      {error && <div className="banner error">{error}</div>}

      {repo ? (
        <>
          <HeadBar />
          <div className="panes">
            <BranchList />
            <GraphCanvas />
            <div className="right-panel">
              {selectedOid === null ? <WorkingArea /> : <CommitDetail />}
            </div>
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
