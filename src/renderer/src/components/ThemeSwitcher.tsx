// Theme selector (system / light / dark). Renderer-only — flips the :root
// data-theme attribute and syncs Monaco via the theme store.

import type { Theme } from '../theme-store'
import { useTheme } from '../theme-store'

export default function ThemeSwitcher(): React.JSX.Element {
  const theme = useTheme((s) => s.theme)
  return (
    <select
      className="theme-switcher"
      title="Theme"
      value={theme}
      onChange={(e) => useTheme.getState().setTheme(e.target.value as Theme)}
    >
      <option value="system">◐ System</option>
      <option value="light">☀ Light</option>
      <option value="dark">☾ Dark</option>
    </select>
  )
}
