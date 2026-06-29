// The commit graph: a virtualized list whose left gutter is drawn on a single
// Canvas 2D (lane lines + dots), with commit text rendered as DOM rows for only
// the visible window. SPEC §3.4 / §2.2: never mount 100k DOM nodes — we mount
// ~one screenful and redraw the canvas on scroll. Lanes/edges/colors come
// pre-computed from the engine (engine/graph.ts); this file only draws them.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { RefBadge } from '../../../shared/types'
import { useGraph } from '../graph-store'
import { useUi } from '../ui-store'
import { useStatus } from '../status-store'
import { relTime } from '../time'

const ROW_H = 28
const LANE_W = 14
const LEFT_PAD = 12
const DOT_R = 4
const MAX_GUTTER = 240

const PALETTE = [
  '#6c8cff',
  '#f0883e',
  '#56b6c2',
  '#c678dd',
  '#98c379',
  '#e06c75',
  '#d19a66',
  '#61afef'
]
const laneColor = (i: number): string => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]
const laneX = (lane: number): number => LEFT_PAD + LANE_W / 2 + lane * LANE_W

function badgeClass(kind: RefBadge['kind']): string {
  return `badge ${kind}`
}

export default function GraphCanvas(): React.JSX.Element {
  const rows = useGraph((s) => s.rows)
  const loading = useGraph((s) => s.loading)
  const nextCursor = useGraph((s) => s.nextCursor)
  const selectedOid = useGraph((s) => s.selectedOid)
  const filters = useGraph((s) => s.filters)
  const select = useGraph((s) => s.select)
  const loadMore = useGraph((s) => s.loadMore)
  const setFilters = useGraph((s) => s.setFilters)
  const status = useStatus((s) => s.status)
  const changes =
    (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)

  const gutterW = useMemo(() => {
    const maxLane = rows.reduce((m, r) => Math.max(m, r.lane, ...r.edges.map((e) => Math.max(e.fromLane, e.toLane))), 0)
    return Math.min(LEFT_PAD * 2 + (maxLane + 1) * LANE_W, MAX_GUTTER)
  }, [rows])

  // Track viewport height (for the visible window + canvas size).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    // Infinite scroll: within two screens of the bottom, fetch the next page.
    if (el.scrollHeight - (el.scrollTop + el.clientHeight) < viewportH * 2) {
      void loadMore()
    }
  }, [loadMore, viewportH])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 2)
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + 2)
  const visible = rows.slice(first, last)

  // Draw the gutter (lanes + dots) for the visible band on every scroll/resize.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = gutterW * dpr
    canvas.height = viewportH * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, gutterW, viewportH)
    ctx.lineWidth = 2

    const yMid = (i: number): number => i * ROW_H - scrollTop + ROW_H / 2
    const drawFrom = Math.max(0, first - 1)
    const drawTo = Math.min(rows.length, last + 1)

    // Edges first (so dots sit on top).
    for (let i = drawFrom; i < drawTo; i++) {
      const r = rows[i]
      const y0 = yMid(i)
      const y1 = yMid(i + 1)
      for (const e of r.edges) {
        const x0 = laneX(e.fromLane)
        const x1 = laneX(e.toLane)
        ctx.strokeStyle = laneColor(e.color)
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        if (x0 === x1) ctx.lineTo(x1, y1)
        else ctx.bezierCurveTo(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, x1, y1)
        ctx.stroke()
      }
    }
    // Dots.
    for (let i = drawFrom; i < drawTo; i++) {
      const r = rows[i]
      ctx.fillStyle = laneColor(r.color)
      ctx.beginPath()
      ctx.arc(laneX(r.lane), yMid(i), DOT_R, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [rows, scrollTop, viewportH, gutterW, first, last])

  return (
    <section className="graph-view">
      <div className="graph-filters">
        <input
          className="graph-search"
          placeholder="Search message / author / SHA…"
          value={filters.query}
          onChange={(e) => void setFilters({ query: e.target.value })}
        />
        <label>
          <input
            type="checkbox"
            checked={filters.includeRemotes}
            onChange={(e) => void setFilters({ includeRemotes: e.target.checked })}
          />
          Remotes
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.currentBranchOnly}
            onChange={(e) => void setFilters({ currentBranchOnly: e.target.checked })}
          />
          Current branch only
        </label>
      </div>

      {/* WIP node — uncommitted changes as the top node of the graph (§1.1).
          Selecting it = working mode (selectedOid === null → Staging panel). */}
      <button
        className={`wip-node${selectedOid === null ? ' selected' : ''}`}
        onClick={() => select(null)}
        title="Uncommitted changes"
      >
        <span className="wip-dot">✎</span>
        <span className="wip-label">
          {changes > 0 ? 'Uncommitted changes' : 'Working directory — clean'}
        </span>
        {changes > 0 && <span className="wip-count">{changes}</span>}
      </button>

      <div className="graph-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="graph-inner" style={{ height: rows.length * ROW_H }}>
          <canvas
            ref={canvasRef}
            className="graph-gutter"
            style={{ width: gutterW, height: viewportH }}
          />
          {visible.map((r, k) => {
            const i = first + k
            return (
              <div
                key={r.oid}
                className={`graph-row${r.oid === selectedOid ? ' selected' : ''}`}
                style={{ top: i * ROW_H, height: ROW_H, paddingLeft: gutterW }}
                onClick={() => select(r.oid)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  useUi.getState().openContext({
                    oid: r.oid,
                    shortOid: r.shortOid,
                    x: e.clientX,
                    y: e.clientY
                  })
                }}
              >
                {r.refs.map((b) => (
                  <span key={b.kind + b.name} className={badgeClass(b.kind)}>
                    {b.name}
                  </span>
                ))}
                <span className="msg" title={r.summary}>
                  {r.summary || '(no message)'}
                </span>
                <span className="author">{r.authorName}</span>
                <code className="sha">{r.shortOid}</code>
                <span className="time">{relTime(r.timeUnix)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {rows.length === 0 && !loading && <p className="graph-empty">No commits.</p>}
      {loading && <p className="graph-loading">Loading…</p>}
      {nextCursor === null && rows.length > 0 && <p className="graph-end">— end —</p>}
    </section>
  )
}
