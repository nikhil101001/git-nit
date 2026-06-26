// Transient UI state for M2 modals/panels and the commit context menu. Kept out
// of the data stores so opening a dialog doesn't churn repo data.

import { create } from 'zustand'

import type { RebasePlan } from '../../shared/types'

interface ContextTarget {
  oid: string
  shortOid: string
  x: number
  y: number
}

interface UiState {
  conflictPath: string | null
  rebasePlan: RebasePlan | null
  showStash: boolean
  tagForOid: string | null
  showAuth: boolean
  context: ContextTarget | null
  // M3 panels/dialogs
  showGitHub: boolean
  showAiSettings: boolean
  showGitFlow: boolean
  showWorktrees: boolean
  showPalette: boolean

  openConflict: (path: string | null) => void
  openRebase: (plan: RebasePlan | null) => void
  setShowStash: (v: boolean) => void
  setTagFor: (oid: string | null) => void
  setShowAuth: (v: boolean) => void
  openContext: (t: ContextTarget) => void
  closeContext: () => void
  setShowGitHub: (v: boolean) => void
  setShowAiSettings: (v: boolean) => void
  setShowGitFlow: (v: boolean) => void
  setShowWorktrees: (v: boolean) => void
  setShowPalette: (v: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  conflictPath: null,
  rebasePlan: null,
  showStash: false,
  tagForOid: null,
  showAuth: false,
  context: null,
  showGitHub: false,
  showAiSettings: false,
  showGitFlow: false,
  showWorktrees: false,
  showPalette: false,

  openConflict: (conflictPath) => set({ conflictPath }),
  openRebase: (rebasePlan) => set({ rebasePlan }),
  setShowStash: (showStash) => set({ showStash }),
  setTagFor: (tagForOid) => set({ tagForOid }),
  setShowAuth: (showAuth) => set({ showAuth }),
  openContext: (context) => set({ context }),
  closeContext: () => set({ context: null }),
  setShowGitHub: (showGitHub) => set({ showGitHub }),
  setShowAiSettings: (showAiSettings) => set({ showAiSettings }),
  setShowGitFlow: (showGitFlow) => set({ showGitFlow }),
  setShowWorktrees: (showWorktrees) => set({ showWorktrees }),
  setShowPalette: (showPalette) => set({ showPalette })
}))
