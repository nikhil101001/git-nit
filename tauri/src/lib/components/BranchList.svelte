<script lang="ts">
  import { repoState } from '../repo.svelte';

  const local = $derived(repoState.branches.filter((b) => !b.isRemote));
  const remote = $derived(repoState.branches.filter((b) => b.isRemote));
</script>

<aside class="branches">
  <h2>Branches</h2>
  <ul>
    {#each local as b (b.fullName)}
      <li class:head={b.isHead}>{b.name}</li>
    {/each}
    {#if local.length === 0}
      <li class="muted">none</li>
    {/if}
  </ul>

  {#if remote.length}
    <h2>Remotes</h2>
    <ul>
      {#each remote as b (b.fullName)}
        <li class="remote">{b.name}</li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .branches {
    width: 240px;
    flex: none;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
  }
  h2 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg-muted);
    margin: 0.75rem 0 0.35rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  li.head {
    font-weight: 700;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  li.remote {
    color: var(--fg-muted);
  }
  .muted {
    color: var(--fg-muted);
  }
</style>
