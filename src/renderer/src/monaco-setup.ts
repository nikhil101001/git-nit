// Monaco wiring for an offline Electron renderer (M2 plan §2):
//  - point @monaco-editor/react's loader at the BUNDLED monaco (not its default
//    CDN), so it works under file:// in a packaged app;
//  - provide the editor web worker via Vite's `?worker` import (a plain text
//    merge view needs only the core editor worker — no language services).
// Imported once from main.tsx before any editor mounts.

// Import the core editor API only — NOT `monaco-editor`, which bundles every
// language grammar (~8 MB). A plain-text 3-way merge view needs none of them.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

;(globalThis as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

loader.config({ monaco })
