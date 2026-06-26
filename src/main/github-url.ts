// Resolve a GitHub owner/repo from an `origin` remote URL. Pure + electron-free
// so the vitest suite can pin it. Handles the three remote shapes:
//   git@github.com:owner/repo.git
//   https://github.com/owner/repo(.git)
//   ssh://git@github.com/owner/repo(.git)
// Returns null for non-GitHub remotes (the hosting story is GitHub-only in M3).

export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim()

  let host: string
  let path: string
  const scp = /^[^@]+@([^:]+):(.+)$/.exec(trimmed) // git@host:owner/repo.git
  if (scp) {
    host = scp[1]
    path = scp[2]
  } else {
    const u = /^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(trimmed)
    if (!u) return null
    host = u[1]
    path = u[2]
  }

  if (!/(^|\.)github\.com$/i.test(host) && !/github/i.test(host)) return null

  const m = /^([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(path)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}
