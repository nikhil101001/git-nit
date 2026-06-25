// Preload: the entire trust boundary the renderer is allowed to touch. With
// contextIsolation on, this runs in an isolated world and exposes exactly one
// frozen object (`window.api`) via the contextBridge — the renderer never sees
// ipcRenderer or any Node API directly.
//
// Each call unwraps the main-process `IpcResult` envelope: resolve on `ok`,
// reject with the plain `{ kind, message }` payload on failure. That mirrors how
// the Tauri build's `invoke` rejects, so the renderer's error handling is
// identical across both stacks.

import { contextBridge, ipcRenderer } from 'electron'
import type {
  BranchInfo,
  CommitPage,
  GitApi,
  HeadInfo,
  IpcResult,
  RefreshEvent,
  RepoInfo
} from '../shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (res.ok) return res.value
  throw res.error // plain ErrorPayload: { kind, message }
}

const api: GitApi = {
  openRepo: (path) => invoke<RepoInfo>('repo:open', path),
  getHead: () => invoke<HeadInfo>('repo:head'),
  listBranches: () => invoke<BranchInfo[]>('repo:branches'),
  listCommits: (start, limit) => invoke<CommitPage>('repo:commits', start, limit),
  pickDirectory: () => invoke<string | null>('dialog:pickDirectory'),
  onRefresh: (cb: (e: RefreshEvent) => void) => {
    const listener = (_e: unknown, payload: RefreshEvent): void => cb(payload)
    ipcRenderer.on('repo://refresh', listener)
    return () => {
      ipcRenderer.removeListener('repo://refresh', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
