// A draggable column splitter. Delta-based: on drag it adjusts `value` by the
// pointer's horizontal movement (sign +1 widens as you drag right, -1 narrows),
// clamped to [min, max]. Used between the sidebar/center and center/right panes.

interface Props {
  value: number
  onChange: (n: number) => void
  /** +1 when the resized pane is to the LEFT of the handle, -1 when to the RIGHT. */
  sign: 1 | -1
  min: number
  max: number
}

export default function ResizeHandle({ value, onChange, sign, min, max }: Props): React.JSX.Element {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const startX = e.clientX
    const startValue = value

    const move = (ev: PointerEvent): void => {
      const next = Math.min(max, Math.max(min, startValue + sign * (ev.clientX - startX)))
      onChange(next)
    }
    const up = (): void => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  return <div className="resize-handle" onPointerDown={onPointerDown} role="separator" aria-orientation="vertical" />
}
