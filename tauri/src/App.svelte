<script lang="ts">
  import { onMount } from 'svelte';
  import { repoState, openRepo, refreshAll } from './lib/repo.svelte';
  import { onRefresh } from './lib/ipc';
  import RepoPicker from './lib/components/RepoPicker.svelte';
  import HeadBar from './lib/components/HeadBar.svelte';
  import BranchList from './lib/components/BranchList.svelte';
  import CommitList from './lib/components/CommitList.svelte';

  // Re-fetch whenever the backend reports a filesystem change.
  onMount(() => {
    const unlisten = onRefresh(() => refreshAll());
    return () => {
      void unlisten.then((fn) => fn());
    };
  });
</script>

<main class="app">
  <header class="topbar">
    <h1>git-nit</h1>
    <RepoPicker onpick={openRepo} />
  </header>

  {#if repoState.error}
    <div class="banner error">{repoState.error}</div>
  {/if}

  {#if repoState.repo}
    <HeadBar />
    <div class="panes">
      <BranchList />
      <CommitList />
    </div>
  {:else}
    <div class="empty">
      {repoState.loading ? 'Opening…' : 'Open a Git repository to get started.'}
    </div>
  {/if}
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 1rem;
    margin: 0;
    font-weight: 700;
  }
  .panes {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .banner.error {
    padding: 0.5rem 0.75rem;
    background: #5b1d1d;
    color: #ffd7d7;
    font-size: 0.85rem;
  }
  .empty {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--fg-muted);
  }
</style>
