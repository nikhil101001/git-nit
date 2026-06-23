# git-nit

A GitKraken-style, cross-platform Git GUI built on a lean, memory-safe stack:
**Tauri v2 (Rust) + Svelte 5**. See [SPEC.md](SPEC.md) for the full product spec,
architecture, and roadmap.

> **Status: M0 (Skeleton).** The app boots, opens a local repository, reads HEAD,
> lists branches, shows a flat commit list, and auto-refreshes on filesystem
> changes. The color-coded commit graph, staging/diff, and push/pull land in
> later milestones (M1+).

## Stack

| Layer | Choice | Version |
|---|---|---|
| Shell | [Tauri v2](https://v2.tauri.app/) (Rust + OS webview) | 2.11 |
| Git engine | [`git2`](https://docs.rs/git2) (libgit2) behind a `GitEngine` trait | 0.21 (libgit2 1.9.4) |
| Async | `tokio` (`spawn_blocking` keeps git work off the UI thread) | 1.52 |
| Frontend | Svelte 5 (runes) + Vite, plain SPA | 5.56 / Vite 8 |
| IPC types | [`ts-rs`](https://docs.rs/ts-rs) generates TS from Rust structs | 12 |
| FS watcher | [`notify`](https://docs.rs/notify) → debounced refresh events | 8 |

Future engine layers (`gix` for hot reads, the `git` CLI sidecar for rebase/auth)
slot in behind the same `GitEngine` trait — see SPEC §3.

## Prerequisites

- **Rust** 1.96.0 (pinned via `rust-toolchain.toml`; install with [rustup](https://rustup.rs))
- **Node** ≥ 22.12 and **pnpm**
- A C toolchain (libgit2 builds from source on first compile — Xcode CLT on macOS)

## Develop

```bash
pnpm install
pnpm gen:bindings   # generate src/lib/bindings/*.ts from Rust DTOs (run after editing any DTO)
pnpm tauri dev      # build + launch the app
```

Other scripts: `pnpm check` (svelte-check), `pnpm build` (frontend), and
`pnpm tauri build` (packaged app).

> **Note:** `pnpm gen:bindings` runs `cargo test` from inside `src-tauri/` so cargo
> discovers `src-tauri/.cargo/config.toml` (which points `TS_RS_EXPORT_DIR` at
> `src/lib/bindings/`). The generated bindings are git-ignored and regenerated on
> demand / in CI.

## Project layout

```
src/                 Svelte 5 frontend (SPA)
  lib/ipc.ts         typed wrappers over invoke()/listen()
  lib/repo.svelte.ts runes store (open repo, refresh)
  lib/bindings/      ts-rs output (generated, git-ignored)
  lib/components/    RepoPicker, HeadBar, BranchList, CommitList
src-tauri/           Rust crate (Tauri backend)
  src/engine/        GitEngine trait + git2 implementation
  src/dto.rs         serde + ts-rs DTOs (the Rust↔TS contract)
  src/commands.rs    #[tauri::command] surface (async, spawn_blocking)
  src/watcher.rs     notify watcher → repo://refresh events
  capabilities/      tight Tauri v2 permission allow-list
```
