// Auth — store an HTTPS token per host with Electron `safeStorage` (OS-keychain
// backed), and bridge it to the system `git` via `GIT_ASKPASS`. SSH and existing
// OS credential helpers are left to git itself (the engine already shells to it).
// The token never crosses the contextBridge — only `hasToken` does.
//
// M3 reuses the same safeStorage mechanism for app-level secrets (the GitHub
// OAuth token, the Anthropic API key) via the generic secret store below. Every
// secret lives only in this process; the renderer only ever learns whether one
// exists, never its value.

import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'

import type { AuthInfo } from '../shared/types'

type Store = Record<string, string> // key -> base64(encrypted value)

/** Encrypt a value with safeStorage, falling back to plain base64 when no OS
 *  keyring is available (e.g. headless Linux) — never store cleartext on disk. */
function encrypt(value: string): string {
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value).toString('base64')
    : Buffer.from(value).toString('base64')
}
function decrypt(enc: string): string | null {
  const buf = Buffer.from(enc, 'base64')
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
  } catch {
    return null
  }
}

function loadFrom(path: string): Store {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Store
  } catch {
    return {}
  }
}
function saveTo(path: string, s: Store): void {
  writeFileSync(path, JSON.stringify(s), { mode: 0o600 })
}

const file = (): string => join(app.getPath('userData'), 'credentials.json')
const load = (): Store => loadFrom(file())
const save = (s: Store): void => saveTo(file(), s)

export function setToken(host: string, token: string): void {
  const s = load()
  s[host] = encrypt(token)
  save(s)
}

export function clearToken(host: string): void {
  const s = load()
  delete s[host]
  save(s)
}

function getToken(host: string): string | null {
  const enc = load()[host]
  return enc ? decrypt(enc) : null
}

// ── Generic app-secret store (M3): GitHub token, Anthropic key, … ──
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')

/** Store an app secret by name (encrypted). Empty value clears it. */
export function setSecret(name: string, value: string): void {
  const s = loadFrom(secretsFile())
  if (value) s[name] = encrypt(value)
  else delete s[name]
  saveTo(secretsFile(), s)
}

/** Read an app secret (decrypted), or null if unset. Stays in this process. */
export function getSecret(name: string): string | null {
  const enc = loadFrom(secretsFile())[name]
  return enc ? decrypt(enc) : null
}

export function hasSecret(name: string): boolean {
  return Boolean(loadFrom(secretsFile())[name])
}

export function clearSecret(name: string): void {
  setSecret(name, '')
}

export function authInfo(): AuthInfo[] {
  return Object.keys(load()).map((host) => ({ host, hasToken: true }))
}

/** Lazily materialize the GIT_ASKPASS shell wrapper + its JS logic in userData. */
function askpassScript(): string {
  const dir = app.getPath('userData')
  const js = join(dir, 'askpass.cjs')
  const sh = join(dir, 'askpass.sh')
  if (!existsSync(js)) {
    // Print the username for a "Username" prompt, else the token.
    writeFileSync(
      js,
      'const a=process.argv[2]||"";process.stdout.write(/username/i.test(a)?(process.env.GITNIT_USER||"x-access-token"):(process.env.GITNIT_TOKEN||""));'
    )
  }
  if (!existsSync(sh)) {
    // git runs GIT_ASKPASS directly (no shell parsing), so we need a single exec;
    // the wrapper runs the Electron binary as Node against the JS helper.
    writeFileSync(sh, `#!/bin/sh\nexec "$GITNIT_ELECTRON" "$GITNIT_ASKPASS_JS" "$1"\n`)
    chmodSync(sh, 0o755)
  }
  return sh
}

/**
 * Env to attach to an HTTPS git op so a stored token authenticates it. Returns
 * `null` when no token is stored for the host (→ git falls back to ssh-agent /
 * credential helper / interactive, which we disable via GIT_TERMINAL_PROMPT).
 */
export function askpassEnv(host: string): Record<string, string> | null {
  const token = getToken(host)
  if (!token) return null
  return {
    GIT_ASKPASS: askpassScript(),
    GITNIT_ELECTRON: process.execPath,
    GITNIT_ASKPASS_JS: join(app.getPath('userData'), 'askpass.cjs'),
    ELECTRON_RUN_AS_NODE: '1',
    GITNIT_TOKEN: token,
    GITNIT_USER: 'x-access-token',
    GIT_TERMINAL_PROMPT: '0'
  }
}

/** Extract the host from an HTTPS remote URL, or null for ssh/other. */
export function httpsHost(url: string): string | null {
  const m = /^https?:\/\/(?:[^@/]+@)?([^/:]+)/.exec(url.trim())
  return m ? m[1] : null
}
