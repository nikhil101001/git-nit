// The tag list for the sidebar Tags section, refreshed with the other views.

import { create } from 'zustand'

import type { TagRef } from '../../shared/types'
import * as ipc from './ipc'

interface TagState {
  tags: TagRef[]
  refresh: () => Promise<void>
}

export const useTags = create<TagState>((set) => ({
  tags: [],
  async refresh() {
    try {
      set({ tags: await ipc.listTags() })
    } catch {
      // no repo open yet
    }
  }
}))
