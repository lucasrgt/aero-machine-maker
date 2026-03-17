const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('save-file', { filePath, content }),
  saveDialog: (defaultPath: string, filters?: any[]) => ipcRenderer.invoke('save-dialog', { defaultPath, filters }),
  openDialog: (filters?: any[]) => ipcRenderer.invoke('open-dialog', { filters }),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  readFileBase64: (filePath: string) => ipcRenderer.invoke('read-file-base64', filePath),
  getProjectRoot: () => ipcRenderer.invoke('get-project-root'),
  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),
  exportToMod: (files: any[]) => ipcRenderer.invoke('export-to-mod', { files }),
  selectDirectory: (defaultPath?: string) => ipcRenderer.invoke('select-directory', { defaultPath }),
  getMcpSyncState: () => ipcRenderer.invoke('get-mcp-sync-state'),
  // Legacy — kept for backward compat but no longer used
  onMcpStateUpdate: (callback: (data: string) => void) => {
    ipcRenderer.on('mcp-state-update', (_event: any, data: string) => callback(data))
  },
  // WebSocket-based sync: receives typed messages {type, payload}
  onMcpWsMessage: (callback: (msg: any) => void) => {
    ipcRenderer.on('mcp-ws-message', (_event: any, msg: any) => callback(msg))
  },
  onMcpWsStatus: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('mcp-ws-status', (_event: any, connected: boolean) => callback(connected))
  },
})
