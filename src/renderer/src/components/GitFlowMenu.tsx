// GitFlow menu: initialize the flow branches, start a feature/release/hotfix,
// and finish the active flow branch (merge into develop, or main+develop+tag).

import { useEffect, useState } from 'react'

import type { GitFlowKind } from '../../../shared/types'
import { useGitFlow } from '../gitflow-store'
import { useUi } from '../ui-store'
import * as ipc from '../ipc'

const KINDS: GitFlowKind[] = ['feature', 'release', 'hotfix']

export default function GitFlowMenu(): React.JSX.Element | null {
  const show = useUi((s) => s.showGitFlow)
  const close = (): void => useUi.getState().setShowGitFlow(false)
  const status = useGitFlow((s) => s.status)
  const error = useGitFlow((s) => s.error)
  const refresh = useGitFlow((s) => s.refresh)

  const [kind, setKind] = useState<GitFlowKind>('feature')
  const [name, setName] = useState('')

  useEffect(() => {
    if (show) void refresh()
  }, [show, refresh])

  if (!show) return null

  const start = async (): Promise<void> => {
    if (name.trim() === '') return
    await useGitFlow.getState().start(kind, name.trim())
    setName('')
  }

  const finishCurrent = async (): Promise<void> => {
    const cur = status?.current
    if (!cur) return
    const ok = await ipc.confirm(
      `Finish ${cur.kind} "${cur.name}"?`,
      cur.kind === 'feature'
        ? `Merges into ${status?.develop} and deletes the branch.`
        : `Merges into ${status?.main} and ${status?.develop}, tags the release, deletes the branch.`
    )
    if (ok) await useGitFlow.getState().finish(cur.kind, cur.name)
  }

  return (
    <div className="popover-overlay" onMouseDown={close}>
      <div className="popover flow-popover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="popover-head">GitFlow</div>
        {error && <div className="banner error">{error}</div>}

        {!status?.initialized ? (
          <div className="flow-init">
            <p className="muted">
              Not initialized. Set up <code>develop</code> + <code>main</code> branch conventions.
            </p>
            <button
              className="primary"
              onClick={() => void useGitFlow.getState().init({ develop: 'develop', main: 'main' })}
            >
              Initialize GitFlow
            </button>
          </div>
        ) : (
          <>
            <p className="muted flow-status">
              develop: <code>{status.develop}</code> · main: <code>{status.main}</code>
            </p>

            {status.current && (
              <div className="flow-current">
                On {status.current.kind} <code>{status.current.name}</code>
                <button className="primary" onClick={() => void finishCurrent()}>
                  Finish
                </button>
              </div>
            )}

            <div className="flow-start">
              <select value={kind} onChange={(e) => setKind(e.target.value as GitFlowKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                placeholder="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void start()
                }}
              />
              <button className="primary" disabled={name.trim() === ''} onClick={() => void start()}>
                Start
              </button>
            </div>
          </>
        )}

        <div className="modal-foot">
          <button onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
