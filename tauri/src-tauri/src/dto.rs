//! Data-transfer objects crossing the Tauri IPC boundary.
//!
//! Every type here derives `Serialize` (wire format) and `TS` (generates the
//! matching TypeScript interface into `src/lib/bindings/`). `#[ts(export)]`
//! makes `cargo test export_bindings` write the `.ts` file. No `git2` types
//! ever appear here — the engine maps into these owned, plain types so a future
//! `gix` engine can satisfy the same contract.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    /// Canonical path to the working directory (or the repo path if bare).
    pub path: String,
    pub is_bare: bool,
    /// Repository state: "clean", "merge", "rebase", "cherryPick", etc.
    pub state: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct HeadInfo {
    pub is_detached: bool,
    /// Short branch name when HEAD points at a branch (incl. an unborn one).
    pub branch: Option<String>,
    /// Full hex oid of the HEAD commit; `None` on an unborn branch.
    pub target: Option<String>,
    /// Subject line of the HEAD commit; `None` on an unborn branch.
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    /// Short name, e.g. "main" or "origin/main".
    pub name: String,
    /// Full ref name, e.g. "refs/heads/main".
    pub full_name: String,
    pub is_remote: bool,
    pub is_head: bool,
    /// Tip commit oid (hex); `None` if the ref cannot be resolved.
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    /// Author time, seconds since the Unix epoch (UTC). Frontend formats it.
    /// serde sends i64 as a JSON number; force the TS type to match (ts-rs
    /// would otherwise emit `bigint`).
    #[ts(type = "number")]
    pub time_unix: i64,
    /// Parent oids (hex). Carried now so the M1 graph builder needs no change.
    pub parents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    pub commits: Vec<CommitSummary>,
    /// Oid to continue the walk from for the next page; `None` at the end.
    pub next_cursor: Option<String>,
}

/// Payload of the `repo://refresh` event emitted by the filesystem watcher.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct RefreshEvent {
    pub reason: String,
}
