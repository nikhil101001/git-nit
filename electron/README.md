# git-nit — Electron build

The Node/Electron implementation of git-nit. See [SPEC.md](SPEC.md) for the full
product spec, and the [root README](../README.md) for why this lives alongside a
parallel Tauri build.

**Status:** M0 skeleton — boots, opens a repo, reads HEAD, lists branches and a
plain commit list, and auto-refreshes on filesystem changes. Feature-parity with
the Tauri build's M0.

## Stack

| Layer | Choice |
|---|---|
| Shell | **Electron 42** (Chromium + Node main process) |
| Build | **electron-vite 5** (Vite 8) — separate main / preload / renderer builds |
| Renderer | **React 19** + **TypeScript 6**, **Zustand** store |
| Git engine | **git CLI** (M0) behind a small `GitEngine` interface |
| Watcher | **chokidar 5** → debounced `repo://refresh` events |

### A note on the Git engine

The locked engine for git-nit is **NodeGit (libgit2)** — but NodeGit's stable
release is fragile to build against the latest Electron ABI (SPEC §3.5 / §5 flags
this as the top risk). To keep M0 booting on the latest stable Electron with zero
native compilation, M0 ships a **git-CLI engine** behind the `GitEngine`
interface ([src/main/engine/](src/main/engine/)). NodeGit slots in later as
`NodeGitEngine` behind the same interface — no UI/IPC changes — once prebuilt
binaries are wired in CI. This is exactly the swappable-engine escape hatch the
spec calls for.

## Architecture

```
src/
  shared/types.ts      DTOs shared by all three processes (mirrors Tauri dto.rs)
  main/                Node main process (repo state owner)
    index.ts           app lifecycle + BrowserWindow (contextIsolation on)
    ipc.ts             ipcMain handlers, result-envelope wrapping
    engine/            GitEngine interface + CliEngine (git CLI)
    watcher.ts         chokidar → debounced repo://refresh
    state.ts errors.ts
  preload/index.ts     contextBridge: the only surface the renderer can touch
  renderer/            React app (Vite)
    src/store.ts       Zustand repo store
    src/ipc.ts         typed wrappers over window.api
    src/components/    RepoPicker · HeadBar · BranchList · CommitList
```

IPC is request/response via `ipcRenderer.invoke` plus a `repo://refresh` event
for the watcher. Handlers return a typed result envelope so structured error
kinds survive to the renderer (`contextIsolation: true`, `nodeIntegration:
false`).

## Develop

Requires Node 22+, a package manager (pnpm recommended, matching the Tauri app),
and `git` on `PATH`.

```sh
pnpm install
pnpm dev          # launch the app with HMR
pnpm typecheck    # tsc, main + renderer projects
pnpm build        # production build into out/
```
