# git-nit

A GitKraken-style, cross-platform **Git GUI** built on Electron + React. See
[SPEC.md](SPEC.md) for the full product spec.

**Status:** M2 — daily driver. Boots, opens a repo, reads HEAD, lists branches and a
laned commit graph, stages/commits (hunk- and line-level), fetch/pull/push with
per-host auth, merge / rebase / interactive rebase / cherry-pick / revert / reset,
a 3-way Monaco conflict editor, stash, tags, and undo/redo — auto-refreshing on
filesystem changes. M3 (GitHub integration, blame, GitFlow, AI commit messages) is
planned.

## Stack

| Layer | Choice |
|---|---|
| Shell | **Electron 42** (Chromium + Node main process) |
| Build | **electron-vite 5** (Vite 7) — separate main / preload / renderer builds |
| Renderer | **React 19** + **TypeScript 6**, **Zustand** stores |
| Editor | **Monaco** (core editor API only) for the 3-way conflict view |
| Git engine | **git CLI** behind a small `GitEngine` interface |
| Watcher | native recursive **`fs.watch`** → debounced `repo://refresh` events |

### A note on the Git engine

The originally-specced engine is **NodeGit (libgit2)**, but its stable release is
fragile to build against the latest Electron ABI (SPEC §3.5 / §5). To keep the app
booting on the latest stable Electron with zero native compilation, it ships a
**git-CLI engine** behind the `GitEngine` interface
([src/main/engine/](src/main/engine/)). NodeGit can slot in later as a
`NodeGitEngine` behind the same interface — no UI/IPC changes — once prebuilt
binaries are wired in CI. This is the swappable-engine escape hatch the spec calls
for; the trigger is a graph-perf spike on very large repos.

### Why `fs.watch` and not chokidar

A single native recursive `fs.watch(root, { recursive: true })` uses one OS-level
handle (FSEvents on macOS, ReadDirectoryChangesW on Windows), so it is EMFILE-proof
regardless of tree size — unlike a per-directory watcher, which exhausts file
descriptors on large trees.

## Architecture

```
src/
  shared/types.ts      DTOs + GitApi interface shared across all three processes
  main/                Node main process (repo state + secrets owner)
    index.ts           app lifecycle + BrowserWindow (contextIsolation on)
    ipc.ts             ipcMain handlers, IpcResult envelope wrapping
    engine/            GitEngine interface + CliEngine (git CLI), graph + diff helpers
    sync.ts auth.ts undo.ts watcher.ts state.ts errors.ts
  preload/index.ts     contextBridge: the only surface the renderer can touch
  renderer/            React app (Vite)
    src/*-store.ts     Zustand stores (repo, graph, status, op, stash, ui)
    src/actions.ts     cross-store mutations → refreshAll
    src/ipc.ts         typed wrappers over window.api
    src/components/    RepoPicker · graph · staging · conflict editor · rebase/stash/tag UI
```

IPC is request/response via `ipcRenderer.invoke` returning an `IpcResult<T>` envelope
(handlers never throw across the boundary), plus a `repo://refresh` event for the
watcher. `contextIsolation: true`, `nodeIntegration: false`, a single frozen
`window.api`; tokens are encrypted with Electron `safeStorage` and never cross the
contextBridge.

## Develop

Requires Node 22+, [pnpm](https://pnpm.io), and `git` on `PATH`.

```sh
pnpm install
pnpm dev          # launch the app with HMR
pnpm typecheck    # tsc, main + renderer projects
pnpm build        # production build into out/
```
