// IPC rejections arrive as the serialized ErrorPayload { kind, message }
// (the preload rejects with that plain object). Extract a human message.

import type { ErrorPayload } from '../../shared/types'

export function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as ErrorPayload).message)
  }
  return String(e)
}

/** The structured kind of an IPC rejection, or null if it isn't one. */
export function errKind(e: unknown): string | null {
  if (e && typeof e === 'object' && 'kind' in e) {
    return String((e as ErrorPayload).kind)
  }
  return null
}
