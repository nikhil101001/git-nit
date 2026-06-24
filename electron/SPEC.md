# git-nit — A GitKraken-style Git GUI

**Status:** Draft spec v0.2
**Goal:** A cross-platform desktop application that wraps the full power of Git in an
approachable, visual UI — a faithful clone of GitKraken Desktop's feature set, built
on an open, hackable stack.

**Decisions locked (v0.2):**
- **Stack:** Electron + NodeGit (libgit2) — same foundation GitKraken uses.
- **v1 scope:** Milestones M0 → **M2** (full daily-driver, not just MVP).
- **Hosting integration in v1:** **GitHub only** (PRs, issues, OAuth).

---

## 1. Product vision

Git is powerful but its CLI is unforgiving. GitKraken's core insight is that a
**color-coded commit graph** plus **direct manipulation** (drag-a-branch-onto-another
to merge, click-to-stage, undo anything) removes most of the fear from day-to-day Git.
`git-nit` reproduces that experience as an open project.

Design principles:

1. **The graph is the home screen.** Everything radiates from a live, scrollable,
   color-coded commit graph.
2. **Direct manipulation over commands.** Drag, drop, right-click — not memorized flags.
3. **Undo is sacred.** Every destructive action is reversible or clearly warned.
4. **Never block the UI.** All Git work happens off the render thread.
5. **Safe by default.** Confirm before force-push, history rewrites, or discarding work.

---

## 2. Feature catalog (parity targets)

Grouped by priority. **P0 = MVP**, **P1 = full daily-driver**, **P2 = power/differentiator**.

### 2.1 Repository management (P0)
- Open a local repo; clone from URL; init a new repo.
- Recent repos list, favorites, and tabs/workspaces for multiple open repos.
- Detect repo state (merging, rebasing, cherry-picking, bisecting) and show banners.
- File-system watcher to auto-refresh on external changes (CLI use, editor saves).

### 2.2 Commit graph (P0 — the centerpiece)
- Color-coded DAG of commits across all branches/refs.
- Lanes for parallel branches; merge/branch lines drawn correctly.
- Rows show: avatar, author, message, short SHA, relative time, ref badges
  (local branch, remote branch, tag, HEAD).
- Virtualized rendering — smooth on repos with 100k+ commits.
- Click a commit → detail panel (diff, parents, full message, author/committer).
- Search/filter by message, author, SHA, branch, file.
- Show/hide remote branches; "current branch only" toggle.

### 2.3 Staging & committing (P0)
- Working-directory view: unstaged vs staged, with file status (M/A/D/R/?).
- Stage/unstage by file, by hunk, and by individual line.
- Inline diff viewer (split & unified) with syntax highlighting.
- Commit message editor: subject/body, amend last commit, commit signing (GPG/SSH).
- Discard changes (file / hunk / all) with confirmation.
- `.gitignore` helpers (right-click → ignore file/extension/folder).

### 2.4 Branching & merging (P0/P1)
- Create/checkout/rename/delete branches.
- **Drag-and-drop merge & rebase**: drag branch A onto B → context menu Merge/Rebase.
- Fast-forward vs merge-commit options; merge conflict detection.
- **Built-in 3-way merge conflict editor** (ours / theirs / result panes). *(P1)*
- Cherry-pick (single & multi-commit), revert, reset (soft/mixed/hard).

### 2.5 Remotes & syncing (P0/P1)
- Add/edit/remove remotes; fetch (all/prune), pull, push, force-push (with-lease).
- Track/untrack upstream; show ahead/behind counts per branch.
- Auth: HTTPS tokens, SSH keys, OS credential helper, OAuth for GitHub/GitLab. *(P1)*

### 2.6 History rewriting (P1)
- **Interactive rebase UI**: drag to reorder, and per-commit Pick / Reword / Edit /
  Squash / Fixup / Drop — mirroring GitKraken's panel.
- Squash/amend from the graph.
- **Undo / redo stack** for rebase, cherry-pick, drop, reword, reset, checkout.

### 2.7 Stash, tags, worktrees (P1)
- Stash create/apply/pop/drop, view stash contents, stash named.
- Lightweight & annotated tags; push tags.
- Worktree create/list/remove.
- Submodule view & update. *(P2)*

### 2.8 GitFlow & workflows (P1)
- One-click GitFlow (init, start/finish feature/release/hotfix).
- Branch naming templates / policies.

### 2.9 Integrations & extras (P2 — differentiators)
- Hosting providers: GitHub/GitLap/Bitbucket — list PRs/MRs & issues, create PR from branch.
- Blame / file history view; line-level "who changed this."
- Diff against any two refs; per-file history.
- AI commit-message generation (pluggable; see §6).
- Theming (light/dark/custom), keyboard shortcuts, command palette.
- Bisect assistant. *(P2)*
- LFS support. *(P2)*

