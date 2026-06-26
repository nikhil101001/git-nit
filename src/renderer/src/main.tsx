import React from 'react'
import { createRoot } from 'react-dom/client'

import './monaco-setup' // configures Monaco's bundled loader + worker (M2)
import App from './App'
import './app.css'
import './diff.css' // diff viewer layout + syntax highlighting (pur-black palette)

// On macOS the native title bar is hidden (see main/index.ts); flag it so the
// toolbar leaves room for the traffic lights.
if (/Mac/i.test(navigator.platform || navigator.userAgent)) {
  document.documentElement.classList.add('is-mac')
}

const container = document.getElementById('app')
if (!container) throw new Error('#app root element not found')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
