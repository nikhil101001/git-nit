// Commit-graph window store. Holds the loaded rows, the paging cursor, the
// active filters, and the current selection (null = the Working Directory node).
// Mirrors the Tauri build's `graph.svelte.ts`.

import { create } from 'zustand'

import type { GraphFilters, GraphRow } from '../../shared/types'
import * as ipc from './ipc'
import { errMessage } from './errors'

const PAGE = 500

interface GraphState {
  rows: GraphRow[]
  nextCursor: string | null
  filters: GraphFilters
  loading: boolean
  /** Selected commit oid; null means the Working Directory node is selected. */
  selectedOid: string | null
  error: string | null

  reload: () => Promise<void>
  loadMore: () => Promise<void>
  setFilters: (patch: Partial<GraphFilters>) => Promise<void>
  select: (oid: string | null) => void
}

export const useGraph = create<GraphState>((set, get) => ({
  rows: [],
  nextCursor: null,
  filters: { includeRemotes: true, currentBranchOnly: false, query: '' },
  loading: false,
  selectedOid: null,
  error: null,

  async reload() {
    set({ loading: true, error: null })
    try {
      const page = await ipc.graphPage(undefined, PAGE, get().filters)
      set({ rows: page.rows, nextCursor: page.nextCursor })
    } catch (e) {
      set({ error: errMessage(e), rows: [], nextCursor: null })
    } finally {
      set({ loading: false })
    }
  },

  async loadMore() {
    const { nextCursor, loading, filters, rows } = get()
    if (nextCursor === null || loading) return
    set({ loading: true })
    try {
      const page = await ipc.graphPage(nextCursor, PAGE, filters)
      set({ rows: [...rows, ...page.rows], nextCursor: page.nextCursor })
    } catch (e) {
      set({ error: errMessage(e) })
    } finally {
      set({ loading: false })
    }
  },

  async setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } })
    await get().reload()
  },

  select(oid) {
    set({ selectedOid: oid })
  }
}))
