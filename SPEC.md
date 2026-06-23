# git-nit — A GitKraken-style Git GUI (Tauri / Rust)

**Status:** Draft spec v0.3
**Goal:** A cross-platform desktop application that wraps the full power of Git in an
approachable, visual UI — a faithful clone of GitKraken Desktop's feature set, built
on an open, hackable, **Rust + Tauri** stack.

**Decisions locked (v0.3):**
- **Stack:** **Tauri v2** (Rust backend + system-webview frontend). No Electron, no Node
  in the backend.
- **Git engine:** **`git2` (libgit2 Rust bindings)** as the primary engine, **`gix`
  (gitoxide)** for hot read paths (graph walk, blame, status), and the **`git` CLI
  (bundled as a Tauri sidecar)** for interactive rebase orchestration and auth/push/pull.
- **v1 scope:** Milestones M0 → **M2** (full daily-driver, not just MVP).
- **Hosting integration in v1:** **GitHub only** (PRs, issues, OAuth).

> Why this changed from v0.2: the project is Tauri-first (`git-nit-rust`). The closest
> real-world blueprint is **GitButler** — a shipping Tauri + Rust + Svelte Git client
> that uses `gix` for reads and forks out to `git` for push/pull. We follow that proven
> pattern rather than GitKraken's Electron + NodeGit one.

---

## 1. Product vision

Git is powerful but its CLI is unforgiving. GitKraken's core insight is that a
**color-coded commit graph** plus **direct manipulation** (drag-a-branch-onto-another
to merge, click-to-stage, undo anything) removes most of the fear from day-to-day Git.
`git-nit` reproduces that experience as an open project — but on a lean native stack
(~10 MB Tauri bundle vs ~150 MB Electron) with a memory-safe Rust core.

Design principles:

1. **The graph is the home screen.** Everything radiates from a live, scrollable,
   color-coded commit graph.
2. **Direct manipulation over commands.** Drag, drop, right-click — not memorized flags.
3. **Undo is sacred.** Every destructive action is reversible or clearly warned.
4. **Never block the UI.** All Git work happens off the UI thread, in async Rust tasks.
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
- Hosting providers: GitHub/GitLab/Bitbucket — list PRs/MRs & issues, create PR from branch.
- Blame / file history view; line-level "who changed this."
- Diff against any two refs; per-file history.
- AI commit-message generation (pluggable; see §6).
- Theming (light/dark/custom), keyboard shortcuts, command palette.
- Bisect assistant. *(P2)*
- LFS support. *(P2)*

---

## 3. Technical approach

### 3.1 The core decision: which Git engine?

Because the backend is Rust, the choice is between Rust Git libraries (and/or the `git`
CLI), not Node ones.

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **`git2` (libgit2)** | Rust bindings to libgit2 (the same C lib GitKraken uses via NodeGit) | Most complete Git API available in Rust today; mature; battle-tested; covers diff/stage/merge/rebase-sequencer/remotes | C dependency (libgit2 builds via `libgit2-sys`); blocking/synchronous API; rebase API is low-level |
| **`gix` (gitoxide)** | Pure-Rust Git implementation | Very fast reads (2–10× libgit2 on graph walk/status/blame); pure Rust, no C; used by cargo, Helix, GitButler | **Push, full merge, rebase, hooks still in development** — can't be the only engine yet |
| **Shell out to `git`** | Spawn the system/bundled `git` binary, parse output | Always 100% compatible; trivially supports interactive rebase, all auth/credential helpers, hooks | Parsing porcelain is brittle; per-call process spawn cost; needs git present (we bundle it) |

**Decision (locked): a layered engine.**
- **`git2` is the primary engine** for mutations and most reads (stage/unstage by
  hunk/line, commit, branch, merge, cherry-pick, revert, reset, stash, tags, diff).
- **`gix` accelerates the hot read paths** where it's strongest and where graph
  performance is make-or-break: revwalk/topology for the graph, `status`, `blame`,
  object reads. Treated as a perf optimization layer, not a hard dependency — every
  `gix` path has a `git2` equivalent behind the same interface.
