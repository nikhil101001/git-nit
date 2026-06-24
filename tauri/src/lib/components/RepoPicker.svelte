<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';

  let { onpick }: { onpick: (path: string) => void } = $props();

  async function pick() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') onpick(selected);
  }
</script>

<button class="repo-picker" onclick={pick}>Open repo…</button>

<style>
  .repo-picker {
    padding: 0.4rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--accent);
    color: white;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .repo-picker:hover {
    filter: brightness(1.1);
  }
</style>
