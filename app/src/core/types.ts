import { DEFAULT_BLOCKS } from '@aero/shared/block-defaults'

export type BlockType = string
export type StructureType = 'machine' | 'tank' | 'reactor' | 'custom'
export type PortMode = 'input' | 'output' | 'input_output'
export type IOType = 'energy' | 'fluid' | 'gas' | 'item'
export type SlotRole = 'input' | 'output' | 'fuel'
export type IoMode = 'input' | 'output' | 'display'
export type ArrowDirection = 'right' | 'left' | 'up' | 'down'
export type GuiComponentType = 'slot' | 'big_slot' | 'energy_bar' | 'progress_arrow' | 'flame' | 'fluid_tank' | 'gas_tank' | 'fluid_tank_small' | 'gas_tank_small' | 'separator'
export type BlockCategory = 'mod' | 'vanilla' | 'custom'

export interface BlockDef {
  id: string
  category: BlockCategory
  label: string
  color: number
  char: string
  portType?: IOType
  builtIn: boolean
  mcId?: number
  terrainIndex?: number
  /** Relative or absolute path to a custom texture PNG for this block */
  texturePath?: string
  modId?: string
  modName?: string
}

export interface BlockEntry {
  type: string  // BlockType or custom block id
  mode: PortMode
  portType?: IOType
  isController?: boolean
}

// Dynamic registry: starts with built-in blocks, extended by MCP custom blocks
export const blockRegistry = new Map<string, BlockDef>()
for (const b of DEFAULT_BLOCKS) {
  const category = b.category as BlockCategory
  blockRegistry.set(b.id, {
    id: b.id,
    category,
    label: b.label,
    color: b.color,
    char: b.char,
    portType: b.portType as IOType | undefined,
    builtIn: true,
    mcId: b.mcId,
    terrainIndex: b.terrainIndex,
  })
}


export function getBlockInfo(type: string): { color: number; label: string; char: string } {
  const reg = blockRegistry.get(type)
  if (reg) return reg
  return { color: 0xff00ff, label: type, char: '?' }
}

export interface GuiComponent {
  type: GuiComponentType
  x: number
  y: number
  w: number
  h: number
  slotType: SlotRole | null
  ioMode: IoMode
  direction?: ArrowDirection
}

export const GUI_COMP_DEFS: Record<GuiComponentType, { w: number; h: number; label: string; resizable: boolean; slotType?: SlotRole; ioMode: IoMode }> = {
  slot: { w: 18, h: 18, label: 'Slot', resizable: false, slotType: 'input', ioMode: 'input' },
  big_slot: { w: 26, h: 26, label: 'Big Slot', resizable: false, slotType: 'output', ioMode: 'output' },
  energy_bar: { w: 8, h: 54, label: 'Energy Bar', resizable: true, ioMode: 'display' },
  progress_arrow: { w: 24, h: 17, label: 'Progress Arrow', resizable: false, ioMode: 'display' },
  flame: { w: 14, h: 14, label: 'Flame', resizable: false, ioMode: 'display' },
  fluid_tank: { w: 18, h: 54, label: 'Fluid Tank', resizable: true, ioMode: 'input' },
  gas_tank: { w: 18, h: 54, label: 'Gas Tank', resizable: true, ioMode: 'input' },
  fluid_tank_small: { w: 18, h: 27, label: 'Fluid S', resizable: true, ioMode: 'input' },
  gas_tank_small: { w: 18, h: 27, label: 'Gas S', resizable: true, ioMode: 'input' },
  separator: { w: 162, h: 2, label: 'Separator', resizable: true, ioMode: 'display' },
}
