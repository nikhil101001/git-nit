// Main-process entry point: app lifecycle + the single window.
//
// Security posture (per SPEC §3.2 / §5): contextIsolation on, nodeIntegration
// off, and the renderer can only reach the small contextBridge surface in the
// preload. External links open in the OS browser, never in-app. (sandbox is left
// off so the bundled CJS preload loads cleanly; it can be tightened later since
// the preload only touches ipcRenderer/contextBridge.)

import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'

import { registerIpc } from './ipc'
import { state } from './state'

// In production (file:// load) lock the renderer down with a strict CSP: only
// our own bundled scripts, no remote content, no eval. (Skipped in dev, where
// the Vite dev server injects its own inline scripts / HMR websocket.)
function applyProdCsp(): void {
  if (process.env['ELECTRON_RENDERER_URL']) return
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
        ]
      }
    })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'git-nit',
    backgroundColor: '#1e1e22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Open target=_blank / window.open links in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL (the Vite dev server) in dev;
  // load the built HTML in production.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  applyProdCsp()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void state.watcher?.close()
})
