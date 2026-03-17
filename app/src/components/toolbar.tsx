import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/hooks/use-store'
import { ExportModal } from '@/components/export-modal'

export function Toolbar() {
  const name = useStore((s) => s.name)
  const projectPath = useStore((s) => s.projectPath)
  const [fileOpen, setFileOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!fileOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fileOpen])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'n') {
        e.preventDefault()
        useStore.getState().newProject()
      } else if (ctrl && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        useStore.getState().saveProjectAs()
      } else if (ctrl && e.key === 's') {
        e.preventDefault()
        useStore.getState().saveProject()
      } else if (ctrl && e.key === 'o') {
        e.preventDefault()
        useStore.getState().openProject()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const fileName = projectPath ? projectPath.split(/[\\/]/).pop() : null

  const importDictionary = async () => {
    const api = (window as any).api
    if (!api) return
    const filePath = await api.openDialog([{ name: 'Aero Dictionary', extensions: ['json'] }])
    if (filePath) {
      await useStore.getState().loadDictionary(filePath)
    }
  }

  return (
    <>
      {/* Menu bar */}
      <div className="flex items-center justify-between px-2 py-0.5 bg-zinc-900 border-b border-zinc-800 text-xs select-none">
        <div className="flex items-center gap-0.5">
          <div ref={menuRef} className="relative">
            <button
              className={`px-2 py-0.5 rounded text-xs cursor-pointer ${fileOpen ? 'bg-zinc-700 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
              onClick={() => setFileOpen(!fileOpen)}
            >
              File
            </button>
            {fileOpen && (
              <div className="absolute left-0 top-full mt-0.5 z-50 bg-zinc-800 border border-zinc-600 rounded shadow-xl py-0.5 min-w-[220px]">
                <MenuItem label="New Project" shortcut="Ctrl+N" onClick={() => { useStore.getState().newProject(); setFileOpen(false) }} />
                <MenuItem label="Open Project..." shortcut="Ctrl+O" onClick={() => { useStore.getState().openProject(); setFileOpen(false) }} />
                <div className="border-t border-zinc-600 my-0.5" />
                <MenuItem label="Save" shortcut="Ctrl+S" onClick={() => { useStore.getState().saveProject(); setFileOpen(false) }} />
                <MenuItem label="Save As..." shortcut="Ctrl+Shift+S" onClick={() => { useStore.getState().saveProjectAs(); setFileOpen(false) }} />
                <div className="border-t border-zinc-600 my-0.5" />
                <MenuItem label="Import JSON" onClick={() => { useStore.getState().importJSON(); setFileOpen(false) }} />
                <MenuItem label="Export JSON" onClick={() => { useStore.getState().exportJSON(); setFileOpen(false) }} />
                <div className="border-t border-zinc-600 my-0.5" />
                <MenuItem label="Load Dictionary..." onClick={() => { importDictionary(); setFileOpen(false) }} />
                <MenuItem label="Reload All Dictionaries" onClick={() => { useStore.getState().loadAllDictionaries(); setFileOpen(false) }} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${useStore.getState().dictionaryLoaded ? 'bg-blue-400' : 'bg-zinc-700'}`} />
            {useStore.getState().dictionaryInfo || 'No Dictionary'}
          </div>
          <Button variant="success" size="sm" className="h-5 text-[10px] px-2" onClick={() => setExportOpen(true)}>
            Export to Mod
          </Button>
        </div>
      </div>

      {/* Title bar */}
      <div className="flex items-center px-4 py-1.5 bg-background border-b border-border">
        <span className="text-sm font-semibold">Aero Machine Maker</span>
        <span className="text-sm text-muted-foreground ml-3">{name}</span>
        {fileName && <span className="text-xs text-zinc-600 ml-2">— {fileName}</span>}
      </div>

      {/* Export modal */}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  )
}

function MenuItem({ label, shortcut, onClick }: { label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      className="w-full flex items-center justify-between px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer"
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut && <span className="text-zinc-500 ml-6 text-[10px]">{shortcut}</span>}
    </button>
  )
}
