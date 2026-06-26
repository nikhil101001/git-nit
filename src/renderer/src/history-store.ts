// Blame + file-history store (M3). Holds the line attribution for the blamed
// file, the revision list for the historied file, and the diff of the selected
// revision. Both views are file-scoped overlays opened from the DiffView header.

import { create } from 'zustand'

import type { BlameLine, FileDiff, FileHistoryEntry } from '../../shared/types'
import * as ipc from './ipc'
import { errMessage } from './errors'

interface HistoryState {
  // blame overlay
  blamePath: string | null
  blameLines: BlameLine[]
  blameLoading: boolean

  // file-history overlay
  historyPath: string | null
  historyEntries: FileHistoryEntry[]
  historyLoading: boolean
  selectedOid: string | null
  historyDiff: FileDiff | null
  diffLoading: boolean

  error: string | null

  openBlame: (path: string) => Promise<void>
  closeBlame: () => void
  openHistory: (path: string) => Promise<void>
  closeHistory: () => void
  selectRevision: (oid: string) => Promise<void>
}

export const useHistory = create<HistoryState>((set, get) => ({
  blamePath: null,
  blameLines: [],
  blameLoading: false,
  historyPath: null,
  historyEntries: [],
  historyLoading: false,
  selectedOid: null,
  historyDiff: null,
  diffLoading: false,
  error: null,

  async openBlame(path) {
    set({ blamePath: path, blameLines: [], blameLoading: true, error: null })
    try {
      set({ blameLines: await ipc.blame(path), blameLoading: false })
    } catch (e) {
      set({ error: errMessage(e), blameLoading: false })
    }
  },
  closeBlame() {
    set({ blamePath: null, blameLines: [] })
  },

  async openHistory(path) {
    set({
      historyPath: path,
      historyEntries: [],
      historyLoading: true,
      selectedOid: null,
      historyDiff: null,
      error: null
    })
    try {
      const entries = await ipc.fileHistory(path)
      set({ historyEntries: entries, historyLoading: false })
      if (entries.length > 0) await get().selectRevision(entries[0].oid)
    } catch (e) {
      set({ error: errMessage(e), historyLoading: false })
    }
  },
  closeHistory() {
    set({ historyPath: null, historyEntries: [], selectedOid: null, historyDiff: null })
  },

  async selectRevision(oid) {
    const path = get().historyPath
    if (!path) return
    // Use the entry's path-at-revision so renames diff correctly.
    const entry = get().historyEntries.find((e) => e.oid === oid)
    set({ selectedOid: oid, diffLoading: true, historyDiff: null })
    try {
      const diff = await ipc.fileHistoryDiff(oid, entry?.path ?? path)
      set({ historyDiff: diff, diffLoading: false })
    } catch (e) {
      set({ error: errMessage(e), diffLoading: false })
    }
  }
}))
