import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Plain Svelte 5 SPA (no SvelteKit) — only the TS preprocessor.
export default {
  preprocess: vitePreprocess(),
};
