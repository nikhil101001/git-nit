// Lightweight syntax highlighting for the diff viewer. Uses highlight.js's
// "common" bundle (≈37 languages) and highlights one diff line at a time —
// highlight.js HTML-escapes its input, so the returned markup is safe to inject.
// Per-line highlighting can't carry multi-line constructs (block comments,
// template strings), which is an accepted trade-off for diff display.

import hljs from 'highlight.js/lib/common'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', json5: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  md: 'markdown', markdown: 'markdown',
  rs: 'rust', py: 'python', go: 'go', rb: 'ruby', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
  sql: 'sql', php: 'php', swift: 'swift', lua: 'lua', r: 'r', dart: 'dart'
}

/** Infer a highlight.js language id from a file path, or null when unknown. */
export function langFromPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const lang = EXT_LANG[ext]
  return lang && hljs.getLanguage(lang) ? lang : null
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

/** Highlight one line of code → safe HTML. Falls back to escaped plain text. */
export function highlightLine(content: string, lang: string | null): string {
  if (content === '') return ' ' // keep empty rows full-height
  if (!lang) return escapeHtml(content)
  try {
    return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(content)
  }
}
