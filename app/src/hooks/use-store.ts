import { create } from 'zustand'
import { toast } from 'sonner'
import type { BlockType, StructureType, IOType, PortMode, BlockEntry, GuiComponent, GuiComponentType, SlotRole, IoMode, BlockDef, BlockCategory } from '@/core/types'
import { GUI_COMP_DEFS, blockRegistry, getBlockInfo } from '@/core/types'
import { registerBlockTexture, clearMaterialCache } from '@/core/textures'

const DEFAULT_GUI_W = 176
const DEFAULT_GUI_H = 166

// Serialized JSON format (matches MCP server output)
export interface SerializedMultiblock {
  projectType?: ProjectType
  name: string
  structType: StructureType
  dimensions: [number, number, number]
  ioTypes: IOType[]
  capacity: { energy: number; fluid: number; gas: number }
  processTime: number
  energyPerTick: number
  blockId: number
  defaultShellBlock?: string
  guiWidth?: number
  guiHeight?: number
  controllerPos?: string
  structure: { layer: number; pattern: string[][] }[]
  legend: Record<string, string>
  portModes: Record<string, PortMode>
  portTypes?: Record<string, IOType>
  guiComponents: GuiComponent[]
  model?: { name: string; elements: { name: string; from: [number, number, number]; to: [number, number, number] }[]; textureName: string }
  registry?: BlockDef[]
  /** Saved model/animation/texture data (portable — content, not paths) */
  animConfig?: {
    objContent: string | null
    textureDataUrl: string | null
    animJson: any | null
    stateMappings: AnimStateMapping[]
  }
  /** @deprecated Legacy field — ignored on load */
  casingId?: number
}

// Camera command from MCP WebSocket
export interface CameraCommand {
  theta?: number
  phi?: number
  radius?: number
}

// Highlight command from MCP WebSocket
export interface HighlightCommand {
  keys: string[]
  duration: number
}

export type ProjectType = 'single' | 'multiblock'

// Animation types (matches MCP server)
export interface AnimStateMapping {
  stateId: number
  label: string
  clipName: string
}

export interface AnimationConfig {
  objPath: string | null
  objContent: string | null
  bbmodelPath: string | null
  texturePath: string | null
  textureDataUrl: string | null
  animJson: any | null
  clipNames: string[]
  boneNames: string[]
  stateMappings: AnimStateMapping[]
}

export const HISTORY_LIMIT = 50

export interface StructHistoryState {
  blocks: Map<string, BlockEntry>
  dimensions: { w: number; h: number; d: number }
}

export interface GuiHistoryState {
  guiComponents: GuiComponent[]
}

interface MultiblockStore {
  // Project
  projectType: ProjectType
  projectPath: string | null

  // Structure config
  name: string
  structType: StructureType
  dimensions: { w: number; h: number; d: number }
  ioTypes: IOType[]
  capacity: { energy: number; fluid: number; gas: number }
  processTime: number
  energyPerTick: number
  blockId: number
  defaultShellBlock: string
  guiWidth: number
  guiHeight: number

  // Blocks
  blocks: Map<string, BlockEntry>
  selectedTool: string
  selectedBlocks: string[]
  layerFilter: number // -1 = all

  // GUI
  guiComponents: GuiComponent[]
  selectedCompIndex: number
  snapEnabled: boolean
  gridSize: number

  // Animation
  animConfig: AnimationConfig

  // UI
  activeTab: 'structure' | 'gui' | 'model'
  showBuildGuide: boolean
  mcpConnected: boolean

  // Block registry version (incremented when custom blocks are added/removed)
  registryVersion: number

  // Dictionary
  dictionaryLoaded: boolean
  dictionaryInfo: string | null
  loadedDictionaries: string[]

  // MCP UI commands (consumed by structure-editor)
  pendingCamera: CameraCommand | null
  pendingHighlight: HighlightCommand | null

  // History
  structPast: StructHistoryState[]
  structFuture: StructHistoryState[]
  guiPast: GuiHistoryState[]
  guiFuture: GuiHistoryState[]
  loadDictionary: (path?: string) => Promise<void>
  loadAllDictionaries: () => Promise<void>

  // Actions: project
  setProjectType: (type: ProjectType) => void

  // Actions: config
  setName: (name: string) => void
  setStructType: (type: StructureType) => void
  setDimensions: (w: number, h: number, d: number) => void
  setIOTypes: (types: IOType[]) => void
  toggleIOType: (type: IOType) => void
  setCapacity: (key: 'energy' | 'fluid' | 'gas', value: number) => void
  setProcessTime: (v: number) => void
  setEnergyPerTick: (v: number) => void
  setBlockId: (v: number) => void
  setDefaultShellBlock: (id: string) => void
  setGuiWidth: (w: number) => void
  setGuiHeight: (h: number) => void

