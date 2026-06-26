// Persisted pane sizes + diff view mode for the resizable 3-column layout
// (sidebar · center · right). Stored in localStorage so the layout/preferences
// survive reloads; the center column flexes to fill whatever's left.

import { create } from 'zustand'

const KEY = 'gitnit.layout'

export type DiffMode = 'split' | 'inline' | 'hunk'

interface Persisted {
  sidebarWidth: number
  rightWidth: number
  diffView: DiffMode
}

const DEFAULTS: Persisted = { sidebarWidth: 240, rightWidth: 380, diffView: 'split' }

function load(): Persisted {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<Persisted>
    return {
      sidebarWidth: typeof j.sidebarWidth === 'number' ? j.sidebarWidth : DEFAULTS.sidebarWidth,
      rightWidth: typeof j.rightWidth === 'number' ? j.rightWidth : DEFAULTS.rightWidth,
      diffView:
        j.diffView === 'split' || j.diffView === 'inline' || j.diffView === 'hunk'
          ? j.diffView
          : DEFAULTS.diffView
    }
  } catch {
    return DEFAULTS
  }
}

interface LayoutState extends Persisted {
  setSidebarWidth: (n: number) => void
  setRightWidth: (n: number) => void
  setDiffView: (m: DiffMode) => void
}

export const useLayout = create<LayoutState>((set, get) => ({
  ...load(),
  setSidebarWidth: (sidebarWidth) => {
    set({ sidebarWidth })
    persist(get())
  },
  setRightWidth: (rightWidth) => {
    set({ rightWidth })
    persist(get())
  },
  setDiffView: (diffView) => {
    set({ diffView })
    persist(get())
  }
}))

function persist(s: Persisted): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ sidebarWidth: s.sidebarWidth, rightWidth: s.rightWidth, diffView: s.diffView })
  )
}
