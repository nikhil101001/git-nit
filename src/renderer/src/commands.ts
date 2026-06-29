// Command registry for the ⌘K palette. Each command is a global, no-argument
// action; file-scoped actions (blame, stage a hunk, …) stay in their own UI.

import * as actions from './actions'
import { useUi } from './ui-store'
import { useTheme } from './theme-store'
import { useSidebar } from './sidebar-store'
import { useGraph } from './graph-store'

export interface Command {
  id: string
  title: string
  run: () => void
}

export function buildCommands(): Command[] {
  const ui = useUi.getState()
  const expand = useSidebar.getState().expand
  return [
    { id: 'open', title: 'Open repository…', run: () => void actions.pickAndOpen() },
    { id: 'fetch', title: 'Fetch', run: () => void actions.doFetch() },
    { id: 'pull', title: 'Pull', run: () => void actions.doPull() },
    { id: 'push', title: 'Push', run: () => void actions.doPush() },
    { id: 'force-push', title: 'Force-push (with lease)', run: () => void actions.doForcePush() },
    { id: 'undo', title: 'Undo', run: () => void actions.undo() },
    { id: 'redo', title: 'Redo', run: () => void actions.redo() },
    { id: 'wip', title: 'Select uncommitted changes (WIP)', run: () => useGraph.getState().select(null) },
    { id: 'stash', title: 'Stashes (sidebar)', run: () => expand('stashes') },
    { id: 'tag', title: 'New tag at HEAD…', run: () => ui.setTagFor('HEAD') },
    { id: 'tags', title: 'Tags (sidebar)', run: () => expand('tags') },
    { id: 'tokens', title: 'HTTPS tokens…', run: () => ui.setShowAuth(true) },
    { id: 'github', title: 'Pull requests & issues (sidebar)', run: () => expand('pulls') },
    { id: 'gitflow', title: 'GitFlow…', run: () => ui.setShowGitFlow(true) },
    { id: 'worktrees', title: 'Worktrees & submodules (sidebar)', run: () => expand('worktrees') },
    { id: 'ai', title: 'AI commit messages: settings…', run: () => ui.setShowAiSettings(true) },
    { id: 'theme-system', title: 'Theme: system', run: () => useTheme.getState().setTheme('system') },
    { id: 'theme-light', title: 'Theme: light', run: () => useTheme.getState().setTheme('light') },
    { id: 'theme-dark', title: 'Theme: dark', run: () => useTheme.getState().setTheme('dark') }
  ]
}

/** Cheap subsequence fuzzy match: every query char appears in order in the title. */
export function fuzzyMatch(query: string, title: string): boolean {
  if (query === '') return true
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}
