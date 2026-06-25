// Remotes toolbar: fetch / pull / push (+ force-push) with live progress from
// the `repo://sync-progress` stream. Mirrors the Tauri build's `Toolbar.svelte`.

import { useEffect, useState } from 'react'

import type { SyncProgress } from '../../../shared/types'
import { onSyncProgress } from '../ipc'
import * as actions from '../actions'

export default function Toolbar(): React.JSX.Element {
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => onSyncProgress((p) => setProgress(p)), [])

  // Clear the progress line a moment after an op completes.
  useEffect(() => {
    if (!progress?.done) return
    const t = setTimeout(() => setProgress(null), 2500)
    return () => clearTimeout(t)
  }, [progress])

  const run = (fn: () => Promise<void>) => async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setProgress(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="toolbar">
      <button disabled={busy} onClick={run(actions.doFetch)}>
        Fetch
      </button>
      <button disabled={busy} onClick={run(actions.doPull)}>
        Pull
      </button>
      <button disabled={busy} onClick={run(actions.doPush)}>
        Push
      </button>
      <button className="danger" disabled={busy} onClick={run(actions.doForcePush)} title="Push --force-with-lease">
        Force
      </button>
      {progress && (
        <span className="sync-progress" title={progress.raw}>
          {progress.percent !== null ? `${progress.percent}%` : ''} {progress.raw}
        </span>
      )}
    </div>
  )
}