  // Actions: blocks
  placeBlock: (x: number, y: number, z: number, type: string, mode?: PortMode) => void
  removeBlock: (x: number, y: number, z: number) => void
  fillShell: () => void
  clearBlocks: () => void
  setSelectedTool: (tool: string) => void
  setSelectedBlocks: (keys: string[]) => void
  setBlockRole: (key: string, role: 'none' | 'controller' | 'port', portType?: IOType) => void
  removeSelectedBlocks: () => void
  setPortType: (key: string, portType: IOType | null) => void
  setLayerFilter: (layer: number) => void

  // Actions: GUI
  addGuiComponent: (type: GuiComponentType, x: number, y: number, extra?: { w?: number; h?: number; slotType?: SlotRole; ioMode?: IoMode; direction?: import('@/core/types').ArrowDirection }) => void
  removeGuiComponent: (index: number) => void
  updateGuiComponent: (index: number, updates: Partial<GuiComponent>) => void
  clearGui: () => void
  loadGuiPreset: (preset: string) => void
  setSelectedComp: (index: number) => void
  setSnapEnabled: (v: boolean) => void
  setGridSize: (v: number) => void

  // Actions: undo/redo
  undo: () => void
  redo: () => void

  // Actions: animation
  setAnimConfig: (config: AnimationConfig) => void

  // History helpers (internal)
  _pushStruct: () => void
  _pushGui: () => void

  // Actions: UI
  setActiveTab: (tab: 'structure' | 'gui' | 'model') => void
  setShowBuildGuide: (v: boolean) => void
  setMcpConnected: (v: boolean) => void

  // Actions: MCP UI commands
  setCameraCommand: (cmd: CameraCommand) => void
  consumeCameraCommand: () => CameraCommand | null
  setHighlightCommand: (cmd: HighlightCommand) => void
  consumeHighlightCommand: () => HighlightCommand | null

  // Actions: block registry
  registerBlock: (def: BlockDef) => void
  batchRegisterBlocks: (defs: BlockDef[]) => void
  unregisterBlock: (id: string) => void

  // Actions: serialize/deserialize
  serialize: () => SerializedMultiblock
  deserialize: (data: SerializedMultiblock) => void
  exportJSON: () => Promise<void>
  importJSON: () => Promise<void>
  newProject: () => void

  // Actions: project file
  saveProject: () => Promise<void>
  saveProjectAs: () => Promise<void>
  openProject: () => Promise<void>
}

/** Parse a dictionary JSON into BlockDef array ready for registration */
function parseDictionaryBlocks(dict: any): BlockDef[] {
  const blocksToRegister: BlockDef[] = []
  const modId = dict.mod_id || 'project'
  const modName = dict.mod_name || (dict.mod_id || 'Project').split(/[_-]/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')

  const collect = (mId: string, mName: string, id: string, info: any) => {
    // Vanilla blocks use plain IDs (no prefix) for backward compat
    const blockId = mId === 'vanilla' ? id : `${mId}:${id}`
    const texturePath = info.texture
    let terrainIndex = info.terrain_index
    // Parse color: support both number and "0xRRGGBB" string
    let color = info.color
    if (typeof color === 'string') color = parseInt(color, 16) || 0x4a90e2

    // If already registered, merge missing fields (e.g. terrainIndex from dictionary into built-in)
    if (blockRegistry.has(blockId)) {
      const existing = blockRegistry.get(blockId)!
      let updated = false
      if (terrainIndex !== undefined && existing.terrainIndex === undefined) {
        existing.terrainIndex = terrainIndex
        updated = true
      }
      if (texturePath && !existing.texturePath) {
        existing.texturePath = texturePath
        updated = true
      }
      if (updated) blockRegistry.set(blockId, existing)
      return
    }

    // Use 'vanilla' category for vanilla blocks, 'mod' for everything else
    const category: BlockCategory = mId === 'vanilla' ? 'vanilla' : 'mod'

    blocksToRegister.push({
      id: blockId,
      category,
      label: info.label || id,
      color: color || 0x4a90e2,
      char: id[0].toUpperCase(),
      builtIn: false,
      mcId: info.meta,
      terrainIndex,
      texturePath,
      // Vanilla blocks don't set modId/modName (grouped by category in palette)
      ...(category !== 'vanilla' ? { modId: mId, modName: mName } : {})
    })
  }

  // Process blocks (nested categories like machines, energy, etc.)
  if (dict.blocks) {
    const traverse = (obj: any) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object') {
          if ((v as any).label) collect(modId, modName, k, v)
          else traverse(v)
        }
      }
    }
    traverse(dict.blocks)
  }

  // Process external blocks (from project dictionaries)
  if (dict.external_blocks) {
    for (const extModId of Object.keys(dict.external_blocks)) {
      const mod = dict.external_blocks[extModId]
      const extModName = mod.main_class?.replace('mod_', '').split(/[_-]/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || extModId
      if (mod.blocks) {
        for (const [id, info] of Object.entries(mod.blocks)) {
          collect(extModId, extModName, id, info as any)
        }
      }
    }
  }

  return blocksToRegister
}


