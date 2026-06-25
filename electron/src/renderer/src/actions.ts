// Cross-store actions: anything that mutates the repo runs the git op via IPC,
// then refreshes every view (repo head/branches, graph, working status) so the
// UI reflects the new state. Keeping these here avoids store↔store imports and
// gives components one place to call. Mirrors how the Tauri build funnels
// mutations through `repo.svelte.ts` then `refreshAll()`.

import type { CommitInput, RebasePlan, ResetMode, StageSelection, TagInput } from '../../shared/types'
import * as ipc from './ipc'
import { useRepo } from './store'
import { useGraph } from './graph-store'
import { useStatus } from './status-store'
import { useOp } from './op-store'
import { useStash } from './stash-store'
import { useUi } from './ui-store'
import { errMessage } from './errors'

/** Refresh head/branches, graph, working status, op/undo state, and stashes. */
export async function refreshAll(): Promise<void> {
  await Promise.all([
    useRepo.getState().refreshHead(),
    useGraph.getState().reload(),
    useStatus.getState().refresh(),
    useOp.getState().refresh(),
    useStash.getState().refresh()
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

// ── M2: merge / rebase / cherry-pick / revert / reset ──
export const merge = (ref: string, noFf: boolean): Promise<void> =>
  mutate(() => ipc.merge(ref, noFf))
export const rebase = (onto: string): Promise<void> => mutate(() => ipc.rebase(onto))
export const cherryPick = (oids: string[]): Promise<void> => mutate(() => ipc.cherryPick(oids))
export const revert = (oid: string): Promise<void> => mutate(() => ipc.revert(oid))
export async function reset(oid: string, mode: ResetMode): Promise<void> {
  if (mode === 'hard') {
    const ok = await ipc.confirm('Reset --hard?', 'Uncommitted changes will be lost.')
    if (!ok) return
  }
  await mutate(() => ipc.reset(oid, mode))
}
export const opContinue = (): Promise<void> => mutate(() => ipc.opContinue())
export async function opAbort(): Promise<void> {
  const ok = await ipc.confirm('Abort the in-progress operation?')
  if (ok) await mutate(() => ipc.opAbort())
}
export const opSkip = (): Promise<void> => mutate(() => ipc.opSkip())

// ── M2: conflicts ──
export const resolveConflict = (path: string, content: string): Promise<void> =>
  mutate(() => ipc.resolveConflict(path, content))

// ── M2: interactive rebase ──
export const applyRebasePlan = (plan: RebasePlan): Promise<void> =>
  mutate(() => ipc.rebaseInteractive(plan))
/** Fetch a seed plan for onto..HEAD and open the rebase editor. */
export async function openInteractiveRebase(onto: string): Promise<void> {
  try {
    useUi.getState().openRebase(await ipc.rebasePlan(onto))
  } catch (e) {
    useRepo.setState({ error: errMessage(e) })
  }
}

// ── M2: drag-drop merge / rebase (checkout the target, then operate) ──
export const mergeBranchInto = (src: string, target: string): Promise<void> =>
  mutate(async () => {
    await ipc.checkoutBranch(target)
    await ipc.merge(src, false)
  })
export const rebaseBranchOnto = (branch: string, onto: string): Promise<void> =>
  mutate(async () => {
    await ipc.checkoutBranch(branch)
    await ipc.rebase(onto)
  })

// ── M2: undo / redo ──
export async function undo(): Promise<void> {
  const dirty = (useStatus.getState().status?.unstaged.length ?? 0) > 0
  if (dirty) {
    const ok = await ipc.confirm('Undo?', 'Uncommitted working changes may be discarded.')
    if (!ok) return
  }
  await mutate(() => ipc.undo())
}
export const redo = (): Promise<void> => mutate(() => ipc.redo())

// ── M2: stash ──
export const stashPush = (message: string | undefined, includeUntracked: boolean): Promise<void> =>
  mutate(() => ipc.stashPush(message, includeUntracked))
export const stashApply = (index: number, pop: boolean): Promise<void> =>
  mutate(() => ipc.stashApply(index, pop))
export async function stashDrop(index: number): Promise<void> {
  const ok = await ipc.confirm(`Drop stash@{${index}}?`)
  if (ok) await mutate(() => ipc.stashDrop(index))
}

// ── M2: tags ──
export const tagCreate = (input: TagInput): Promise<void> => mutate(() => ipc.tagCreate(input))
export async function tagDelete(name: string): Promise<void> {
  const ok = await ipc.confirm(`Delete tag "${name}"?`)
  if (ok) await mutate(() => ipc.tagDelete(name))
}
export const tagPush = (name: string | null): Promise<void> => mutate(() => ipc.tagPush(name))

// ── M2: auth ──
export const setToken = (host: string, token: string): Promise<void> =>
  mutate(() => ipc.setToken(host, token))
export const clearToken = (host: string): Promise<void> => mutate(() => ipc.clearToken(host))
