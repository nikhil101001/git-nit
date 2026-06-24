<script lang="ts">
  import { repoState } from '../repo.svelte';

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  function relTime(unixSeconds: number): string {
    const diffMs = unixSeconds * 1000 - Date.now();
    const mins = Math.round(diffMs / 60000);
    if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 30) return rtf.format(days, 'day');
    const months = Math.round(days / 30);
    if (Math.abs(months) < 12) return rtf.format(months, 'month');
    return rtf.format(Math.round(months / 12), 'year');
  }
</script>

<section class="commits">
  <h2>Commits ({repoState.commits.length})</h2>
  <ul>
    {#each repoState.commits as c (c.oid)}
      <li>
        <code class="sha">{c.shortOid}</code>
        <span class="msg" title={c.summary}>{c.summary}</span>
        <span class="author">{c.authorName}</span>
        <span class="time">{relTime(c.timeUnix)}</span>
      </li>
    {/each}
  </ul>
  {#if repoState.commits.length === 0}
    <p class="muted">No commits yet.</p>
  {/if}
</section>

<style>
  .commits {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
  }
  h2 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg-muted);
    margin: 0 0 0.5rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 4.5rem 1fr auto auto;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .sha {
    color: var(--accent);
    font-family: ui-monospace, monospace;
    font-size: 0.78rem;
  }
  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .author,
  .time {
    color: var(--fg-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .muted {
    color: var(--fg-muted);
  }
</style>
