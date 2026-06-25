// Manage stored HTTPS tokens (Electron safeStorage). The token is write-only
// from the renderer's view — only host + hasToken come back.

import { useEffect, useState } from 'react'

import type { AuthInfo } from '../../../shared/types'
import { useUi } from '../ui-store'
import * as ipc from '../ipc'
import * as actions from '../actions'

export default function AuthDialog(): React.JSX.Element | null {
  const show = useUi((s) => s.showAuth)
  const close = (): void => useUi.getState().setShowAuth(false)
  const [infos, setInfos] = useState<AuthInfo[]>([])
  const [host, setHost] = useState('github.com')
  const [token, setToken] = useState('')

  const reload = (): void => {
    void ipc.authInfo().then(setInfos).catch(() => {})
  }
  useEffect(() => {
    if (show) reload()
  }, [show])

  if (!show) return null

  const save = async (): Promise<void> => {
    if (!host.trim() || !token.trim()) return
    await actions.setToken(host.trim(), token.trim())
    setToken('')
    reload()
  }
  const remove = async (h: string): Promise<void> => {
    await actions.clearToken(h)
    reload()
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="small-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">HTTPS tokens</header>
        <ul className="auth-list">
          {infos.map((i) => (
            <li key={i.host}>
              <span>{i.host}</span>
              <button className="danger" onClick={() => void remove(i.host)}>
                Remove
              </button>
            </li>
          ))}
          {infos.length === 0 && <li className="muted">no stored tokens</li>}
        </ul>
        <input placeholder="host (e.g. github.com)" value={host} onChange={(e) => setHost(e.target.value)} />
        <input
          type="password"
          placeholder="personal access token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <footer className="modal-foot">
          <button onClick={close}>Close</button>
          <button className="primary" onClick={() => void save()}>
            Save token
          </button>
        </footer>
      </div>
    </div>
  )
}