- **The `git` CLI (bundled sidecar) handles what libraries do awkwardly:** interactive
  rebase orchestration (`GIT_SEQUENCE_EDITOR`), push/pull with the full credential-helper
  matrix, signing handoff, and hooks. This mirrors GitButler, which forks out to `git`
  for push/pull precisely because the pure-Rust path isn't there yet.

> Trade-off accepted: a C dependency (libgit2 via `libgit2-sys`) and a bundled `git`
> binary, in exchange for the most complete + fastest Rust Git stack and a ~10 MB app.

### 3.2 Proposed stack

- **Shell:** [Tauri v2](https://v2.tauri.app/) — Rust core + the OS's native webview
  (WebView2 on Windows, WebKit on macOS/Linux).
- **Git engine:** [`git2`](https://docs.rs/git2) (primary) + [`gix`](https://docs.rs/gix)
  (hot reads) + bundled **`git` CLI** as a [Tauri sidecar](https://v2.tauri.app/develop/sidecar/)
  for rebase orchestration and auth.
- **Backend runtime:** `tokio` async runtime; heavy/blocking Git work runs on
  `spawn_blocking` / a dedicated thread pool so Tauri commands never block the UI.
- **Frontend:** TypeScript + a reactive framework — **Svelte (recommended; matches
  GitButler and is light) or React**, built with Vite.
- **IPC / types:** Tauri `#[tauri::command]` (async request/response) + Tauri events for
  progress streaming. **`ts-rs`** generates TypeScript interfaces from the Rust structs
  used at the IPC boundary, so the type contract can't drift (GitButler's approach).
- **Graph rendering:** custom **Canvas/WebGL** renderer with **row virtualization** (DOM
  virtualization can't keep up with 100k-row graphs); lane/topology computed in Rust,
  drawn in JS.
- **Diff/merge editor:** [Monaco](https://microsoft.github.io/monaco-editor/) — syntax
  highlighting + built-in diff + 3-way merge view. (CodeMirror 6 is a lighter alternative.)
- **State:** Svelte stores / Zustand in the frontend; **the Rust core owns repo state**
  as the source of truth.
- **Watcher:** [`notify`](https://docs.rs/notify) crate (cross-platform FS events) →
  debounced refresh events emitted to the frontend.
- **Secrets:** OS keychain via [`keyring`](https://docs.rs/keyring) for tokens/credentials.

### 3.3 Architecture

```
┌───────────────── Webview (TS + Svelte/React) ──────────────────────┐
│  Graph Canvas │ Commit Detail │ Staging/Diff │ Rebase UI │ Palette  │
│       (virtualized)    (Monaco)     (Monaco)                        │
└───────────────▲───────────────────────────────────▲────────────────┘
                │  invoke() command (req/resp)        │ Tauri events (progress)
       Tauri IPC boundary — ts-rs generated types, validated inputs
┌───────────────┴────────────────────────────────────┴────────────────┐
│                    Rust core (Tauri) — owns repo state               │
│  Repo manager · Graph builder · Diff/stage svc · Branch/merge svc     │
│  Remote/auth svc · Rebase orchestrator · Undo stack · FS watcher      │
│  Engine trait ──► git2 (primary) · gix (hot reads) · git CLI sidecar  │
│         heavy ops on tokio spawn_blocking / dedicated pool            │
└───────────────────────────────────────────────────────────────────────┘
```

Key backend services (Rust):
- **Engine trait** — a `GitEngine` interface so each operation can resolve to `git2`,
  `gix`, or the `git` CLI without the UI knowing or caring; makes the perf/fallback
  choices swappable and testable.
- **Graph builder** — walk refs with `gix`'s fast revwalk (fallback `git2::Revwalk`),
  assign lanes/colors, emit paginated row windows to the frontend (compute lanes in
  Rust, draw in JS).
- **Undo stack** — record an inverse op (or a pre-op ref snapshot via reflog/`ORIG_HEAD`)
  for each mutating action so any action is reversible.
- **Rebase orchestrator** — for interactive rebase, drive the bundled `git rebase -i`
  with `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR` pointed at a callback the app controls,
  reporting per-step progress; use `git2`'s `Rebase` sequencer for non-interactive
  rebases where it's clean.
- **Auth service** — bridge `git2` credential callbacks to SSH agent / OS keychain /
  stored tokens for in-process ops; defer to the `git` CLI's credential helpers for
  push/pull. GitHub OAuth in the Rust core, secrets in the OS keychain via `keyring`.

### 3.4 Why the graph is the hard part

Performance is the make-or-break. Plan for it explicitly:
- Build the DAG and lane assignment incrementally on a background thread (this is exactly
  where `gix`'s speed earns its place).
- Stream commits in windows (e.g. 500 rows) as the user scrolls.
- Cache computed graph topology; invalidate only affected refs on change.
- Render on Canvas/WebGL, recycle row objects, never mount 100k DOM nodes.

### 3.5 Living with the Rust stack (the cost of this choice)

The Rust path avoids NodeGit's memory leaks and native-rebuild pain entirely, but has its
own considerations:

- **`gix` feature gaps** — push, full merge workflows, and rebase are still maturing in
  gitoxide. Mitigation: `gix` is used **only** for reads behind the `GitEngine` trait;
  all mutations go through `git2` or the `git` CLI. No feature depends solely on `gix`.
- **Blocking APIs vs a responsive UI** — `git2` is synchronous and libgit2 can block on
  large repos. Mitigation: every Git call runs on `tokio::task::spawn_blocking` or a
  dedicated worker pool; Tauri commands are `async` and stream progress via events.
- **C dependency (libgit2)** — `libgit2-sys` compiles libgit2. Mitigation: vendor/pin it,
  build in CI for mac arm64/x64, Windows, Linux so end users never compile; this is far
  more reliable than NodeGit's Electron-ABI rebuilds.
- **Bundling `git`** — interactive rebase + the credential-helper matrix lean on a real
  `git`. Mitigation: ship `git` as a Tauri `externalBin` **sidecar** (target-triple
  suffixed binaries), with a fallback to a detected system `git`. Note: macOS sidecars
  need correct codesigning/notarization — budget for it.
- **Webview inconsistency** — unlike Electron's bundled Chromium, Tauri uses the OS
  webview (WebKit on macOS/Linux, WebView2 on Windows), so rendering/JS-API differences
  exist across platforms. Mitigation: test the graph canvas + Monaco on all three early;
  keep the frontend to well-supported web APIs.
- **Type-safe IPC** — Rust↔TS drift is a real risk. Mitigation: `ts-rs` generates TS
  types from Rust structs in CI; validate all command inputs in Rust.

---

## 4. Milestones / roadmap

**M0 — Skeleton (1–2 wks):** Tauri v2 app boots; open repo; list branches; read HEAD;
plain commit list (no graph yet); `notify` file-watcher refresh; `GitEngine` trait +
`git2` wiring; `ts-rs` type generation in the build.

**M1 — MVP (P0):** Color-coded virtualized graph (gix revwalk + Canvas/WebGL); staging by
file/hunk/line; diff viewer (Monaco); commit/amend; create/checkout/delete branch;
fetch/pull/push (via git CLI sidecar); discard. *Daily usable for simple flows.*

**M2 — Daily driver (P1) ◄ v1 release target:** Drag-drop merge/rebase; 3-way conflict
editor; interactive rebase UI (git CLI orchestrator); undo/redo stack; stash; tags;
remotes & auth (token/SSH/keychain); ahead-behind. **v1 ships here.**

**M3 — Power & polish (P2, post-v1):** GitFlow; **GitHub integration** (PR list/create,
issues, OAuth); blame & file history (gix blame); worktrees/submodules; command palette;
theming; AI commit messages. *(GitLab/Bitbucket deferred until the GitHub provider
abstraction is proven.)*

**M4 — Hardening:** Huge-repo perf passes; conflict edge cases; signing; cross-platform
packaging, sidecar codesigning/notarization & auto-update; accessibility; opt-in error
telemetry.

---

## 5. Major risks

- **Graph performance at scale** → budget a real spike on a 100k-commit repo in M1;
  this is the make-or-break, and the main reason `gix` is in the stack.
- **`gix` maturity for writes** → never let a feature depend solely on `gix`; keep `git2`
  + `git` CLI behind the same `GitEngine` trait. *Highest-attention engine risk.*
- **Interactive rebase correctness** → drive the real `git` binary's sequencer rather than
  re-implementing it on libgit2's low-level `Rebase` API.
- **Auth matrix** (SSH agents, 2FA, OAuth, credential helpers across 3 OSes) is deep →
  lean on the bundled `git`'s credential helpers rather than reinventing them.
- **Merge conflict UX** is where most GUIs are weak → invest early, reuse Monaco's merge view.
- **Tauri sidecar packaging** (target-triple binaries, macOS codesigning/notarization of
  the bundled `git`) → prove the packaging pipeline in CI before M2.
- **Webview cross-platform differences** → test canvas graph + Monaco on WebKit and
  WebView2 from M1.
- **Tauri IPC security** → validate all command inputs in Rust; keep the capability
  allow-list (Tauri v2 permissions) tight; never expose raw filesystem/shell to the webview.
- **GitKraken trademark/branding** → ship original name, icons, and copy; don't clone assets.

---

## 6. Resolved decisions & remaining questions

**Resolved (v0.3):**
- Stack — **Tauri v2 + Rust**, Svelte (or React) frontend.
- Git engine — **`git2` primary + `gix` hot reads + `git` CLI sidecar**, behind a
  `GitEngine` trait.
- v1 scope — **through M2** (full daily-driver).
- Hosting integration — **GitHub only** for v1 (lands in M3, post-v1 release).

**Still open:**
1. **Frontend framework** — Svelte (lighter, matches GitButler) vs React (bigger
   ecosystem, the original v0.2 assumption). Recommended: **Svelte**.
2. **Bundle `git` or require a system `git`?** — bundling guarantees behavior but adds
   codesigning/notarization work; system-git is simpler but less predictable. Recommended:
   **bundle, with system-git fallback.**
3. **AI commit messages** — in scope post-v1? If so, which provider/model, and must it be
   optional / offline-friendly?
4. **Commit signing** — GPG, SSH-signing, or both required for v1?
5. **Auto-update** — Tauri's built-in updater plugin vs a self-hosted feed.

---

## Sources / research

- [GitButler — Tauri + Rust + Svelte Git client (reference architecture)](https://github.com/gitbutlerapp/gitbutler)
- [GitButler DEVELOPMENT.md (stack, gix backend, fork-to-git for push/pull)](https://github.com/gitbutlerapp/gitbutler/blob/master/DEVELOPMENT.md)
- [gitoxide / `gix` — pure-Rust Git, feature status](https://github.com/GitoxideLabs/gitoxide)
- [`gix` crate docs](https://docs.rs/gix)
- [`git2` crate docs (libgit2 Rust bindings)](https://docs.rs/git2)
- [git2-rs rebase API source](https://github.com/rust-lang/git2-rs/blob/master/src/rebase.rs)
- [Tauri v2 — Embedding External Binaries (sidecar)](https://v2.tauri.app/develop/sidecar/)
- [Tauri v2 documentation](https://v2.tauri.app/)
- [`notify` crate — cross-platform FS events](https://docs.rs/notify)
- [`keyring` crate — OS keychain access](https://docs.rs/keyring)
- [GitKraken Desktop — Interactive Rebase](https://help.gitkraken.com/gitkraken-desktop/interactive-rebase/)
- [GitKraken Desktop — Branch, Merge, Rebase](https://help.gitkraken.com/gitkraken-desktop/branching-and-merging/)
- [GitKraken Desktop — Interface layout](https://help.gitkraken.com/gitkraken-desktop/interface/)
- [How NodeGit and libgit2 Power GitKraken (engine background)](https://www.gitkraken.com/blog/nodegit-libgit2)
