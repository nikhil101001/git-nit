// Auto-update banner (M5.3): subscribes to app://update and shows download
// progress + a "Restart to update" action when an update is ready. Hidden when
// idle / checking / up-to-date.

import { useEffect, useState } from 'react'

import type { UpdateState } from '../../../shared/types'
import * as ipc from '../ipc'

export default function UpdateBanner(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    void ipc.updateState().then(setState).catch(() => {})
    return ipc.onUpdate(setState)
  }, [])

  if (!state) return null
  const { status, version, percent, message } = state
  if (status === 'idle' || status === 'checking' || status === 'none') return null

  return (
    <div className="update-banner">
      {status === 'available' && <span>Update {version} available — downloading…</span>}
      {status === 'downloading' && <span>Downloading update… {percent ?? 0}%</span>}
      {status === 'ready' && <span>Update {version} is ready to install.</span>}
      {status === 'error' && <span>Update error: {message}</span>}
      <span className="spacer" />
      {status === 'ready' && (
        <button className="primary mini" onClick={() => void ipc.quitAndInstall()}>
          Restart to update
        </button>
      )}
    </div>
  )
}
