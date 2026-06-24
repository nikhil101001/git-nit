<script lang="ts">
  import { repoState } from '../repo.svelte';
</script>

<div class="headbar">
  {#if repoState.head}
    {#if repoState.head.isDetached}
      <span class="ref detached">detached @ {repoState.head.target?.slice(0, 7)}</span>
    {:else}
      <span class="ref branch">⎇ {repoState.head.branch ?? '(unknown)'}</span>
    {/if}
    {#if repoState.head.summary}
      <span class="summary">{repoState.head.summary}</span>
    {/if}
  {:else}
    <span class="ref">(no HEAD)</span>
  {/if}
  <span class="path" title={repoState.repo?.path}>{repoState.repo?.path}</span>
</div>

<style>
  .headbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .ref {
    font-weight: 600;
  }
  .branch {
    color: var(--accent);
  }
  .detached {
    color: #c0883a;
  }
  .summary {
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path {
    margin-left: auto;
    color: var(--fg-muted);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  }
</style>
