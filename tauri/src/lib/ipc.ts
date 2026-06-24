// Thin, typed wrappers around the Tauri command/event boundary. This is the
// only module that imports the ts-rs-generated bindings, so the rest of the
// frontend depends on the IPC contract through here.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { RepoInfo } from './bindings/RepoInfo';
import type { HeadInfo } from './bindings/HeadInfo';
import type { BranchInfo } from './bindings/BranchInfo';
import type { CommitPage } from './bindings/CommitPage';
import type { RefreshEvent } from './bindings/RefreshEvent';

export function openRepo(path: string): Promise<RepoInfo> {
  return invoke('open_repo', { path });
}

export function getHead(): Promise<HeadInfo> {
  return invoke('get_head');
}

export function listBranches(): Promise<BranchInfo[]> {
  return invoke('list_branches');
}

export function listCommits(start?: string, limit = 200): Promise<CommitPage> {
  return invoke('list_commits', { start, limit });
}

export function onRefresh(cb: (e: RefreshEvent) => void): Promise<UnlistenFn> {
  return listen<RefreshEvent>('repo://refresh', (ev) => cb(ev.payload));
}
