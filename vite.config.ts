import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  // Tauri expects a fixed dev port and does not want Vite to clear the screen.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 5174 }
      : undefined,
    watch: {
      // Don't reload the frontend when Rust artifacts churn.
      ignored: ['**/src-tauri/**'],
    },
  },

  // Only expose env vars Tauri injects (keep the rest out of the bundle).
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
