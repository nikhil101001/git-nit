# git-nit

A GitKraken-style, cross-platform **Git GUI** — built twice, in two stacks, to
compare them on the same product: a lean Rust/Tauri build and a Node/Electron build.

## Repository layout

This is a monorepo. Each app is self-contained in its own directory with its own
toolchain, dependencies, and build:

| Directory | Stack | Status |
|---|---|---|
| [`tauri/`](tauri/) | **Tauri v2** (Rust + OS webview) + Svelte 5 | M0 skeleton — boots, opens a repo, lists branches/commits, FS-watch refresh |
| [`electron/`](electron/) | **Electron** (Node) + React 19 | M0 skeleton — boots, opens a repo, lists branches/commits, FS-watch refresh |

Each app documents its own setup and stack in its own `README.md` / `SPEC.md`:

- Tauri: [tauri/README.md](tauri/README.md) · [tauri/SPEC.md](tauri/SPEC.md)
- Electron: [electron/SPEC.md](electron/SPEC.md)

## Why two builds?

Same product, two implementations — to evaluate the trade-offs (bundle size, memory,
performance, developer experience, native integration) of Tauri vs. Electron on a
non-trivial, graph-heavy desktop app rather than a toy.

## Working in this repo

There is no shared root tooling yet — `cd` into the app you're working on and follow
its README. The two stacks are independent (Cargo + pnpm for Tauri; npm/pnpm for
Electron) and build separately.
