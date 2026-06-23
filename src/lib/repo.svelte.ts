// Runes-based store holding the open repository's state. Lives in a `.svelte.ts`
// module so `$state` is available outside a component.

import type { RepoInfo } from './bindings/RepoInfo';
import type { HeadInfo } from './bindings/HeadInfo';
import type { BranchInfo } from './bindings/BranchInfo';
import type { CommitSummary } from './bindings/CommitSummary';
import type { ErrorPayload } from './bindings/ErrorPayload';
import * as ipc from './ipc';

interface RepoStore {
  repo: RepoInfo | null;
  head: HeadInfo | null;
  branches: BranchInfo[];
  commits: CommitSummary[];
  loading: boolean;
  error: string | null;
}

export const repoState = $state<RepoStore>({
  repo: null,
  head: null,
  branches: [],
  commits: [],
  loading: false,
  error: null,
});

export async function openRepo(path: string): Promise<void> {
  repoState.loading = true;
  repoState.error = null;
  try {
    repoState.repo = await ipc.openRepo(path);
    await refreshAll();
  } catch (e) {
    repoState.error = errMessage(e);
  } finally {
    repoState.loading = false;
  }
}

export async function refreshAll(): Promise<void> {
  if (!repoState.repo) return;
  try {
    const [head, branches, page] = await Promise.all([
      ipc.getHead(),
      ipc.listBranches(),
      ipc.listCommits(undefined, 200),
    ]);
    repoState.head = head;
    repoState.branches = branches;
    repoState.commits = page.commits;
    repoState.error = null;
  } catch (e) {
    repoState.error = errMessage(e);
  }
}

// Command rejections arrive as the serialized ErrorPayload { kind, message }.
function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as ErrorPayload).message);
  }
  return String(e);
}
