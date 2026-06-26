// OAuth device-flow dialog: shows the one-time code + verification URL while the
// store polls GitHub for authorization. Appears whenever a device code is live.

import { useGitHub } from '../github-store'

export default function DeviceFlowDialog(): React.JSX.Element | null {
  const device = useGitHub((s) => s.device)
  if (!device) return null

  return (
    <div className="modal-overlay">
      <div className="small-modal device-modal">
        <div className="modal-head">Sign in to GitHub</div>
        <p className="device-instructions">
          Enter this code at the verification page to authorize git-nit:
        </p>
        <div className="device-code">{device.userCode}</div>
        <div className="device-actions">
          <button
            className="primary"
            onClick={() => window.open(device.verificationUri, '_blank')}
          >
            Open {device.verificationUri.replace(/^https?:\/\//, '')}
          </button>
        </div>
        <p className="muted device-waiting">Waiting for authorization…</p>
      </div>
    </div>
  )
}
