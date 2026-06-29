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
  tagForOid: string | null
  showAuth: boolean
  context: ContextTarget | null
  // M3 dialogs/popovers kept after the M4 sidebar migration
  showAiSettings: boolean
  showGitFlow: boolean
  showPalette: boolean

  openConflict: (path: string | null) => void
  openRebase: (plan: RebasePlan | null) => void
  setTagFor: (oid: string | null) => void
  setShowAuth: (v: boolean) => void
  openContext: (t: ContextTarget) => void
  closeContext: () => void
  setShowAiSettings: (v: boolean) => void
  setShowGitFlow: (v: boolean) => void
  setShowPalette: (v: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  conflictPath: null,
  rebasePlan: null,
  tagForOid: null,
  showAuth: false,
  context: null,
  showAiSettings: false,
  showGitFlow: false,
  showPalette: false,

  openConflict: (conflictPath) => set({ conflictPath }),
  openRebase: (rebasePlan) => set({ rebasePlan }),
  setTagFor: (tagForOid) => set({ tagForOid }),
  setShowAuth: (showAuth) => set({ showAuth }),
  openContext: (context) => set({ context }),
  closeContext: () => set({ context: null }),
  setShowAiSettings: (showAiSettings) => set({ showAiSettings }),
  setShowGitFlow: (showGitFlow) => set({ showGitFlow }),
  setShowPalette: (showPalette) => set({ showPalette })
}))
