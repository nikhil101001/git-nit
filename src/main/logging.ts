// Local error logging (M5.6). Catches uncaught main-process errors and accepts
// renderer errors over IPC, appending to a size-capped log file in userData.
// NOTHING is sent remotely — remote telemetry is deferred to post-v1. The log is
// for the user to attach to a bug report ("Reveal logs").

import { app, shell } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 1024 * 1024 // rotate at ~1 MB (keep one .old)

const dir = (): string => join(app.getPath('userData'), 'logs')
const file = (): string => join(dir(), 'errors.log')

function write(source: string, message: string): void {
  try {
    mkdirSync(dir(), { recursive: true })
    const f = file()
    if (existsSync(f) && statSync(f).size > MAX_BYTES) {
      renameSync(f, f + '.old') // one-generation rotation
    }
    appendFileSync(f, `[${new Date().toISOString()}] ${source}: ${message}\n`)
  } catch {
    // logging must never throw
  }
}

/** Install process-level handlers (call once at startup). */
export function initLogging(): void {
  process.on('uncaughtException', (e) => write('main/uncaught', e?.stack ?? String(e)))
  process.on('unhandledRejection', (e) =>
    write('main/rejection', e instanceof Error ? (e.stack ?? e.message) : String(e))
  )
}

/** Record an error reported by the renderer. */
export function logRendererError(message: string): void {
  write('renderer', message)
}

/** Open the logs folder in the OS file manager. */
export async function revealLogs(): Promise<void> {
  try {
    mkdirSync(dir(), { recursive: true })
  } catch {
    // ignore
  }
  await shell.openPath(dir())
}