---

## 3. Technical approach

### 3.1 The core decision: which Git engine?

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **`git2-rs` (libgit2 in Rust)** | Rust bindings to libgit2 (the same C lib that powers GitKraken) | Native speed, complete API, memory-safe wrapper, no Node native-module pain | Rust learning curve |
| **NodeGit (libgit2 in Node)** | What GitKraken actually uses | Same libgit2 power, JS-native | Known memory leaks & fragile Electron/native-build integration |
| **isomorphic-git** | Pure-JS Git | Trivial to bundle, works in browser, no native deps | Slower on huge repos; incomplete (no full interactive rebase, partial features) |
| **Shell out to `git`** | Spawn the system `git` binary, parse output | Always 100% compatible; trivial | Parsing porcelain is brittle; requires git installed; slower for graph queries |

**Decision (locked): Electron + NodeGit (libgit2).** This is the exact foundation
GitKraken ships on, giving us the full libgit2 API in JavaScript and the closest
possible feature parity. We accept NodeGit's two known costs — fragile native-module
builds and memory leaks — and mitigate them explicitly (see §3.5). A thin
**"shell out to `git`"** fallback handles operations libgit2 drives awkwardly
(interactive-rebase orchestration, some push/credential flows).

> Trade-off accepted: ~150MB Electron bundle vs Tauri's ~10MB, in exchange for a
> single-language (JS/TS) codebase and maximum libgit2 fidelity.

### 3.2 Proposed stack

