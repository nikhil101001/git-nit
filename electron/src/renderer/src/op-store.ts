// In-progress operation status (merge/rebase/cherry-pick/revert) + undo/redo
// availability. Refreshed together with the other views by actions.refreshAll().

import { create } from 'zustand'

import type { OpStatus, UndoState } from '../../shared/types'
import * as ipc from './ipc'

interface OpState {
  status: OpStatus | null
  undo: UndoState | null
  refresh: () => Promise<void>
}

export const useOp = create<OpState>((set) => ({
  status: null,
  undo: null,
  async refresh() {
    try {
      const [status, undo] = await Promise.all([ipc.opStatus(), ipc.undoState()])
      set({ status, undo })
    } catch {
      // no repo open yet
    }
  }
}))