function snap(val: number, enabled: boolean, gridSize: number): number {
  if (!enabled || gridSize <= 1) return Math.round(val)
  return Math.round(val / gridSize) * gridSize
}

export const useStore = create<MultiblockStore>((set, get) => ({
  // Initial state
  projectType: 'multiblock',
  projectPath: null,
  name: 'MegaCrusher',
  structType: 'machine',
  dimensions: { w: 3, h: 3, d: 3 },
  ioTypes: ['energy', 'item'],
  capacity: { energy: 64000, fluid: 0, gas: 0 },
  processTime: 200,
  energyPerTick: 32,
  blockId: 213,
  defaultShellBlock: 'iron_block',
  guiWidth: DEFAULT_GUI_W,
  guiHeight: DEFAULT_GUI_H,
  blocks: new Map(),
  selectedTool: 'iron_block',
  selectedBlocks: [],
  layerFilter: -1,
  structPast: [],
  structFuture: [],
  guiPast: [],
  guiFuture: [],
  guiComponents: [],
  selectedCompIndex: -1,
  snapEnabled: true,
  gridSize: 9,
  animConfig: {
    objPath: null, objContent: null, bbmodelPath: null, texturePath: null, textureDataUrl: null,
    animJson: null, clipNames: [], boneNames: [], stateMappings: [],
  },
  activeTab: 'structure',
  registryVersion: 0,
  pendingCamera: null,
  pendingHighlight: null,

  // Dictionary
  dictionaryLoaded: false,
  dictionaryInfo: null,
  loadedDictionaries: [],
  loadDictionary: async (path?: string) => {
    const api = (window as any).api
    if (!api) return

    try {
      let content: string | null = null
      let dictPath = path

      if (!dictPath) {
        // Auto-discovery: try project-level dictionary
        const root = await api.getProjectRoot()
        const locations = [
          `${root}/aero_dictionary.json`,
          `${root}/retronism_dictionary.json`
        ]
        for (const loc of locations) {
          content = await api.readFile(loc)
          if (content) { dictPath = loc; break }
        }
      } else {
        content = await api.readFile(dictPath)
      }

      if (!content) {
        if (path) toast.error('Failed to read dictionary file')
        return
      }

      const dict = JSON.parse(content)
      const modId = dict.mod_id || 'project'

      // Skip if already loaded
      if (get().loadedDictionaries.includes(modId)) return

      const blocksToRegister = parseDictionaryBlocks(dict)
      get().batchRegisterBlocks(blocksToRegister)

      // Load individual custom textures for blocks that have texturePath
      let texturesLoaded = 0
      const blocksWithTextures = blocksToRegister.filter(b => b.texturePath)
      if (blocksWithTextures.length > 0) {
        for (const block of blocksWithTextures) {
          const ok = await registerBlockTexture(block.id, block.texturePath!)
          if (ok) texturesLoaded++
        }
      }

      if (texturesLoaded > 0) {
        clearMaterialCache()
        set(s => ({ registryVersion: s.registryVersion + 1 }))
      }

      set(s => ({
        dictionaryLoaded: true,
        dictionaryInfo: s.loadedDictionaries.length === 0
          ? `${modId} (${blocksToRegister.length} blocks)`
          : `${s.loadedDictionaries.length + 1} mods loaded`,
        loadedDictionaries: [...s.loadedDictionaries, modId]
      }))
      toast.success(`Dictionary: ${dict.mod_name || modId}`, {
        description: `${blocksToRegister.length} blocks loaded.`
      })
    } catch (err) {
      console.error('Failed to load dictionary:', err)
    }
  },

  loadAllDictionaries: async () => {
    const api = (window as any).api
    if (!api?.listDirectory) return

    try {
      const root: string = await api.getProjectRoot()

      // 1. Load built-in library dictionaries from tools/aero-machine-maker/dictionaries/
      const dictDir = `${root}/tools/aero-machine-maker/dictionaries`
      const files: string[] = await api.listDirectory(dictDir)
      const jsonFiles = files.filter((f: string) => f.endsWith('.json'))

      for (const file of jsonFiles) {
        await get().loadDictionary(`${dictDir}/${file}`)
      }

      // 2. Load project-level dictionary (modder's own)
      await get().loadDictionary()

      const loaded = get().loadedDictionaries
      if (loaded.length > 0) {
        const totalBlocks = [...blockRegistry.values()].filter(b => !b.builtIn).length
        set({
          dictionaryInfo: `${loaded.length} mods (${totalBlocks} blocks)`
        })
      }
    } catch (err) {
      console.error('Failed to load dictionaries:', err)
    }
  },

  // Project
  setProjectType: (projectType) => set({ projectType }),

  // Config
  setName: (name) => set({ name }),
  setStructType: (structType) => set({ structType }),
  setIOTypes: (ioTypes) => set({ ioTypes }),
  setDimensions: (w, h, d) => {
    get()._pushStruct()
    set({ dimensions: { w, h, d } })
  },
  toggleIOType: (type) => set((s) => ({
    ioTypes: s.ioTypes.includes(type)
      ? s.ioTypes.filter((t) => t !== type)
      : [...s.ioTypes, type],
  })),
  setCapacity: (key, value) => set((s) => ({ capacity: { ...s.capacity, [key]: value } })),
  setProcessTime: (processTime) => set({ processTime }),
  setEnergyPerTick: (energyPerTick) => set({ energyPerTick }),
  setBlockId: (blockId) => set({ blockId }),
  setDefaultShellBlock: (defaultShellBlock) => set({ defaultShellBlock }),
  setGuiWidth: (w) => {
    const clamped = Math.max(176, Math.min(256, w))
    set({ guiWidth: clamped })
  },
  setGuiHeight: (h) => {
    const clamped = Math.max(166, Math.min(256, h))
    set({ guiHeight: clamped })
  },

  // Blocks
  placeBlock: (x, y, z, type, mode = 'input_output') => {
    get()._pushStruct()
    const s = get()
    const { w, h, d } = s.dimensions
    if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) return
    const key = `${x},${y},${z}`

    const blocks = new Map(s.blocks)
    const def = blockRegistry.get(type)

    const portType = def?.portType || undefined

    blocks.set(key, { type, mode, portType })

    // Auto-link: placing a port auto-activates its IO type
    if (portType && !s.ioTypes.includes(portType)) {
      set({ blocks, ioTypes: [...s.ioTypes, portType] })
    } else {
      set({ blocks })
    }
  },
  removeBlock: (x, y, z) => {
    get()._pushStruct()
    set((s) => {
      const blocks = new Map(s.blocks)
      blocks.delete(`${x},${y},${z}`)
      return { blocks }
    })
  },
  fillShell: () => {
    get()._pushStruct()
    set((s) => {
      const { w, h, d } = s.dimensions
      const blocks = new Map(s.blocks)
      for (let y = 0; y < h; y++)
        for (let z = 0; z < d; z++)
          for (let x = 0; x < w; x++) {
            const isEdge = x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1
            if (isEdge && !blocks.has(`${x},${y},${z}`))
              blocks.set(`${x},${y},${z}`, { type: s.defaultShellBlock, mode: 'input_output' })
          }
      return { blocks }
    })
  },
  clearBlocks: () => {
    get()._pushStruct()
    set({ blocks: new Map(), selectedBlocks: [] })
  },
  setSelectedTool: (selectedTool) => set({ selectedTool }),
  setSelectedBlocks: (selectedBlocks) => set({ selectedBlocks }),
  removeSelectedBlocks: () => {
    get()._pushStruct()
    set((s) => {
      const blocks = new Map(s.blocks)
      for (const key of s.selectedBlocks) {
        blocks.delete(key)
      }
      return { blocks, selectedBlocks: [] }
    })
  },
  setBlockRole: (key, role, portType) => {
    get()._pushStruct()
    set((s) => {
      const block = s.blocks.get(key)
      if (!block) return s
      const blocks = new Map(s.blocks)

      if (role === 'controller') {
        // Unset previous controller
        for (const [k, b] of blocks) {
          if (b.isController && k !== key) {
            blocks.set(k, { ...b, isController: false })
          }
        }
        blocks.set(key, { ...block, isController: true, portType: undefined })
      } else if (role === 'port') {
        blocks.set(key, { ...block, isController: false, portType: portType || 'energy' })
        if (portType && !s.ioTypes.includes(portType)) {
          return { blocks, ioTypes: [...s.ioTypes, portType] }
        }
      } else {
        blocks.set(key, { ...block, isController: false, portType: undefined })
      }
      return { blocks }
    })
  },
  setPortType: (key, portType) => {
    get()._pushStruct()
    set((s) => {
      const block = s.blocks.get(key)
      if (!block) return s
      const blocks = new Map(s.blocks)
      if (portType) {
        blocks.set(key, { ...block, portType })
        // Auto-activate IO type
        if (!s.ioTypes.includes(portType)) {
          return { blocks, ioTypes: [...s.ioTypes, portType] }
        }
      } else {
        const { portType: _, ...rest } = block
        blocks.set(key, rest as BlockEntry)
      }
      return { blocks }
    })
  },
  setLayerFilter: (layerFilter) => set({ layerFilter }),

  // GUI
  addGuiComponent: (type, x, y, extra) => {
    get()._pushGui()
    set((s) => {
      const def = GUI_COMP_DEFS[type]
      if (!def) return s
      const sx = snap(x, s.snapEnabled, s.gridSize)
      const sy = snap(y, s.snapEnabled, s.gridSize)
      const comp: GuiComponent = {
        type,
        x: Math.max(3, Math.min((s.guiWidth || DEFAULT_GUI_W) - (extra?.w || def.w) - 3, sx)),
        y: Math.max(3, Math.min((s.guiHeight || DEFAULT_GUI_H) - (extra?.h || def.h) - 3, sy)),
        w: extra?.w || def.w,
        h: extra?.h || def.h,
        slotType: extra?.slotType || def.slotType || null,
        ioMode: extra?.ioMode || def.ioMode,
        ...(extra?.direction ? { direction: extra.direction } : {}),
      }
      const guiComponents = [...s.guiComponents, comp]
      return { guiComponents, selectedCompIndex: guiComponents.length - 1 }
    })
  },
  removeGuiComponent: (index) => {
    get()._pushGui()
    set((s) => {
      const guiComponents = s.guiComponents.filter((_, i) => i !== index)
      return { guiComponents, selectedCompIndex: -1 }
    })
  },
  updateGuiComponent: (index, updates) => {
    get()._pushGui()
    set((s) => {
      const guiComponents = s.guiComponents.map((c, i) => (i === index ? { ...c, ...updates } : c))
      return { guiComponents }
    })
  },
  clearGui: () => {
    get()._pushGui()
    set({ guiComponents: [], selectedCompIndex: -1 })
  },
  loadGuiPreset: (preset) => {
    get()._pushGui()
    const components: GuiComponent[] = []
    const add = (type: GuiComponentType, x: number, y: number, extra?: any) => {
      const def = GUI_COMP_DEFS[type]
      if (!def) return
      components.push({
        type,
        x: extra?.x || x,
        y: extra?.y || y,
        w: extra?.w || def.w,
        h: extra?.h || def.h,
        slotType: extra?.slotType || def.slotType || null,
        ioMode: extra?.ioMode || def.ioMode,
      })
    }

    switch (preset) {
      case 'processor':
        add('slot', 55, 34, { slotType: 'input' })
        add('progress_arrow', 79, 35)
        add('slot', 115, 34, { slotType: 'output' })
        add('energy_bar', 10, 16)
        break
      case 'dual_input':
        add('slot', 45, 25, { slotType: 'input' })
        add('slot', 45, 47, { slotType: 'input' })
        add('progress_arrow', 73, 35)
        add('big_slot', 107, 30, { slotType: 'output' })
        add('energy_bar', 10, 16)
        break
      case 'single_slot':
        add('slot', 79, 34, { slotType: 'input' })
        add('energy_bar', 161, 16)
        break
      case 'tank':
        add('fluid_tank', 80, 16)
        add('energy_bar', 10, 16)
        break
    }
    set({ guiComponents: components, selectedCompIndex: -1 })
  },
  setSelectedComp: (selectedCompIndex) => set({ selectedCompIndex }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setGridSize: (gridSize) => set({ gridSize }),

  // Animation
  setAnimConfig: (animConfig) => set({ animConfig }),

  // UI
  setActiveTab: (activeTab) => set({ activeTab }),
  showBuildGuide: false,
  setShowBuildGuide: (showBuildGuide) => set({ showBuildGuide }),
  mcpConnected: false,
  setMcpConnected: (mcpConnected) => set({ mcpConnected }),

  // MCP UI commands
  setCameraCommand: (cmd) => set({ pendingCamera: cmd }),
  consumeCameraCommand: () => {
    const cmd = get().pendingCamera
    if (cmd) set({ pendingCamera: null })
    return cmd
  },
  setHighlightCommand: (cmd) => set({ pendingHighlight: cmd }),
  consumeHighlightCommand: () => {
    const cmd = get().pendingHighlight
    if (cmd) set({ pendingHighlight: null })
    return cmd
  },

  undo: () => set((s) => {
    if (s.activeTab === 'structure') {
      if (s.structPast.length === 0) return s
      const prev = s.structPast[s.structPast.length - 1]
      const currentBlocks = new Map<string, BlockEntry>()
      for (const [k, v] of s.blocks) currentBlocks.set(k, { ...v })
      const current = { blocks: currentBlocks, dimensions: { ...s.dimensions } }
      return {
        blocks: prev.blocks,
        dimensions: prev.dimensions,
        structPast: s.structPast.slice(0, -1),
        structFuture: [current, ...s.structFuture].slice(0, HISTORY_LIMIT),
        selectedBlocks: []
      }
    } else if (s.activeTab === 'gui') {
      if (s.guiPast.length === 0) return s
      const prev = s.guiPast[s.guiPast.length - 1]
      const current = { guiComponents: s.guiComponents.map(c => ({ ...c })) }
      return {
        guiComponents: prev.guiComponents,
        guiPast: s.guiPast.slice(0, -1),
        guiFuture: [current, ...s.guiFuture].slice(0, HISTORY_LIMIT),
        selectedCompIndex: -1
      }
    }
    return s
  }),

  redo: () => set((s) => {
    if (s.activeTab === 'structure') {
      if (s.structFuture.length === 0) return s
      const next = s.structFuture[0]
      const currentBlocks = new Map<string, BlockEntry>()
      for (const [k, v] of s.blocks) currentBlocks.set(k, { ...v })
      const current = { blocks: currentBlocks, dimensions: { ...s.dimensions } }
      return {
        blocks: next.blocks,
        dimensions: next.dimensions,
        structPast: [...s.structPast, current].slice(-HISTORY_LIMIT),
        structFuture: s.structFuture.slice(1),
        selectedBlocks: []
      }
    } else if (s.activeTab === 'gui') {
      if (s.guiFuture.length === 0) return s
      const next = s.guiFuture[0]
      const current = { guiComponents: s.guiComponents.map(c => ({ ...c })) }
      return {
        guiComponents: next.guiComponents,
        guiPast: [...s.guiPast, current].slice(-HISTORY_LIMIT),
        guiFuture: s.guiFuture.slice(1),
        selectedCompIndex: -1
      }
    }
    return s
  }),

  _pushStruct: () => set((s) => {
    const clonedBlocks = new Map<string, BlockEntry>()
    for (const [k, v] of s.blocks) clonedBlocks.set(k, { ...v })
    return {
      structPast: [...s.structPast, { blocks: clonedBlocks, dimensions: { ...s.dimensions } }].slice(-HISTORY_LIMIT),
      structFuture: []
    }
  }),
  _pushGui: () => set((s) => ({
    guiPast: [...s.guiPast, { guiComponents: s.guiComponents.map(c => ({ ...c })) }].slice(-HISTORY_LIMIT),
    guiFuture: []
  })),

  // Block registry management
  registerBlock: (def) => {
    if (!blockRegistry.has(def.id)) {
      blockRegistry.set(def.id, def)
      set((s) => ({ registryVersion: s.registryVersion + 1 }))
      // Load custom texture if texturePath is provided
      if (def.texturePath) {
        registerBlockTexture(def.id, def.texturePath).then(ok => {
          if (ok) {
            clearMaterialCache()
            set((s) => ({ registryVersion: s.registryVersion + 1 }))
          }
        })
      }
    }
  },
  batchRegisterBlocks: (defs) => {
    let changed = false
    for (const def of defs) {
      if (!blockRegistry.has(def.id)) {
        blockRegistry.set(def.id, def)
        changed = true
      }
    }
    if (changed) set((s) => ({ registryVersion: s.registryVersion + 1 }))
  },
  unregisterBlock: (id) => {
    const def = blockRegistry.get(id)
    if (def && !def.builtIn) {
      blockRegistry.delete(id)
      set((s) => ({ registryVersion: s.registryVersion + 1 }))
    }
  },

  // Serialize: convert store state to JSON format matching MCP server
  serialize: () => {
    const s = get()
    const { w, h, d } = s.dimensions
    const layers: { layer: number; pattern: string[][] }[] = []
    const legend: Record<string, string> = { ' ': 'air' }

    // Build char lookup from block registry (includes custom blocks)
    const typeToChar: Record<string, string> = {}
    for (const [id, def] of blockRegistry) {
      typeToChar[id] = def.char
    }

    for (let y = 0; y < h; y++) {
      const pattern: string[][] = []
      for (let z = 0; z < d; z++) {
        const row: string[] = []
        for (let x = 0; x < w; x++) {
          const block = s.blocks.get(`${x},${y},${z}`)
          if (block) {
            const ch = typeToChar[block.type] || ' '
            row.push(ch)
            if (ch !== ' ') legend[ch] = block.type
          } else {
            row.push(' ')
          }
        }
        pattern.push(row)
      }
      layers.push({ layer: y, pattern })
    }

    // Find controller position, port modes and port types
    let controllerPos: string | undefined
    const portModes: Record<string, PortMode> = {}
    const portTypes: Record<string, IOType> = {}
    for (const [key, block] of s.blocks) {
      if (block.isController) controllerPos = key
      if (block.portType) {
        portModes[key] = block.mode
        portTypes[key] = block.portType
      }
    }

    // Include custom blocks in registry field
    const customBlocks = [...blockRegistry.values()].filter((b) => !b.builtIn)

    return {
      projectType: s.projectType,
      name: s.name,
      structType: s.structType,
      dimensions: [w, h, d] as [number, number, number],
      ioTypes: s.ioTypes,
      capacity: s.capacity,
      processTime: s.processTime,
      energyPerTick: s.energyPerTick,
      blockId: s.blockId,
      defaultShellBlock: s.defaultShellBlock,
      ...(s.guiWidth !== DEFAULT_GUI_W ? { guiWidth: s.guiWidth } : {}),
      ...(s.guiHeight !== DEFAULT_GUI_H ? { guiHeight: s.guiHeight } : {}),
      controllerPos,
      structure: layers,
      legend,
      portModes,
      portTypes: Object.keys(portTypes).length > 0 ? portTypes : undefined,
      guiComponents: s.guiComponents,
      animConfig: s.animConfig ? {
        objContent: s.animConfig.objContent,
        textureDataUrl: s.animConfig.textureDataUrl,
        animJson: s.animConfig.animJson,
        stateMappings: s.animConfig.stateMappings,
      } : undefined,
      registry: customBlocks.length > 0 ? customBlocks : undefined,
    }
  },

  deserialize: (data) => {
    // Register custom blocks from the saved registry before loading structure
    let registryChanged = false
    if (data.registry) {
      for (const def of data.registry) {
        if (!blockRegistry.has(def.id)) {
          blockRegistry.set(def.id, def)
          registryChanged = true
          // Load custom texture if texturePath is provided
          if (def.texturePath) {
            registerBlockTexture(def.id, def.texturePath).then(ok => {
              if (ok) {
                clearMaterialCache()
                set((s) => ({ registryVersion: s.registryVersion + 1 }))
              }
            })
          }
        }
      }
    }

    const charToType: Record<string, string> = {}
    for (const [ch, type] of Object.entries(data.legend)) {
      if (type === 'casing') {
        charToType[ch] = data.defaultShellBlock || 'iron_block'
      } else {
        charToType[ch] = type
      }
    }

    const blocks = new Map<string, BlockEntry>()
    for (const layer of data.structure) {
      for (let z = 0; z < layer.pattern.length; z++) {
        for (let x = 0; x < layer.pattern[z].length; x++) {
          const ch = layer.pattern[z][x]
          const type = charToType[ch]
          if (type && type !== 'air') {
            const key = `${x},${layer.layer},${z}`
            const mode = data.portModes?.[key] || 'input_output'
            const entry: BlockEntry = { type, mode }
            if (data.portTypes?.[key]) entry.portType = data.portTypes[key]
            if (key === data.controllerPos) entry.isController = true
            blocks.set(key, entry)
          }
        }
      }
    }

    // Legacy compat: portTypes on air positions → create machine_port blocks
    if (data.portTypes) {
      for (const [key, ioType] of Object.entries(data.portTypes)) {
        if (!blocks.has(key)) {
          const mode = (data.portModes?.[key] || 'input_output') as PortMode
          blocks.set(key, { type: 'machine_port', mode, portType: ioType as IOType })
        }
      }
    }

    // Restore animation config if present
    let animConfig: AnimationConfig = {
      objPath: null, objContent: null, bbmodelPath: null,
      texturePath: null, textureDataUrl: null,
      animJson: null, clipNames: [], boneNames: [], stateMappings: [],
    }
    if (data.animConfig) {
      const ac = data.animConfig
      let clipNames: string[] = []
      let boneNames: string[] = []
      if (ac.animJson) {
        if (ac.animJson.animations) clipNames = Object.keys(ac.animJson.animations)
        if (ac.animJson.pivots) boneNames = Object.keys(ac.animJson.pivots)
      }
      animConfig = {
        objPath: null,
        objContent: ac.objContent,
        bbmodelPath: null,
        texturePath: null,
        textureDataUrl: ac.textureDataUrl,
        animJson: ac.animJson,
        clipNames,
        boneNames,
        stateMappings: ac.stateMappings || [],
      }
    }

    set((s) => ({
      projectType: data.projectType || 'multiblock',
      name: data.name,
      structType: data.structType,
      dimensions: { w: data.dimensions[0], h: data.dimensions[1], d: data.dimensions[2] },
      ioTypes: data.ioTypes,
      capacity: { ...data.capacity },
      processTime: data.processTime,
      energyPerTick: data.energyPerTick,
      blockId: data.blockId,
      defaultShellBlock: data.defaultShellBlock || 'iron_block',
      guiWidth: data.guiWidth || DEFAULT_GUI_W,
      guiHeight: data.guiHeight || DEFAULT_GUI_H,
      guiComponents: data.guiComponents ? data.guiComponents.map((c) => ({
        ...c,
        ioMode: c.ioMode || GUI_COMP_DEFS[c.type]?.ioMode || 'display',
      })) : [],
      blocks,
      animConfig,
      selectedBlocks: [],
      selectedCompIndex: -1,
      structPast: [],
      structFuture: [],
      guiPast: [],
      guiFuture: [],
      ...(registryChanged ? { registryVersion: s.registryVersion + 1 } : {}),
    }))
  },

  // Export JSON via Electron file dialog
  exportJSON: async () => {
    const api = (window as any).api
    if (!api) return
    const data = get().serialize()
    const filePath = await api.saveDialog(`${data.name}.json`, [{ name: 'JSON', extensions: ['json'] }])
    if (filePath) {
      await api.saveFile(filePath, JSON.stringify(data, null, 2))
    }
  },

  importJSON: async () => {
    const api = (window as any).api
    if (!api) return
    const filePath = await api.openDialog([{ name: 'JSON', extensions: ['json'] }])
    if (filePath) {
      const content = await api.readFile(filePath)
      if (content) {
        try {
          const data = JSON.parse(content) as SerializedMultiblock
          get().deserialize(data)
        } catch { /* ignore parse errors */ }
      }
    }
  },

  newProject: () => set({
    projectType: 'multiblock',
    projectPath: null,
    name: 'Unnamed',
    structType: 'machine',
    dimensions: { w: 3, h: 3, d: 3 },
    ioTypes: ['energy', 'item'],
    capacity: { energy: 64000, fluid: 0, gas: 0 },
    processTime: 200,
    energyPerTick: 32,
    blockId: 213,
    defaultShellBlock: 'iron_block',
    guiWidth: DEFAULT_GUI_W,
    guiHeight: DEFAULT_GUI_H,
    blocks: new Map(),
    guiComponents: [],
    selectedBlocks: [],
    selectedCompIndex: -1,
    selectedTool: 'iron_block',
    layerFilter: -1,
    animConfig: {
      objPath: null, objContent: null, bbmodelPath: null,
      animJson: null, clipNames: [], boneNames: [], stateMappings: [],
      texturePath: null, textureDataUrl: null,
    },
    structPast: [],
    structFuture: [],
    guiPast: [],
    guiFuture: [],
  }),

  saveProject: async () => {
    const api = (window as any).api
    if (!api) return
    const s = get()
    if (s.projectPath) {
      const data = s.serialize()
      await api.saveFile(s.projectPath, JSON.stringify(data, null, 2))
      toast.success('Project saved')
    } else {
      await get().saveProjectAs()
    }
  },

  saveProjectAs: async () => {
    const api = (window as any).api
    if (!api) return
    const data = get().serialize()
    const filePath = await api.saveDialog(`${data.name}.aeroproject`, [
      { name: 'Aero Project', extensions: ['aeroproject'] },
      { name: 'JSON', extensions: ['json'] },
    ])
    if (filePath) {
      await api.saveFile(filePath, JSON.stringify(data, null, 2))
      set({ projectPath: filePath })
      toast.success('Project saved')
    }
  },

  openProject: async () => {
    const api = (window as any).api
    if (!api) return
    const filePath = await api.openDialog([
      { name: 'Aero Project', extensions: ['aeroproject', 'json'] },
    ])
    if (filePath) {
      const content = await api.readFile(filePath)
      if (content) {
        try {
          const data = JSON.parse(content) as SerializedMultiblock
          get().deserialize(data)
          set({ projectPath: filePath })
        } catch {
          toast.error('Failed to open project')
        }
      }
    }
  },
}))

// Bidirectional sync: send state to MCP on every change
let syncDebounce: ReturnType<typeof setTimeout> | null = null
useStore.subscribe(() => {
  if (syncDebounce) clearTimeout(syncDebounce)
  syncDebounce = setTimeout(() => {
    const api = (window as any).api
    if (!api?.sendToMcp) return
    try {
      const serialized = useStore.getState().serialize()
      api.sendToMcp({ type: 'state', payload: serialized })
    } catch (_) {}
  }, 100)
})
