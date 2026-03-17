import { Card, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useStore } from '@/hooks/use-store'
import { blockRegistry, type IOType } from '@/core/types'

const PORT_TYPES: { type: IOType; label: string; color: string }[] = [
  { type: 'energy', label: 'Energy', color: '#fbbf24' },
  { type: 'fluid', label: 'Fluid', color: '#3b82f6' },
  { type: 'gas', label: 'Gas', color: '#a3a3a3' },
  { type: 'item', label: 'Item', color: '#f97316' },
]

export function RightPanel() {
  const blocks = useStore((s) => s.blocks)
  const selectedBlocks = useStore((s) => s.selectedBlocks)
  const removeSelectedBlocks = useStore((s) => s.removeSelectedBlocks)
  const placeBlock = useStore((s) => s.placeBlock)

  // Count blocks by type
  const counts: Record<string, number> = {}
  for (const [, block] of blocks) {
    counts[block.type] = (counts[block.type] || 0) + 1
  }

  const isSingle = selectedBlocks.length === 1
  const selKey = isSingle ? selectedBlocks[0] : null
  const selEntry = selKey ? blocks.get(selKey) : null
  const selCoords = selKey?.split(',').map(Number)

  return (
    <div className="w-56 bg-background border-l border-border overflow-y-auto p-3 space-y-3 shrink-0">
      {selectedBlocks.length > 0 && (
        <Card>
          <CardTitle>{isSingle ? 'Selected Block' : `${selectedBlocks.length} Blocks Selected`}</CardTitle>

          {isSingle && selEntry && selCoords && (
            <>
              <p className="text-xs text-muted-foreground">
                Position: <span className="text-foreground font-bold">{selKey}</span>
              </p>
              <Label>Type</Label>
              <Select
                value={selEntry.type}
                onChange={(e) => {
                  placeBlock(selCoords[0], selCoords[1], selCoords[2], e.target.value as any, selEntry.mode)
                }}
              >
                {[...blockRegistry.values()].map((def) => (
                  <option key={def.id} value={def.id}>{def.label}</option>
                ))}
              </Select>

              <Label>Identity Role</Label>
              <div className="grid grid-cols-1 gap-1 text-xs mb-2">
                <Button
                  variant={!selEntry.isController && !selEntry.portType ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => useStore.getState().setBlockRole(selKey!, 'none')}
                >
                  Normal Block
                </Button>
                <Button
                  variant={selEntry.isController ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => useStore.getState().setBlockRole(selKey!, 'controller')}
                >
                  Machine Controller
                </Button>
                <Button
                  variant={!!selEntry.portType ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => useStore.getState().setBlockRole(selKey!, 'port')}
                >
                  I/O Port
                </Button>
              </div>

              {/* Port configuration — shown when port role is active */}
              {!!selEntry.portType && (
                <>
                  <Label>Port Type</Label>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {PORT_TYPES.map(({ type, label, color }) => (
                      <button
                        key={type}
                        onClick={() => useStore.getState().setBlockRole(selKey!, 'port', type)}
                        className={`px-1.5 py-1 rounded border transition-colors flex items-center justify-center gap-1 ${selEntry.portType === type ? 'border-primary bg-primary/20 text-primary' : 'border-border hover:bg-muted/50'
                          }`}
                      >
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        {label}
                      </button>
                    ))}
                  </div>

                  <Label className="mt-2">Default Mode</Label>
                  <Select
                    value={selEntry.mode}
                    onChange={(e) => {
                      placeBlock(selCoords[0], selCoords[1], selCoords[2], selEntry.type, e.target.value as any)
                    }}
                  >
                    <option value="input">Input</option>
                    <option value="output">Output</option>
                    <option value="input_output">Input/Output</option>
                  </Select>
                </>
              )}
            </>
          )}

          <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => removeSelectedBlocks()}>
            {isSingle ? 'Delete Block' : 'Delete Selection'}
          </Button>
        </Card>
      )}

      <Card>
        <CardTitle>Structure Summary</CardTitle>
        <div className="space-y-0.5 text-xs">
          <p>Total blocks: <span className="font-bold text-foreground">{blocks.size}</span></p>
          {[...blockRegistry.values()].map((def) => (
            counts[def.id] ? <p key={def.id}>{def.label}: <span className="font-bold text-foreground">{counts[def.id]}</span></p> : null
          ))}
        </div>
      </Card>
    </div>
  )
}
