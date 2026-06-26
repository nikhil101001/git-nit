// The stash list, refreshed with the other views.

import { create } from 'zustand'

import type { StashEntry } from '../../shared/types'
import * as ipc from './ipc'

interface StashState {
  stashes: StashEntry[]
  refresh: () => Promise<void>
}

export const useStash = create<StashState>((set) => ({
  stashes: [],
  async refresh() {
    try {
      set({ stashes: await ipc.stashList() })
    } catch {
      // no repo open yet
    }
  }
}))
