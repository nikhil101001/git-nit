// Pull Requests sidebar section (replaces the GitHubPanel modal): sign-in state,
// open PRs + issues (open in browser), and an inline "create PR from the current
// branch" form. The device-flow dialog stays a modal (auth is blocking).

import { useState } from 'react'

import { useGitHub } from '../../github-store'
import { useRepo } from '../../store'
import SidebarSection from '../SidebarSection'

export default function PullRequestsSection(): React.JSX.Element {
  const auth = useGitHub((s) => s.auth)
  const pulls = useGitHub((s) => s.pulls)
  const issues = useGitHub((s) => s.issues)
  const loading = useGitHub((s) => s.loadingLists)
  const error = useGitHub((s) => s.error)
  const branch = useRepo((s) => s.head?.branch ?? '')

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState('main')

  const submit = async (): Promise<void> => {
    if (title.trim() === '') return
    const pr = await useGitHub.getState().createPull({ title, body, base, head: branch })
    if (pr) {
      setShowForm(false)
      setTitle('')
      setBody('')
      window.open(pr.url, '_blank')
    }
  }

  const action = auth.signedIn ? (
    <button className="mini" title={`New PR from ${branch}`} onClick={() => setShowForm((v) => !v)}>
      ＋
    </button>
  ) : (
    <button className="mini" title="Sign in to GitHub" onClick={() => void useGitHub.getState().signIn()}>
      sign in
    </button>
  )

  return (
    <SidebarSection
      id="pulls"
      title="Pull Requests"
      count={auth.signedIn ? pulls.length : null}
      action={action}
      onExpand={() => void useGitHub.getState().refreshAuth()}
    >
      {error && <div className="banner error sb-error">{error}</div>}
      {!auth.signedIn ? (
        <div className="muted sb-note">Sign in with GitHub to list pull requests and issues.</div>
      ) : (
        <>
          {showForm && (
            <div className="sb-form">
              <input placeholder="PR title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea placeholder="description (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="sb-form-row">
                <input className="sb-base" value={base} onChange={(e) => setBase(e.target.value)} title="base branch" />
                <span className="muted">← {branch || '(current)'}</span>
                <button className="primary mini" disabled={title.trim() === ''} onClick={() => void submit()}>
                  Create
                </button>
              </div>
            </div>
          )}
          <ul>
            {pulls.map((pr) => (
              <li key={pr.number} className="sb-row" onClick={() => window.open(pr.url, '_blank')}>
                <span className="sb-num">#{pr.number}</span>
                <span className="sb-row-main" title={pr.title}>
                  {pr.draft ? '[draft] ' : ''}
                  {pr.title}
                </span>
              </li>
            ))}
            {!loading && pulls.length === 0 && <li className="muted">no open PRs</li>}
          </ul>
          {issues.length > 0 && <div className="sb-subhead">Issues</div>}
          <ul>
            {issues.map((i) => (
              <li key={i.number} className="sb-row" onClick={() => window.open(i.url, '_blank')}>
                <span className="sb-num">#{i.number}</span>
                <span className="sb-row-main" title={i.title}>
                  {i.title}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SidebarSection>
  )
}
