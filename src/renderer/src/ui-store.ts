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

  openConflict: (path: string | null) => void
  openRebase: (plan: RebasePlan | null) => void
  setShowStash: (v: boolean) => void
  setTagFor: (oid: string | null) => void
  setShowAuth: (v: boolean) => void
  openContext: (t: ContextTarget) => void
  closeContext: () => void
}

export const useUi = create<UiState>((set) => ({
  conflictPath: null,
  rebasePlan: null,
  showStash: false,
  tagForOid: null,
  showAuth: false,
  context: null,

  openConflict: (conflictPath) => set({ conflictPath }),
  openRebase: (rebasePlan) => set({ rebasePlan }),
  setShowStash: (showStash) => set({ showStash }),
  setTagFor: (tagForOid) => set({ tagForOid }),
  setShowAuth: (showAuth) => set({ showAuth }),
  openContext: (context) => set({ context }),
  closeContext: () => set({ context: null })
}))
