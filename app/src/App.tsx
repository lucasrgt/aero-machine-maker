import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Toolbar } from '@/components/toolbar'
import { LeftPanel } from '@/components/left-panel'
import { RightPanel } from '@/components/right-panel'
import { StructureEditor } from '@/components/structure-editor'
import { GuiBuilder } from '@/components/gui-builder'
import { ModelEditor } from '@/components/model-editor'
import { Tabs } from '@/components/ui/tabs'
import { useStore, type SerializedMultiblock } from '@/hooks/use-store'

const MULTIBLOCK_TABS = [
  { id: 'structure', label: '3D Structure' },
  { id: 'gui', label: 'GUI Builder' },
  { id: 'model', label: 'Model' },
]
const SINGLE_TABS = [
  { id: 'gui', label: 'GUI Builder' },
]

export default function App() {
  const activeTab = useStore((s) => s.activeTab)
  const blocks = useStore((s) => s.blocks)
  const mcpConnected = useStore((s) => s.mcpConnected)
  const projectType = useStore((s) => s.projectType)
  const isMultiblock = projectType === 'multiblock'

  // Listen for MCP WebSocket messages from Electron main process
  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    // WebSocket connection status
    if (api.onMcpWsStatus) {
      api.onMcpWsStatus((connected: boolean) => {
        useStore.getState().setMcpConnected(connected)
      })
    }

    // WebSocket messages (typed: state, camera, tab, select_block, set_layer, highlight)
    if (api.onMcpWsMessage) {
      api.onMcpWsMessage((msg: { type: string; payload: any }) => {
        const store = useStore.getState()
        switch (msg.type) {
          case 'state': {
            const payload = msg.payload as SerializedMultiblock & { _mcpToolCall?: boolean }
            // Only accept MCP state if it's an explicit tool call OR the app is empty
            // This prevents MCP reconnect/sync from overwriting a user-loaded project
            if (payload._mcpToolCall || store.blocks.size === 0) {
              store.deserialize(payload)
            }
            store.setMcpConnected(true)
            break
          }
          case 'camera':
            store.setCameraCommand(msg.payload)
            break
          case 'tab':
            store.setActiveTab(msg.payload.tab)
            break
          case 'select_block':
            store.setSelectedBlocks([msg.payload.key])
            break
          case 'set_layer':
            store.setLayerFilter(msg.payload.layer)
            break
          case 'highlight':
            store.setHighlightCommand(msg.payload)
            break
        }
      })
    }

    // Legacy file-based fallback
    if (api.onMcpStateUpdate) {
      api.onMcpStateUpdate((content: string) => {
        try {
          const data = JSON.parse(content) as SerializedMultiblock
          useStore.getState().deserialize(data)
          useStore.getState().setMcpConnected(true)
        } catch { /* ignore parse errors */ }
      })
    }

    // On startup, load the last known MCP state from sync file
    // This handles the case where MCP sent state before the renderer was ready
    if (api.getMcpSyncState) {
      api.getMcpSyncState().then((content: string | null) => {
        if (content) {
          try {
            const data = JSON.parse(content) as SerializedMultiblock
            // Only apply if we still have the default empty state
            const current = useStore.getState()
            if (current.name === 'Unnamed' && current.blocks.size === 0) {
              current.deserialize(data)
              current.setMcpConnected(true)
            }
          } catch { /* ignore */ }
        }
      })
    }
    // Load all dictionaries on startup (built-in library + project)
    useStore.getState().loadAllDictionaries()
  }, [])

  // Keyboard shortcuts (Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const isCtrl = e.ctrlKey || e.metaKey
      if (isCtrl) {
        if (e.key === 'z') {
          e.preventDefault()
          if (e.shiftKey) {
            useStore.getState().redo()
          } else {
            useStore.getState().undo()
          }
        } else if (e.key === 'y') {
          e.preventDefault()
          useStore.getState().redo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex flex-col h-screen">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        <div className="flex-1 flex flex-col overflow-hidden">
          {isMultiblock && (
            <Tabs
              tabs={MULTIBLOCK_TABS}
              active={activeTab}
              onChange={(id) => useStore.getState().setActiveTab(id as any)}
            />
          )}
          <div className="flex-1 flex flex-col overflow-hidden">
            {isMultiblock && activeTab === 'structure' && <StructureEditor />}
            {isMultiblock && activeTab === 'model' && <ModelEditor />}
            {(!isMultiblock || activeTab === 'gui') && <GuiBuilder />}
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
            {isMultiblock ? (
              <span>Click: select | Right-click: place | Alt+drag: orbit | Space+drag: pan | Scroll: zoom</span>
            ) : (
              <span>Single block machine — configure GUI layout</span>
            )}
            <div className="flex items-center gap-3">
              <span className={`flex items-center gap-1 ${mcpConnected ? 'text-green-400' : 'text-muted-foreground'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${mcpConnected ? 'bg-green-400' : 'bg-muted-foreground'}`} />
                MCP {mcpConnected ? 'Connected' : 'Idle'}
              </span>
              {isMultiblock && <span>Blocks: {blocks.size}</span>}
            </div>
          </div>
        </div>
        {isMultiblock && <RightPanel />}
      </div>
      <Toaster theme="dark" position="bottom-center" />
    </div>
  )
}
