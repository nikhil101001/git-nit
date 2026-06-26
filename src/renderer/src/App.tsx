import { useEffect } from 'react'

import { useRepo } from './store'
import { useGraph } from './graph-store'
import { useUi } from './ui-store'
import { onRefresh } from './ipc'
import * as actions from './actions'
import RepoPicker from './components/RepoPicker'
import Toolbar from './components/Toolbar'
import HeadBar from './components/HeadBar'
import OpBanner from './components/OpBanner'
import BranchList from './components/BranchList'
import GraphCanvas from './components/GraphCanvas'
import CommitDetail from './components/CommitDetail'
import WorkingArea from './components/WorkingArea'
import ConflictEditor from './components/ConflictEditor'
import RebaseUI from './components/RebaseUI'
import StashPanel from './components/StashPanel'
import TagDialog from './components/TagDialog'
import AuthDialog from './components/AuthDialog'
import CommitContextMenu from './components/CommitContextMenu'
import BlameView from './components/BlameView'
import FileHistory from './components/FileHistory'
import GitHubPanel from './components/GitHubPanel'
import DeviceFlowDialog from './components/DeviceFlowDialog'
import AiSettings from './components/AiSettings'
import GitFlowMenu from './components/GitFlowMenu'
import WorktreePanel from './components/WorktreePanel'
import CommandPalette from './components/CommandPalette'

export default function App(): React.JSX.Element {
  const repo = useRepo((s) => s.repo)
  const error = useRepo((s) => s.error)
  const loading = useRepo((s) => s.loading)
  const selectedOid = useGraph((s) => s.selectedOid)

  // Re-fetch every view whenever the backend reports a filesystem change.
  useEffect(() => onRefresh(() => void actions.refreshAll()), [])

  // Global ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const ui = useUi.getState()
        ui.setShowPalette(!ui.showPalette)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          <OpBanner />
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

      {/* M2 overlays — each renders null unless active */}
      <ConflictEditor />
      <RebaseUI />
      <StashPanel />
      <TagDialog />
      <AuthDialog />
      <CommitContextMenu />
      <BlameView />
      <FileHistory />
      <GitHubPanel />
      <DeviceFlowDialog />
      <AiSettings />
      <GitFlowMenu />
      <WorktreePanel />
      <CommandPalette />
    </main>
  )
}
