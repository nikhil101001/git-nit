// Relative time formatting shared by the graph rows and commit detail.

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function relTime(unixSeconds: number): string {
  const diffMs = unixSeconds * 1000 - Date.now()
  const mins = Math.round(diffMs / 60000)
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return rtf.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return rtf.format(months, 'month')
  return rtf.format(Math.round(months / 12), 'year')
}
