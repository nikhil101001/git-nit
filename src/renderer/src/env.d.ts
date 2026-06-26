/// <reference types="vite/client" />

// The lean Monaco entrypoint (core editor, no language grammars) ships JS but no
// types under its deep path; borrow the full package's types — Vite still bundles
// the lean path at runtime.
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor'
}
