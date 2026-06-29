// Application error type, mapped to the typed `ErrorPayload` the renderer sees.
// A short machine-readable `kind` plus a
// human message, so the frontend can branch on the kind without parsing text.

import type { ErrorPayload } from '../shared/types'

export type ErrorKind =
  | 'noRepoOpen'
  | 'invalidPath'
  | 'git'
  | 'gitNotFound'
  | 'identityUnset'
  | 'signing'
  | 'conflict'
  | 'authFailed'
  | 'io'
  | 'watch'
  | 'internal'

export class AppError extends Error {
  readonly kind: ErrorKind

  constructor(kind: ErrorKind, message: string) {
    super(message)
    this.name = 'AppError'
    this.kind = kind
  }

  toPayload(): ErrorPayload {
    return { kind: this.kind, message: this.message }
  }

  /** Coerce any thrown value into an AppError (defaults to `internal`). */
  static from(e: unknown): AppError {
    if (e instanceof AppError) return e
    const message = e instanceof Error ? e.message : String(e)
    return new AppError('internal', message)
  }
}
