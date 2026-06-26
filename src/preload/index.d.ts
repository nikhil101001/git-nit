// Ambient declaration of the contextBridge surface, so the renderer sees a typed
// `window.api`. Included by tsconfig.web.json.

import type { GitApi } from '../shared/types'

declare global {
  interface Window {
    api: GitApi
  }
}

export {}
