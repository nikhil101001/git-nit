// GitHub panel: sign-in state, open PRs + issues, and a "create PR from the
// current branch" form. Opens links in the OS browser (handled by main).

import { useEffect, useState } from 'react'

import { useGitHub } from '../github-store'
import { useUi } from '../ui-store'
import { useRepo } from '../store'

export default function GitHubPanel(): React.JSX.Element | null {
  const show = useUi((s) => s.showGitHub)
  const close = (): void => useUi.getState().setShowGitHub(false)

  const auth = useGitHub((s) => s.auth)
  const pulls = useGitHub((s) => s.pulls)
  const issues = useGitHub((s) => s.issues)
  const loading = useGitHub((s) => s.loadingLists)
  const error = useGitHub((s) => s.error)
  const refreshAuth = useGitHub((s) => s.refreshAuth)

  const branch = useRepo((s) => s.head?.branch ?? '')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState('main')

  // Load auth + lists when the panel first opens.
  useEffect(() => {
    if (show) void refreshAuth()
  }, [show, refreshAuth])

  if (!show) return null

  const submitPr = async (): Promise<void> => {
    if (title.trim() === '') return
    const pr = await useGitHub.getState().createPull({ title, body, base, head: branch })
    if (pr) {
      setShowForm(false)
      setTitle('')
      setBody('')
      window.open(pr.url, '_blank')
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="gh-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="conflict-head">
          <span className="conflict-title">GitHub</span>
          <div className="conflict-quick">
            {auth.signedIn ? (
              <>
                <span className="muted">@{auth.login ?? '…'}</span>
                <button onClick={() => void useGitHub.getState().signOut()}>Sign out</button>
              </>
            ) : (
              <button className="primary" onClick={() => void useGitHub.getState().signIn()}>
                Sign in
              </button>
            )}
            <button onClick={close}>Close</button>
          </div>
        </div>

        {error && <div className="banner error">{error}</div>}

        {!auth.signedIn ? (
          <div className="gh-empty muted">
            Sign in with GitHub (device flow) to list pull requests and issues, and open PRs from
            git-nit.
          </div>
        ) : (
          <div className="gh-body">
            <div className="gh-section-head">
              <h3>Pull requests {loading ? '…' : `(${pulls.length})`}</h3>
              <button className="primary mini" onClick={() => setShowForm((v) => !v)}>
                New PR from {branch || 'current branch'}
              </button>
            </div>

            {showForm && (
              <div className="gh-form">
                <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <textarea
                  placeholder="Description (optional)"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="gh-form-row">
                  <label>
                    base
                    <input value={base} onChange={(e) => setBase(e.target.value)} />
                  </label>
                  <span className="muted">head: {branch || '(current)'}</span>
                  <button className="primary" disabled={title.trim() === ''} onClick={() => void submitPr()}>
                    Create
                  </button>
                </div>
              </div>
            )}

            <ul className="gh-list">
              {pulls.map((pr) => (
                <li key={pr.number} onClick={() => window.open(pr.url, '_blank')}>
                  <span className="gh-num">#{pr.number}</span>
                  <span className="gh-title" title={pr.title}>
                    {pr.draft ? '[draft] ' : ''}
                    {pr.title}
                  </span>
                  <span className="muted gh-ref">
                    {pr.headRef} → {pr.baseRef}
                  </span>
                </li>
              ))}
              {!loading && pulls.length === 0 && <li className="muted">No open pull requests.</li>}
            </ul>

            <div className="gh-section-head">
              <h3>Issues {loading ? '…' : `(${issues.length})`}</h3>
            </div>
            <ul className="gh-list">
              {issues.map((i) => (
                <li key={i.number} onClick={() => window.open(i.url, '_blank')}>
                  <span className="gh-num">#{i.number}</span>
                  <span className="gh-title" title={i.title}>
                    {i.title}
                  </span>
                  <span className="muted gh-ref">@{i.author}</span>
                </li>
              ))}
              {!loading && issues.length === 0 && <li className="muted">No open issues.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
