// Theme store (M3): explicit light / dark / system, persisted in localStorage.
// Applies a `data-theme` attribute on :root (CSS variables react) and exposes the
// resolved light/dark value so Monaco can sync its editor theme. Renderer-only —
// no IPC, no engine.

import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'gitnit.theme'

const prefersDark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches
const resolve = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme

function apply(theme: Theme): void {
  const root = document.documentElement
  // 'system' leaves the attribute off so :root + prefers-color-scheme drive it.
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

const initial = ((): Theme => {
  const saved = localStorage.getItem(KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
})()
apply(initial)

interface ThemeState {
  theme: Theme
  effective: 'light' | 'dark'
  /** Monaco editor theme matching the effective app theme. */
  monaco: 'vs' | 'vs-dark'
  setTheme: (t: Theme) => void
}

export const useTheme = create<ThemeState>((set) => ({
  theme: initial,
  effective: resolve(initial),
  monaco: resolve(initial) === 'dark' ? 'vs-dark' : 'vs',
  setTheme: (theme) => {
    localStorage.setItem(KEY, theme)
    apply(theme)
    const effective = resolve(theme)
    set({ theme, effective, monaco: effective === 'dark' ? 'vs-dark' : 'vs' })
  }
}))

// Re-resolve when the OS theme changes while in 'system' mode.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useTheme.getState().theme === 'system') useTheme.getState().setTheme('system')
})
