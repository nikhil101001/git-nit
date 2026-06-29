// A collapsible sidebar section: a disclosure header (caret · title · count ·
// optional action) over a body shown only when expanded. Expanding fires
// `onExpand` once so sections can lazy-load their data.

import { useEffect, useRef } from 'react'

import type { SectionId } from '../sidebar-store'
import { useSidebar } from '../sidebar-store'

interface Props {
  id: SectionId
  title: string
  count?: number | null
  /** Header-right control (e.g. a "＋" button); clicks don't toggle the section. */
  action?: React.ReactNode
  /** Called when the section becomes/starts expanded (lazy-load hook). */
  onExpand?: () => void
  children: React.ReactNode
}

export default function SidebarSection({
  id,
  title,
  count,
  action,
  onExpand,
  children
}: Props): React.JSX.Element {
  const collapsed = useSidebar((s) => s.collapsed[id])

  // Fire onExpand when the section becomes (or starts) expanded — not on every
  // render (onExpand is a fresh closure each time).
  const onExpandRef = useRef(onExpand)
  onExpandRef.current = onExpand
  useEffect(() => {
    if (!collapsed) onExpandRef.current?.()
  }, [collapsed])

  const toggle = (): void => useSidebar.getState().toggle(id)

  return (
    <section className={`sb-section${collapsed ? ' collapsed' : ''}`}>
      <header
        className="sb-head"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={`${title} section`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <span className="sb-caret" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
        <span className="sb-title">{title}</span>
        {count != null && count > 0 && <span className="sb-count">{count}</span>}
        {action && (
          <span className="sb-action" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
      </header>
      {!collapsed && <div className="sb-body">{children}</div>}
    </section>
  )
}
