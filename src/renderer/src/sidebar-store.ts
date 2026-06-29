// Collapse state for the left sidebar reference tree (GitKraken-style). Each
// section remembers whether it's expanded, persisted to localStorage. Less-used
// sections collapse by default to keep the sidebar restrained.

import { create } from 'zustand'

export type SectionId = 'local' | 'remotes' | 'stashes' | 'tags' | 'pulls' | 'worktrees'

const KEY = 'gitnit.sidebar'

const DEFAULTS: Record<SectionId, boolean> = {
  local: false,
  remotes: false,
  stashes: true,
  tags: true,
  pulls: true,
  worktrees: true
}

function load(): Record<SectionId, boolean> {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<Record<SectionId, boolean>>
    return { ...DEFAULTS, ...j }
  } catch {
    return { ...DEFAULTS }
  }
}

interface SidebarState {
  /** true = collapsed. */
  collapsed: Record<SectionId, boolean>
  toggle: (id: SectionId) => void
  expand: (id: SectionId) => void
}

export const useSidebar = create<SidebarState>((set, get) => ({
  collapsed: load(),
  toggle: (id) => {
    const collapsed = { ...get().collapsed, [id]: !get().collapsed[id] }
    set({ collapsed })
    localStorage.setItem(KEY, JSON.stringify(collapsed))
  },
  expand: (id) => {
    if (!get().collapsed[id]) return
    const collapsed = { ...get().collapsed, [id]: false }
    set({ collapsed })
    localStorage.setItem(KEY, JSON.stringify(collapsed))
  }
}))
