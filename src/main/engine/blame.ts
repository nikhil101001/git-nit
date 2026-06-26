// Parse `git blame --porcelain` into per-line attribution.
//
// Porcelain format: each line group begins with a header
//   <oid> <orig-lineno> <final-lineno> [<group-size>]
// followed — the FIRST time an oid appears — by metadata lines (author,
// author-time, summary, …). Every line then ends with a TAB-prefixed content
// line. Metadata is emitted once per oid and cached, so later groups for the
// same commit carry only the header + content. Pure + side-effect-free so the
// vitest suite can exercise it without a real repo.

import type { BlameLine } from '../../shared/types'

interface Meta {
  author: string
  timeUnix: number
  summary: string
}

const HEADER = /^([0-9a-f]{7,64}) (\d+) (\d+)(?: (\d+))?$/

export function parseBlamePorcelain(out: string): BlameLine[] {
  const meta = new Map<string, Meta>()
  const result: BlameLine[] = []
  let cur: { oid: string; finalLine: number } | null = null

  for (const raw of out.split('\n')) {
    if (raw === '') continue

    // Content line: the actual text of the current group's line.
    if (raw[0] === '\t') {
      if (cur) {
        const m = meta.get(cur.oid) ?? { author: '', timeUnix: 0, summary: '' }
        result.push({
          line: cur.finalLine,
          oid: cur.oid,
          shortOid: cur.oid.slice(0, 8),
          author: m.author,
          timeUnix: m.timeUnix,
          summary: m.summary,
          content: raw.slice(1)
        })
      }
      continue
    }

    const h = HEADER.exec(raw)
    if (h) {
      cur = { oid: h[1], finalLine: Number(h[3]) }
      if (!meta.has(h[1])) meta.set(h[1], { author: '', timeUnix: 0, summary: '' })
      continue
    }

    // Metadata line for the current commit (key + space-delimited value).
    if (cur) {
      const sp = raw.indexOf(' ')
      const key = sp === -1 ? raw : raw.slice(0, sp)
      const val = sp === -1 ? '' : raw.slice(sp + 1)
      const m = meta.get(cur.oid)
      if (m) {
        if (key === 'author') m.author = val
        else if (key === 'author-time') m.timeUnix = Number(val)
        else if (key === 'summary') m.summary = val
      }
    }
  }

  return result
}
