// GitHub store (M3): auth state, PR/issue lists, and the in-flight device-flow
// code. The token lives only in the main process — this store only ever sees the
// auth state (signed-in + login) and the DTO lists.

import { create } from 'zustand'

import type { GitHubAuthState, GitHubDeviceCode, Issue, PullRequest, PullRequestInput } from '../../shared/types'
import * as ipc from './ipc'
import { errMessage } from './errors'

interface GitHubState {
  auth: GitHubAuthState
  pulls: PullRequest[]
  issues: Issue[]
  loadingLists: boolean
  /** The user-facing device code while a sign-in is awaiting authorization. */
  device: GitHubDeviceCode | null
  signingIn: boolean
  error: string | null

  refreshAuth: () => Promise<void>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loadLists: () => Promise<void>
  createPull: (input: PullRequestInput) => Promise<PullRequest | null>
}

export const useGitHub = create<GitHubState>((set, get) => ({
  auth: { signedIn: false, login: null },
  pulls: [],
  issues: [],
  loadingLists: false,
  device: null,
  signingIn: false,
  error: null,

  async refreshAuth() {
    try {
      const auth = await ipc.githubAuthState()
      set({ auth })
      if (auth.signedIn) await get().loadLists()
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async signIn() {
    set({ error: null, signingIn: true })
    try {
      const device = await ipc.githubStartDeviceFlow()
      set({ device })
      // awaitAuth resolves once the user authorizes (or rejects on expiry).
      const auth = await ipc.githubAwaitAuth()
      set({ auth, device: null, signingIn: false })
      await get().loadLists()
    } catch (e) {
      set({ error: errMessage(e), device: null, signingIn: false })
    }
  },

  async signOut() {
    try {
      await ipc.githubSignOut()
      set({ auth: { signedIn: false, login: null }, pulls: [], issues: [] })
    } catch (e) {
      set({ error: errMessage(e) })
    }
  },

  async loadLists() {
    set({ loadingLists: true, error: null })
    try {
      const [pulls, issues] = await Promise.all([ipc.githubListPulls(), ipc.githubListIssues()])
      set({ pulls, issues, loadingLists: false })
    } catch (e) {
      set({ error: errMessage(e), loadingLists: false })
    }
  },

  async createPull(input) {
    set({ error: null })
    try {
      const pr = await ipc.githubCreatePull(input)
      await get().loadLists()
      return pr
    } catch (e) {
      set({ error: errMessage(e) })
      return null
    }
  }
}))
