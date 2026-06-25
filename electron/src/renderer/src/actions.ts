// Cross-store actions: anything that mutates the repo runs the git op via IPC,
// then refreshes every view (repo head/branches, graph, working status) so the
// UI reflects the new state. Keeping these here avoids store↔store imports and
// gives components one place to call. Mirrors how the Tauri build funnels
// mutations through `repo.svelte.ts` then `refreshAll()`.

import type { CommitInput, StageSelection } from '../../shared/types'
import * as ipc from './ipc'
import { useRepo } from './store'
import { useGraph } from './graph-store'
import { useStatus } from './status-store'
import { errMessage } from './errors'

/** Refresh head/branches, the graph window, and the working status together. */
export async function refreshAll(): Promise<void> {
  await Promise.all([
    useRepo.getState().refreshHead(),
    useGraph.getState().reload(),
    useStatus.getState().refresh()
  ])
}

export async function openAndLoad(path: string): Promise<void> {
  await useRepo.getState().openRepo(path)
  if (useRepo.getState().repo) await refreshAll()
}

export async function pickAndOpen(): Promise<void> {
  const path = await ipc.pickDirectory()
  if (path) await openAndLoad(path)
}

/** Run a mutation, then refresh; surface any error on the repo store's banner. */
async function mutate(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    await refreshAll()
  } catch (e) {
    useRepo.setState({ error: errMessage(e) })
  }
}

// ── staging ──
export const stage = (sel: StageSelection): Promise<void> =>
  mutate(async () => {
    await ipc.stage(sel)
    await useStatus.getState().reloadDiff()
  })
export const unstage = (sel: StageSelection): Promise<void> =>
  mutate(async () => {
    await ipc.unstage(sel)
    await useStatus.getState().reloadDiff()
  })
export async function discard(sel: StageSelection, label: string): Promise<void> {
  const ok = await ipc.confirm(`Discard ${label}?`, 'This cannot be undone.')
  if (!ok) return
  await mutate(async () => {
    await ipc.discard(sel)
    await useStatus.getState().reloadDiff()
  })
}

// ── commit ──
export const commit = (input: CommitInput): Promise<void> =>
  mutate(() => ipc.commit(input))

// ── branching ──
export const createBranch = (name: string, startPoint?: string): Promise<void> =>
  mutate(() => ipc.createBranch(name, startPoint))
export const checkoutBranch = (name: string): Promise<void> =>
  mutate(() => ipc.checkoutBranch(name))
export const renameBranch = (oldName: string, newName: string): Promise<void> =>
  mutate(() => ipc.renameBranch(oldName, newName))
export async function deleteBranch(name: string): Promise<void> {
  const ok = await ipc.confirm(`Delete branch "${name}"?`)
  if (!ok) return
  await mutate(() => ipc.deleteBranch(name, false).catch(async (e) => {
    // Unmerged branch: offer a force delete.
    const force = await ipc.confirm(`"${name}" is not fully merged. Force-delete?`, errMessage(e))
    if (force) await ipc.deleteBranch(name, true)
    else throw e
  }))
}

// ── sync ──
export const doFetch = (): Promise<void> => mutate(() => ipc.fetch())
export const doPull = (): Promise<void> => mutate(() => ipc.pull())
export async function doPush(): Promise<void> {
  await mutate(() => ipc.push(false))
}
export async function doForcePush(): Promise<void> {
  const ok = await ipc.confirm('Force-push (--force-with-lease)?', 'This rewrites the remote branch.')
  if (ok) await mutate(() => ipc.push(true))
}
