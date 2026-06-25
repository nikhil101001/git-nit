// Interactive rebase editor: reorder steps, set per-commit action, and reword.
// Sends the plan to the engine, which drives the real `git rebase -i`.

import { useEffect, useState } from 'react'

import type { RebaseAction, RebaseStep } from '../../../shared/types'
import { useUi } from '../ui-store'
import * as actions from '../actions'

const ACTIONS: RebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']

export default function RebaseUI(): React.JSX.Element | null {
  const plan = useUi((s) => s.rebasePlan)
  const close = (): void => useUi.getState().openRebase(null)
  const [steps, setSteps] = useState<RebaseStep[]>([])

  useEffect(() => {
    setSteps(plan ? plan.steps.map((s) => ({ ...s })) : [])
  }, [plan])

  if (!plan) return null

  const update = (i: number, patch: Partial<RebaseStep>): void =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)))
  const move = (i: number, dir: number): void =>
    setSteps((s) => {
      const a = [...s]
      const j = i + dir
      if (j < 0 || j >= a.length) return a
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })

  const start = async (): Promise<void> => {
    await actions.applyRebasePlan({ onto: plan.onto, steps })
    close()
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="rebase-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">Interactive rebase onto {plan.onto.slice(0, 7)}</header>
        <ul className="rebase-steps">
          {steps.map((st, i) => (
            <li key={st.oid} className={st.action === 'drop' ? 'dropped' : ''}>
              <span className="move">
                <button onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                  ↓
                </button>
              </span>
              <select
                value={st.action}
                onChange={(e) => update(i, { action: e.target.value as RebaseAction })}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <code className="sha">{st.shortOid}</code>
              {st.action === 'reword' ? (
                <input
                  className="reword"
                  value={st.message ?? st.summary}
                  onChange={(e) => update(i, { message: e.target.value })}
                />
              ) : (
                <span className="summary">{st.summary}</span>
              )}
            </li>
          ))}
          {steps.length === 0 && <li className="muted">no commits to rebase</li>}
        </ul>
        <footer className="modal-foot">
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={steps.length === 0} onClick={() => void start()}>
            Start rebase
          </button>
        </footer>
      </div>
    </div>
  )
}
