import { useStore } from '@/hooks/use-store'
import { blockRegistry, getBlockInfo } from '@/core/types'

export function BuildGuide() {
  const blocks = useStore((s) => s.blocks)
  const dimensions = useStore((s) => s.dimensions)
  const name = useStore((s) => s.name)
  const blockId = useStore((s) => s.blockId)

  const { w, h, d } = dimensions

  // Count real blocks
  const materialCounts: Record<string, number> = {}
  for (const [, entry] of blocks) {
    materialCounts[entry.type] = (materialCounts[entry.type] || 0) + 1
  }
  const totalBlocks = [...Object.values(materialCounts)].reduce((a, b) => a + b, 0)

  // Build layers with conceptual types
  const layers: { y: number; grid: ({ type: string; mode: string } | null)[][] }[] = []
  for (let y = 0; y < h; y++) {
    const grid: ({ type: string; mode: string } | null)[][] = []
    for (let z = 0; z < d; z++) {
      const row: ({ type: string; mode: string } | null)[] = []
      for (let x = 0; x < w; x++) {
        const entry = blocks.get(`${x},${y},${z}`)
        row.push(entry ? { type: entry.type, mode: entry.mode } : null)
      }
      grid.push(row)
    }
    layers.push({ y, grid })
  }

  // Collect used conceptual types for legend
  const usedTypes = new Set<string>()
  for (const [, entry] of blocks) usedTypes.add(entry.type)

  return (
    <div className="p-3 space-y-3">
      {/* Real blocks summary — materials list */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="font-semibold text-foreground">Materials:</span>
        {Object.entries(materialCounts).map(([type, count]) => {
          const info = getBlockInfo(type)
          const hexColor = `#${info.color.toString(16).padStart(6, '0')}`
          return (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-white/20"
                style={{ backgroundColor: hexColor }}
              />
              {info.label} x{count}
            </span>
          )
        })}
        <span className="text-muted-foreground">
          Total: {totalBlocks}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="text-muted-foreground">Legend:</span>
        {[...usedTypes].map((type) => {
          const info = getBlockInfo(type)
          const def = blockRegistry.get(type)
          const hexColor = `#${info.color.toString(16).padStart(6, '0')}`
          return (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-white/20"
                style={{ backgroundColor: hexColor }}
              />
              <span className="font-mono">{def?.char || '?'}</span>
              <span className="text-muted-foreground">{info.label}</span>
            </span>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Port positions are metadata overlays — the underlying block type is what gets placed in-game.
      </p>

      {/* Layer-by-layer grid */}
      <div className="flex gap-3 flex-wrap">
        {layers.map(({ y, grid }) => {
          const hasBlocks = grid.some(row => row.some(cell => cell !== null))
          if (!hasBlocks) return null

          return (
            <div key={y} className="border border-border rounded p-2 bg-card">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Y={y} {y === 0 ? '(bottom)' : y === h - 1 ? '(top)' : ''}
              </div>
              <div className="inline-flex flex-col gap-px">
                {grid.map((row, z) => (
                  <div key={z} className="flex gap-px">
                    {row.map((cell, x) => {
                      if (!cell) {
                        return (
                          <div
                            key={x}
                            className="w-7 h-7 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] text-zinc-700"
                            title={`Air at (${x}, ${y}, ${z})`}
                          >
                            ·
                          </div>
                        )
                      }
                      const info = getBlockInfo(cell.type)
                      const def = blockRegistry.get(cell.type)
                      const hexColor = `#${info.color.toString(16).padStart(6, '0')}`
                      const ch = def?.char || '?'
                      return (
                        <div
                          key={x}
                          className="w-7 h-7 rounded-sm border border-white/20 flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: hexColor }}
                          title={`${info.label} (${cell.type}) [${cell.mode}] at (${x}, ${y}, ${z})`}
                        >
                          {ch}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
