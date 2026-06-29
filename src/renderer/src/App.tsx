import { useEffect, useState } from 'react'

import { useRepo } from './store'
import { useGraph } from './graph-store'
import { useUi } from './ui-store'
import { useStatus } from './status-store'
import { useLayout } from './layout-store'
import { useHistory } from './history-store'
import type { GitInfo } from '../../shared/types'
import { onRefresh, gitInfo } from './ipc'
import * as actions from './actions'
import ResizeHandle from './components/ResizeHandle'
import WelcomePage from './components/WelcomePage'
import Toolbar from './components/Toolbar'
import HeadBar from './components/HeadBar'
import OpBanner from './components/OpBanner'
import SidebarTree from './components/SidebarTree'
import GraphCanvas from './components/GraphCanvas'
import CommitDetail from './components/CommitDetail'
import WorkingArea from './components/WorkingArea'
import DiffView from './components/DiffView'
import ConflictEditor from './components/ConflictEditor'
import RebaseUI from './components/RebaseUI'
import TagDialog from './components/TagDialog'
import AuthDialog from './components/AuthDialog'
import CommitContextMenu from './components/CommitContextMenu'
import BlameView from './components/BlameView'
import FileHistory from './components/FileHistory'
import DeviceFlowDialog from './components/DeviceFlowDialog'
import AiSettings from './components/AiSettings'
import GitFlowMenu from './components/GitFlowMenu'
import CommandPalette from './components/CommandPalette'
import UpdateBanner from './components/UpdateBanner'

export default function App(): React.JSX.Element {
  const repo = useRepo((s) => s.repo)
  const error = useRepo((s) => s.error)
  const [git, setGit] = useState<GitInfo | null>(null)
  const selectedOid = useGraph((s) => s.selectedOid)
  const fileSelected = useStatus((s) => s.selected !== null)
  const sidebarWidth = useLayout((s) => s.sidebarWidth)
  const rightWidth = useLayout((s) => s.rightWidth)
  const blamePath = useHistory((s) => s.blamePath)
  const historyPath = useHistory((s) => s.historyPath)

  // Center column: blame / file-history panes take over (§1.1), else the
  // working-dir file diff, else the graph. A commit selection routes the right
  // panel to CommitDetail.
  const showDiff = selectedOid === null && fileSelected
  const center = blamePath ? (
    <BlameView />
  ) : historyPath ? (
    <FileHistory />
  ) : showDiff ? (
    <DiffView />
  ) : (
    <GraphCanvas />
  )

  // Re-fetch every view whenever the backend reports a filesystem change.
  useEffect(() => onRefresh(() => void actions.refreshAll()), [])

  // Startup git-availability check (M5.6).
  useEffect(() => void gitInfo().then(setGit).catch(() => {}), [])

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

      <UpdateBanner />
      {git && !git.ok && (
        <div className="banner error">
          {git.present
            ? `git ${git.version ?? '?'} is older than the required ${git.min} — please update git.`
            : 'git was not found on your PATH — install git to use git-nit.'}
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      {repo ? (
        <>
          <HeadBar />
          <OpBanner />
          <div className="panes">
            <div className="pane-sidebar" style={{ width: sidebarWidth }}>
              <SidebarTree />
            </div>
            <ResizeHandle
              value={sidebarWidth}
              onChange={useLayout.getState().setSidebarWidth}
              sign={1}
              min={160}
              max={480}
            />
            <div className="pane-center">{center}</div>
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

      {/* Overlays kept as modals/popovers — each renders null unless active.
          (Stash / GitHub / worktree lists moved into the sidebar tree.) */}
      <ConflictEditor />
      <RebaseUI />
      <TagDialog />
      <AuthDialog />
      <CommitContextMenu />
      <DeviceFlowDialog />
      <AiSettings />
      <GitFlowMenu />
      <CommandPalette />
    </main>
  )
}