- **Shell:** [Electron](https://www.electronjs.org/) (Chromium + Node main process).
- **Git engine:** [NodeGit](https://www.nodegit.org/) (libgit2 bindings) in the main /
  a worker process + selective `git` CLI subprocess for interactive rebase & auth.
- **Frontend:** TypeScript + React + Vite (renderer process).
- **Graph rendering:** custom **Canvas/WebGL** renderer with **row virtualization**
  (DOM virtualization can't keep up with 100k-row graphs).
- **Diff/merge editor:** [Monaco](https://microsoft.github.io/monaco-editor/) (gives
  syntax highlight + built-in diff + 3-way merge view for free).
- **State:** Zustand/Redux in the renderer; the **main process owns repo state** as the
  source of truth.
- **IPC:** Electron `ipcMain`/`ipcRenderer` (contextBridge, `contextIsolation: true`,
  `nodeIntegration: false`) — async request/response + events for progress streaming.
- **Watcher:** [`chokidar`](https://github.com/paulmillr/chokidar) → debounced refresh events.

### 3.3 Architecture

```
┌───────────────── Renderer process (TS/React) ──────────────────────┐
│  Graph Canvas │ Commit Detail │ Staging/Diff │ Rebase UI │ Palette  │
│         (virtualized)   (Monaco)    (Monaco)                        │
└───────────────▲───────────────────────────────────▲────────────────┘
                │  ipc invoke (req/resp)             │ ipc events (progress)
        contextBridge — contextIsolation:true, nodeIntegration:false
┌───────────────┴────────────────────────────────────┴────────────────┐
│                    Main process (Node) — repo state                  │
│  Repo manager · Graph builder · Diff/stage svc · Branch/merge svc     │
│  Remote/auth svc · Rebase orchestrator · Undo stack · FS watcher      │
│        NodeGit (libgit2)  +  git CLI subprocess (fallback)            │
│        heavy Git ops offloaded to a worker process (see §3.5)         │
└───────────────────────────────────────────────────────────────────────┘
```

Key backend services (Node main / worker process):
- **Graph builder** — walk refs with NodeGit's `Revwalk`, assign lanes/colors, emit
  paginated row windows to the renderer (compute lanes in Node, draw in JS).
- **Undo stack** — record an inverse op (or pre-op ref snapshot via reflog/`ORIG_HEAD`)
  for each mutating action so any action is reversible.
- **Rebase orchestrator** — drive `git rebase -i` via a sequence editor the app
  controls (set `GIT_SEQUENCE_EDITOR` to a callback), reporting per-step progress.
- **Auth service** — bridge NodeGit credential callbacks to SSH agent / OS keychain /
  stored tokens; GitHub OAuth handled in the main process, secrets in OS secure storage
  (`keytar` / Electron `safeStorage`).

### 3.4 Why the graph is the hard part

Performance is the make-or-break. Plan for it explicitly:
- Build the DAG and lane assignment incrementally and in a background thread.
- Stream commits in windows (e.g. 500 rows) as the user scrolls.
- Cache computed graph topology; invalidate only affected refs on change.
- Render on Canvas/WebGL, recycle row objects, never mount 100k DOM nodes.

### 3.5 Living with NodeGit (the cost of this choice)

NodeGit is powerful but has two well-documented pain points; both are manageable:

- **Memory leaks** — NodeGit objects (commits, trees, blobs) wrap native libgit2
  handles and aren't always GC'd cleanly. Mitigations:
  - Run heavy/long-lived Git work in a **dedicated worker (`utilityProcess`)** that can
    be recycled, isolating leaks from the main process.
  - Free objects explicitly where the API allows; avoid retaining NodeGit objects in
    long-lived caches — cache plain serializable data (SHAs, strings), not handles.
  - Watch RSS in the worker; recycle the process past a threshold.
- **Fragile native builds** — NodeGit ships prebuilt binaries but can require source
  compilation on some platforms/Electron-ABI combos. Mitigations:
  - Pin Electron + NodeGit versions; use `electron-rebuild` in CI.
  - Build and cache platform binaries in CI (mac arm64/x64, Windows, Linux) so end
    users never compile.
- **Escape hatch** — keep the Git engine behind a small interface so individual
  operations can fall back to the `git` CLI, and so the whole engine could be swapped
  (e.g. to isomorphic-git or a native sidecar) without touching UI code.

---

## 4. Milestones / roadmap

**M0 — Skeleton (1–2 wks):** Tauri app boots, open repo, list branches, read HEAD,
plain commit list (no graph yet), file-watcher refresh.

**M1 — MVP (P0):** Color-coded virtualized graph; staging by file/hunk/line; diff
viewer; commit/amend; create/checkout/delete branch; fetch/pull/push; discard. *Daily
usable for simple flows.*

**M2 — Daily driver (P1) ◄ v1 release target:** Drag-drop merge/rebase; 3-way conflict
editor; interactive rebase UI; undo/redo stack; stash; tags; remotes & auth (token/SSH);
ahead-behind. **v1 ships here.**

**M3 — Power & polish (P2, post-v1):** GitFlow, **GitHub integration** (PR list/create,
issues, OAuth), blame & file history, worktrees/submodules, command palette, theming,
AI commit messages. *(GitLab/Bitbucket deferred until the GitHub provider abstraction is
proven.)*

**M4 — Hardening:** Huge-repo perf passes, conflict edge cases, signing, cross-platform
packaging & auto-update, accessibility, error telemetry (opt-in).

---

## 5. Major risks

- **NodeGit memory leaks & native builds** → isolate Git work in a recyclable worker
  process; pin versions + prebuild binaries in CI (see §3.5). *Highest-attention risk
  given the engine choice.*
- **Graph performance at scale** → budget a real spike on a 100k-commit repo in M1.
- **Auth matrix** (SSH agents, 2FA, OAuth, credential helpers across 3 OSes) is deep →
  lean on the system `git` credential helper rather than reinventing it.
- **Interactive rebase correctness** → drive the real `git` binary instead of
  re-implementing the sequencer in libgit2.
- **Merge conflict UX** is where most GUIs are weak → invest early, reuse Monaco's merge view.
- **Electron security** → contextIsolation on, nodeIntegration off, validate all IPC
  inputs, restrict renderer to the contextBridge API surface.
- **GitKraken trademark/branding** → ship original name, icons, and copy; don't clone assets.

---

## 6. Resolved decisions & remaining questions

**Resolved (v0.2):**
- Stack — **Electron + NodeGit (libgit2)**, React renderer.
- v1 scope — **through M2** (full daily-driver).
- Hosting integration — **GitHub only** for v1 (lands in M3, post-v1 release).

**Still open:**
1. **AI commit messages** — in scope post-v1? If so, which provider/model, and must it
   be optional / offline-friendly?
2. **Commit signing** — GPG, SSH-signing, or both required for v1?
3. **Auto-update** — self-host the update feed, or use a service (e.g. `electron-updater`
   with GitHub Releases)?

---

## Sources / research

- [Best Git GUI Clients in 2025 — GitKraken, SourceTree, Fork compared (DEV)](https://dev.to/_d7eb1c1703182e3ce1782/best-git-gui-clients-in-2025-gitkraken-sourcetree-fork-and-more-compared-4gjd)
- [GitKraken Desktop — Interactive Rebase](https://help.gitkraken.com/gitkraken-desktop/interactive-rebase/)
- [GitKraken Desktop — Branch, Merge, Rebase](https://help.gitkraken.com/gitkraken-desktop/branching-and-merging/)
- [GitKraken Desktop — Interface layout](https://help.gitkraken.com/gitkraken-desktop/interface/)
- [How NodeGit and libgit2 Power GitKraken](https://www.gitkraken.com/blog/nodegit-libgit2)
- [simple-git vs isomorphic-git vs nodegit](https://npm-compare.com/isomorphic-git,nodegit,simple-git)
- [Integrated NodeGit and isomorphic-git — engine trade-offs (GitDocumentDB)](https://gitddb.com/blog/git-engines/)
- [libgit2](https://github.com/libgit2/libgit2)
