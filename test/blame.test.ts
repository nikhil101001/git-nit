import { describe, it, expect } from 'vitest'

import { parseBlamePorcelain } from '../src/main/engine/blame'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

const PORCELAIN = [
  `${A} 1 1 2`,
  'author Alice',
  'author-mail <alice@example.com>',
  'author-time 1700000000',
  'author-tz +0000',
  'summary first commit',
  'filename foo.txt',
  '\tline one',
  `${A} 2 2`,
  '\tline two',
  `${B} 3 3 1`,
  'author Bob',
  'author-mail <bob@example.com>',
  'author-time 1700001000',
  'author-tz +0000',
  'summary second commit',
  'filename foo.txt',
  '\tline three',
  ''
].join('\n')

describe('parseBlamePorcelain', () => {
  it('attributes every line, caching metadata per commit', () => {
    const lines = parseBlamePorcelain(PORCELAIN)
    expect(lines).toHaveLength(3)

    expect(lines[0]).toMatchObject({
      line: 1,
      oid: A,
      shortOid: A.slice(0, 8),
      author: 'Alice',
      timeUnix: 1700000000,
      summary: 'first commit',
      content: 'line one'
    })
    // Second line reuses the cached metadata for the same commit.
    expect(lines[1]).toMatchObject({ line: 2, oid: A, author: 'Alice', content: 'line two' })
    expect(lines[2]).toMatchObject({ line: 3, oid: B, author: 'Bob', summary: 'second commit', content: 'line three' })
  })

  it('preserves tab/leading-space inside content (only the first TAB is the marker)', () => {
    const out = parseBlamePorcelain([`${A} 1 1 1`, 'author X', 'author-time 1', 'summary s', '\t  indented', ''].join('\n'))
    expect(out[0].content).toBe('  indented')
  })

  it('returns nothing for empty input', () => {
    expect(parseBlamePorcelain('')).toEqual([])
  })
})
