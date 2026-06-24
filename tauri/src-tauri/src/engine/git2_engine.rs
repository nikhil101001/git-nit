//! The git2 (libgit2) implementation of `GitEngine` — the only engine in M0.

use std::path::PathBuf;

use git2::{BranchType, ErrorCode, Oid, Repository, RepositoryState, Sort};

use super::GitEngine;
use crate::dto::{BranchInfo, CommitPage, CommitSummary, HeadInfo, RepoInfo};
use crate::error::{AppError, AppResult};

pub struct Git2Engine {
    repo: Repository,
}

impl Git2Engine {
    /// Open the repository containing `path` (walks up to find the `.git` dir,
    /// so any subdirectory of a repo works).
    pub fn open(path: &str) -> AppResult<Self> {
        let p = std::path::Path::new(path);
        if !p.exists() {
            return Err(AppError::InvalidPath(format!("{path} does not exist")));
        }
        let repo = Repository::discover(p)?;
        Ok(Self { repo })
    }
}

fn state_to_str(state: RepositoryState) -> &'static str {
    match state {
        RepositoryState::Clean => "clean",
        RepositoryState::Merge => "merge",
        RepositoryState::Revert | RepositoryState::RevertSequence => "revert",
        RepositoryState::CherryPick | RepositoryState::CherryPickSequence => "cherryPick",
        RepositoryState::Bisect => "bisect",
        RepositoryState::Rebase
        | RepositoryState::RebaseInteractive
        | RepositoryState::RebaseMerge => "rebase",
        RepositoryState::ApplyMailbox | RepositoryState::ApplyMailboxOrRebase => "applyMailbox",
    }
}

fn short_hex(oid: Oid) -> String {
    oid.to_string().chars().take(7).collect()
}

impl GitEngine for Git2Engine {
    fn repo_info(&self) -> AppResult<RepoInfo> {
        let path = self
            .repo
            .workdir()
            .unwrap_or_else(|| self.repo.path())
            .to_string_lossy()
            .into_owned();
        Ok(RepoInfo {
            path,
            is_bare: self.repo.is_bare(),
            state: state_to_str(self.repo.state()).to_string(),
        })
    }

    fn head(&self) -> AppResult<HeadInfo> {
        match self.repo.head() {
            Ok(head_ref) => {
                let is_detached = self.repo.head_detached().unwrap_or(false);
                let branch = if is_detached {
                    None
                } else {
                    head_ref.shorthand().ok().map(str::to_string)
                };
                let commit = head_ref.peel_to_commit().ok();
                Ok(HeadInfo {
                    is_detached,
                    branch,
                    target: commit.as_ref().map(|c| c.id().to_string()),
                    summary: commit
                        .as_ref()
                        .and_then(|c| c.summary().ok().flatten().map(str::to_string)),
                })
            }
            // Fresh repo with no commits: HEAD is an unborn branch.
            Err(e) if e.code() == ErrorCode::UnbornBranch => {
                let branch = self
                    .repo
                    .find_reference("HEAD")
                    .ok()
                    .and_then(|r| r.symbolic_target().ok().flatten().map(str::to_string))
                    .map(|full| {
                        full.strip_prefix("refs/heads/")
                            .unwrap_or(&full)
                            .to_string()
                    });
                Ok(HeadInfo {
                    is_detached: false,
                    branch,
                    target: None,
                    summary: None,
                })
            }
            Err(e) => Err(e.into()),
        }
    }

    fn list_branches(&self) -> AppResult<Vec<BranchInfo>> {
        let mut out = Vec::new();
        for item in self.repo.branches(None)? {
            let (branch, btype) = item?;
            let reference = branch.get();
            out.push(BranchInfo {
                name: branch.name()?.unwrap_or_default().to_string(),
                full_name: reference.name().unwrap_or_default().to_string(),
                is_remote: btype == BranchType::Remote,
                is_head: branch.is_head(),
                target: reference.target().map(|oid| oid.to_string()),
            });
        }
        Ok(out)
    }

    fn list_commits(&self, start: Option<&str>, limit: usize) -> AppResult<CommitPage> {
        let mut walk = self.repo.revwalk()?;
        walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;

        match start {
            Some(s) => walk.push(Oid::from_str(s)?)?,
            None => {
                // No commits yet (unborn HEAD) -> empty page, not an error.
                // `push_head` returns a generic "reference not found" in this
                // case, so detect the unborn state via `head()` instead.
                if self.repo.head().is_err() {
                    return Ok(CommitPage {
                        commits: Vec::new(),
                        next_cursor: None,
                    });
                }
                walk.push_head()?;
            }
        }

        let mut commits = Vec::with_capacity(limit.min(1024));
        let mut next_cursor = None;
        for (i, oid_res) in walk.enumerate() {
            let oid = oid_res?;
            if i >= limit {
                next_cursor = Some(oid.to_string());
                break;
            }
            let commit = self.repo.find_commit(oid)?;
            let author = commit.author();
            commits.push(CommitSummary {
                oid: oid.to_string(),
                short_oid: short_hex(oid),
                summary: commit.summary().ok().flatten().unwrap_or_default().to_string(),
                author_name: author.name().unwrap_or_default().to_string(),
                author_email: author.email().unwrap_or_default().to_string(),
                time_unix: commit.time().seconds(),
                parents: commit.parent_ids().map(|p| p.to_string()).collect(),
            });
        }

        Ok(CommitPage {
            commits,
            next_cursor,
        })
    }

    fn workdir(&self) -> Option<PathBuf> {
        self.repo.workdir().map(|p| p.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Repository, Signature};
    use std::path::Path;

    /// Initialize a repo at `dir` with two commits on the default branch.
    fn repo_with_commits(dir: &Path) {
        let repo = Repository::init(dir).unwrap();
        let sig = Signature::now("Tester", "tester@example.com").unwrap();

        // First commit (empty tree).
        let tree_id = {
            let mut index = repo.index().unwrap();
            index.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        let c1 = repo
            .commit(Some("HEAD"), &sig, &sig, "first", &tree, &[])
            .unwrap();
        let parent = repo.find_commit(c1).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "second", &tree, &[&parent])
            .unwrap();
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("gitnit-test-{tag}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn head_and_commits_on_populated_repo() {
        let dir = tmp_dir("populated");
        repo_with_commits(&dir);

        let engine = Git2Engine::open(dir.to_str().unwrap()).unwrap();

        let head = engine.head().unwrap();
        assert!(!head.is_detached);
        assert!(head.target.is_some());
        assert_eq!(head.summary.as_deref(), Some("second"));

        let page = engine.list_commits(None, 10).unwrap();
        assert_eq!(page.commits.len(), 2);
        assert_eq!(page.commits[0].summary, "second");
        assert_eq!(page.commits[1].summary, "first");
        assert!(page.next_cursor.is_none());

        let branches = engine.list_branches().unwrap();
        assert!(branches.iter().any(|b| b.is_head && !b.is_remote));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unborn_repo_is_empty_not_an_error() {
        let dir = tmp_dir("unborn");
        let _repo = Repository::init(&dir).unwrap();

        let engine = Git2Engine::open(dir.to_str().unwrap()).unwrap();

        let head = engine.head().unwrap();
        assert!(head.target.is_none());
        assert!(head.summary.is_none());

        let page = engine.list_commits(None, 10).unwrap();
        assert!(page.commits.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }
}
