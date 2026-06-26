import { useEffect } from 'react'

import { useRepo } from './store'
import { useGraph } from './graph-store'
import { useUi } from './ui-store'
import { useStatus } from './status-store'
import { useLayout } from './layout-store'
import { onRefresh } from './ipc'
import * as actions from './actions'
import ResizeHandle from './components/ResizeHandle'
import WelcomePage from './components/WelcomePage'
import Toolbar from './components/Toolbar'
import HeadBar from './components/HeadBar'
import OpBanner from './components/OpBanner'
import BranchList from './components/BranchList'
import GraphCanvas from './components/GraphCanvas'
import CommitDetail from './components/CommitDetail'
import WorkingArea from './components/WorkingArea'
import DiffView from './components/DiffView'
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
  const selectedOid = useGraph((s) => s.selectedOid)
  const fileSelected = useStatus((s) => s.selected !== null)
  const sidebarWidth = useLayout((s) => s.sidebarWidth)
  const rightWidth = useLayout((s) => s.rightWidth)

  // Working-dir file diff takes over the center column (over the graph); a
  // commit selection routes the right panel to CommitDetail instead.
  const showDiff = selectedOid === null && fileSelected

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
        <h1 className="app-name">git-nit</h1>
        {repo && (
          <div className="topbar-right">
            <Toolbar />
          </div>
        )}
      </header>

      {error && <div className="banner error">{error}</div>}

      {repo ? (
        <>
          <HeadBar />
          <OpBanner />
          <div className="panes">
            <div className="pane-sidebar" style={{ width: sidebarWidth }}>
              <BranchList />
            </div>
            <ResizeHandle
              value={sidebarWidth}
              onChange={useLayout.getState().setSidebarWidth}
              sign={1}
              min={160}
              max={480}
            />
            <div className="pane-center">{showDiff ? <DiffView /> : <GraphCanvas />}</div>
            <ResizeHandle
              value={rightWidth}
              onChange={useLayout.getState().setRightWidth}
              sign={-1}
              min={280}
              max={760}
            />
            <div className="pane-right" style={{ width: rightWidth }}>
              {selectedOid === null ? <WorkingArea /> : <CommitDetail />}
            </div>
          </div>
        </>
      ) : (
        <WelcomePage />
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
