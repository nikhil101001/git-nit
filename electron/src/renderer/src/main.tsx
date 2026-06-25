import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './app.css'

const container = document.getElementById('app')
if (!container) throw new Error('#app root element not found')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
