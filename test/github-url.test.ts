import { describe, it, expect } from 'vitest'

import { parseGitHubRepo } from '../src/main/github-url'

describe('parseGitHubRepo', () => {
  it('parses the scp-like SSH form', () => {
    expect(parseGitHubRepo('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubRepo('git@github.com:owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS, with or without .git / trailing slash', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubRepo('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubRepo('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses ssh:// URLs and a user-prefixed HTTPS', () => {
    expect(parseGitHubRepo('ssh://git@github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
    expect(parseGitHubRepo('https://user@github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('keeps dotted repo names intact', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo.js.git')).toEqual({ owner: 'owner', repo: 'repo.js' })
  })

  it('rejects non-GitHub hosts', () => {
    expect(parseGitHubRepo('git@gitlab.com:owner/repo.git')).toBeNull()
    expect(parseGitHubRepo('https://bitbucket.org/owner/repo.git')).toBeNull()
    expect(parseGitHubRepo('not a url')).toBeNull()
  })
})
