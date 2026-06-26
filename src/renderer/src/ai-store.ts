// AI commit-message store (M3). Mirrors the main-process AiConfig (never the
// key) and drives generation. The key is write-only: it is sent to main via
// aiSetKey and never read back — the store only knows whether one exists.

import { create } from 'zustand'

import type { AiConfig, AiProviderId } from '../../shared/types'
import * as ipc from './ipc'
import { errMessage } from './errors'

interface AiState {
  config: AiConfig
  generating: boolean
  /** Set when the last generation fell back to the diff --stat summary. */
  lastTruncated: boolean
  error: string | null

  refresh: () => Promise<void>
  patchConfig: (input: { enabled?: boolean; provider?: AiProviderId; model?: string }) => Promise<void>
  setKey: (provider: AiProviderId, key: string) => Promise<void>
  generate: () => Promise<string | null>
}

const DEFAULT: AiConfig = { enabled: false, provider: 'anthropic', model: 'claude-haiku-4-5', hasKey: false }

export const useAi = create<AiState>((set) => ({
  config: DEFAULT,
  generating: false,
  lastTruncated: false,
  error: null,

  async refresh() {
    try {
      set({ config: await ipc.aiConfig() })
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async patchConfig(input) {
    try {
      set({ config: await ipc.aiSetConfig(input) })
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async setKey(provider, key) {
    try {
      await ipc.aiSetKey(provider, key)
      set({ config: await ipc.aiConfig() })
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async generate() {
    set({ generating: true, error: null, lastTruncated: false })
    try {
      const res = await ipc.aiGenerateCommitMessage()
      set({ generating: false, lastTruncated: res.truncated })
      return res.message
    } catch (e) {
      set({ error: errMessage(e), generating: false })
      return null
    }
  }
}))
