// GitHub integration (M3): OAuth device flow + a thin REST client for PRs and
// issues. Everything here runs in the main process; the OAuth token is stored
// via auth.ts (safeStorage) and NEVER crosses the contextBridge — the renderer
// only receives DTOs (auth state, PR/issue lists) and the user-facing device
// code. Uses the global `fetch` (Electron's Node ≥18) — no extra dependency.
//
// The hosting layer is deliberately small so a GitLab/Bitbucket provider can
// slot in behind the same IPC surface later (SPEC §4).

import * as auth from './auth'
import { AppError } from './errors'
import { parseGitHubRepo } from './github-url'
import type {
  GitHubAuthState,
  GitHubDeviceCode,
  Issue,
  PullRequest,
  PullRequestInput
} from '../shared/types'

// A registered GitHub OAuth app's client id. Public (no secret) for the device
// flow; override with GITNIT_GITHUB_CLIENT_ID to point at your own OAuth app.
const CLIENT_ID = process.env.GITNIT_GITHUB_CLIENT_ID || 'Iv1.gitnitplaceholder0'
const SCOPE = 'repo read:user'
const TOKEN_SECRET = 'github.token'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Pending {
  deviceCode: string
  interval: number
  expiresAt: number
}
let pending: Pending | null = null

/** Step 1 of the device flow: request a code to show the user. Does not poll. */
export async function startDeviceFlow(): Promise<GitHubDeviceCode> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE })
  }).catch((e: unknown) => {
    throw new AppError('git', `could not reach GitHub: ${(e as Error).message}`)
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.device_code !== 'string') {
    throw new AppError('git', `GitHub device flow failed (${res.status})`)
  }
  const interval = typeof data.interval === 'number' ? data.interval : 5
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 900
  pending = { deviceCode: data.device_code, interval, expiresAt: Date.now() + expiresIn * 1000 }
  return {
    userCode: String(data.user_code ?? ''),
    verificationUri: String(data.verification_uri ?? 'https://github.com/login/device'),
    expiresIn,
    interval
  }
}

/** Step 2: poll the token endpoint until authorized (or the code expires). */
export async function awaitAuth(): Promise<GitHubAuthState> {
  if (!pending) throw new AppError('git', 'no device authorization in progress')
  const p = pending
  let interval = p.interval

  while (Date.now() < p.expiresAt) {
    await sleep(interval * 1000)
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: p.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    }).catch(() => null)
    if (!res) continue // transient network error — keep polling
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (typeof data.access_token === 'string') {
      auth.setSecret(TOKEN_SECRET, data.access_token)
      pending = null
      return authState()
    }
    switch (data.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval += 5
        continue
      case 'expired_token':
        pending = null
        throw new AppError('git', 'the device code expired — start again')
      case 'access_denied':
        pending = null
        throw new AppError('git', 'authorization was denied')
      default:
        pending = null
        throw new AppError('git', String(data.error_description ?? data.error ?? 'authorization failed'))
    }
  }
  pending = null
  throw new AppError('git', 'the device code expired — start again')
}

export async function authState(): Promise<GitHubAuthState> {
  const token = auth.getSecret(TOKEN_SECRET)
  if (!token) return { signedIn: false, login: null }
  try {
    const user = (await api('/user')) as { login?: string }
    return { signedIn: true, login: user.login ?? null }
  } catch {
    return { signedIn: true, login: null }
  }
}

export function signOut(): void {
  auth.clearSecret(TOKEN_SECRET)
}

/** Authenticated GitHub REST call. The token stays in this process. */
async function api(path: string, init?: RequestInit): Promise<unknown> {
  const token = auth.getSecret(TOKEN_SECRET)
  if (!token) throw new AppError('git', 'not signed in to GitHub')
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'git-nit',
      ...(init?.headers ?? {})
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401) throw new AppError('git', 'GitHub token is invalid or expired — sign in again')
    throw new AppError('git', `GitHub API ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

function requireRepo(originUrl: string | null): { owner: string; repo: string } {
  const r = originUrl ? parseGitHubRepo(originUrl) : null
  if (!r) throw new AppError('git', 'the origin remote is not a GitHub repository')
  return r
}

export async function listPulls(originUrl: string | null): Promise<PullRequest[]> {
  const { owner, repo } = requireRepo(originUrl)
  const data = (await api(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`)) as Array<
    Record<string, any>
  >
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? '',
    state: pr.state,
    url: pr.html_url,
    headRef: pr.head?.ref ?? '',
    baseRef: pr.base?.ref ?? '',
    draft: pr.draft === true
  }))
}

export async function listIssues(originUrl: string | null): Promise<Issue[]> {
  const { owner, repo } = requireRepo(originUrl)
  const data = (await api(`/repos/${owner}/${repo}/issues?state=open&per_page=50`)) as Array<
    Record<string, any>
  >
  // The issues endpoint also returns PRs; drop anything with a pull_request key.
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      author: i.user?.login ?? '',
      state: i.state,
      url: i.html_url
    }))
}

export async function createPull(
  originUrl: string | null,
  input: PullRequestInput,
  currentBranch: string | null
): Promise<PullRequest> {
  const { owner, repo } = requireRepo(originUrl)
  const head = input.head || currentBranch
  if (!head) throw new AppError('git', 'no head branch to open a pull request from')
  const pr = (await api(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: input.title, body: input.body, base: input.base, head })
  })) as Record<string, any>
  return {
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? '',
    state: pr.state,
    url: pr.html_url,
    headRef: pr.head?.ref ?? head,
    baseRef: pr.base?.ref ?? input.base,
    draft: pr.draft === true
  }
}
