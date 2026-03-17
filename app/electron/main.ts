const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const WsLib = require('ws')

let mainWindow: any

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Aero Machine Maker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In dev, load vite dev server; in prod, load built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.setMenuBarVisibility(false)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

// IPC handlers
ipcMain.handle('save-file', async (_event: any, { filePath, content }: any) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-dialog', async (_event: any, { defaultPath, filters }: any) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('open-dialog', async (_event: any, { filters }: any) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: filters || [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('read-file', async (_event: any, filePath: string) => {
  try { return fs.readFileSync(filePath, 'utf-8') }
  catch { return null }
})

ipcMain.handle('read-file-base64', async (_event: any, filePath: string) => {
  try { return fs.readFileSync(filePath).toString('base64') }
  catch { return null }
})

ipcMain.handle('get-project-root', () => path.resolve(__dirname, '..', '..', '..', '..'))

ipcMain.handle('list-directory', async (_event: any, dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) return []
    return fs.readdirSync(dirPath).filter((f: string) => !f.startsWith('.'))
  } catch { return [] }
})


ipcMain.handle('select-directory', async (_event: any, { defaultPath }: any) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: defaultPath || undefined,
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ---------------------------------------------------------------------------
// MCP Live Sync — Electron IS the WebSocket server, MCP connects as client
// ---------------------------------------------------------------------------
const WS_PORT = 19400
let wsServer: any = null
let mcpClients: Set<any> = new Set()
let pendingWsMessages: any[] = []
let webContentsReady = false

function sendToRenderer(channel: string, ...args: any[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (webContentsReady) {
    mainWindow.webContents.send(channel, ...args)
  } else {
    pendingWsMessages.push({ channel, args })
  }
}

function flushPendingMessages() {
  webContentsReady = true
  for (const { channel, args } of pendingWsMessages) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args)
    }
  }
  pendingWsMessages = []
}

function startWsServer() {
  try {
    wsServer = new WsLib.Server({ port: WS_PORT })

    wsServer.on('connection', (ws: any) => {
      mcpClients.add(ws)
      sendToRenderer('mcp-ws-status', true)

      ws.on('message', (data: any) => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        try {
          const msg = JSON.parse(data.toString())
          sendToRenderer('mcp-ws-message', msg)
        } catch (_: any) {}
      })

      ws.on('close', () => {
        mcpClients.delete(ws)
        if (mcpClients.size === 0) {
          sendToRenderer('mcp-ws-status', false)
        }
      })

      ws.on('error', () => {
        mcpClients.delete(ws)
      })
    })

    wsServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`WS port ${WS_PORT} in use — falling back to file sync`)
      }
    })
  } catch (_: any) {}
}

// File-based fallback for when WS is not available
const MCP_SYNC_FILE = path.resolve(__dirname, '..', '..', '..', 'temp', 'mcp_state.json')
let lastSyncContent = ''

function startFileFallbackSync() {
  const syncDir = path.dirname(MCP_SYNC_FILE)
  if (!fs.existsSync(syncDir)) {
    fs.mkdirSync(syncDir, { recursive: true })
  }

  try {
    fs.watch(syncDir, (eventType: string, filename: string | null) => {
      if (filename === 'mcp_state.json' && mcpClients.size === 0) {
        try {
          const content = fs.readFileSync(MCP_SYNC_FILE, 'utf-8')
          if (content !== lastSyncContent && content.length > 0) {
            lastSyncContent = content
            sendToRenderer('mcp-ws-message', { type: 'state', payload: JSON.parse(content) })
          }
        } catch (_: any) {}
      }
    })
  } catch (_: any) {}
}

// IPC: renderer asks for the last known MCP sync state (on startup)
ipcMain.handle('get-mcp-sync-state', () => {
  try {
    if (fs.existsSync(MCP_SYNC_FILE)) {
      return fs.readFileSync(MCP_SYNC_FILE, 'utf-8')
    }
  } catch (_: any) {}
  return null
})

app.whenReady().then(() => {
  startWsServer()
  startFileFallbackSync()
})

// When the main window finishes loading, flush any queued WS messages
app.on('browser-window-created', (_: any, win: any) => {
  win.webContents.on('did-finish-load', () => {
    flushPendingMessages()
  })
})

ipcMain.handle('export-to-mod', async (_event: any, { files }: any) => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  const results: any[] = []
  for (const file of files) {
    const fullPath = path.join(projectRoot, file.relativePath)
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, file.content, 'utf-8')
      results.push({ path: file.relativePath, success: true })
    } catch (err: any) {
      results.push({ path: file.relativePath, success: false, error: err.message })
    }
  }
  return results
})
