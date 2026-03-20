import {
  MultiblockState, BlockEntry, StructureType, IOType,
  PortMode, GuiComponent, GuiComponentType, SlotType, IoMode,
  GUI_COMP_DEFS, SerializedMultiblock, StructureLayer,
  blockRegistry, BlockDef, BlockModel, ModelElement,
  AnimationConfig, AnimStateMapping, createDefaultAnimConfig,
} from './types.js';
import { parseBbmodel, toAeroAnimJson } from './bbmodel-parser.js';

const DEFAULT_GUI_W = 176;
const DEFAULT_GUI_H = 166;

export function createDefaultState(): MultiblockState {
  return {
    name: 'Unnamed',
    structType: 'machine',
    dimensions: { w: 3, h: 3, d: 3 },
    blocks: new Map(),
    ioTypes: ['energy', 'item'],
    capacity: { energy: 64000, fluid: 0, gas: 0 },
    processTime: 200,
    energyPerTick: 32,
    blockId: 213,
    defaultShellBlock: 'iron_block',
    guiWidth: DEFAULT_GUI_W,
    guiHeight: DEFAULT_GUI_H,
    guiComponents: [],
    model: null,
    animConfig: createDefaultAnimConfig(),
  };
}

let state: MultiblockState = createDefaultState();

// Change listener for real-time sync (WebSocket broadcast)
let onChangeListener: (() => void) | null = null;
export function setOnChangeListener(fn: () => void): void {
  onChangeListener = fn;
}
function notifyChange(): void {
  if (onChangeListener) onChangeListener();
}

export function getState(): MultiblockState {
  return state;
}

export function resetState(): void {
  state = createDefaultState();
  notifyChange();
}

export function configureMultiblock(opts: {
  name?: string;
  structType?: StructureType;
  w?: number; h?: number; d?: number;
  ioTypes?: IOType[];
  capacity?: Partial<MultiblockState['capacity']>;
  processTime?: number;
  energyPerTick?: number;
  blockId?: number;
  defaultShellBlock?: string;
}): void {
  if (opts.name) state.name = opts.name;
  if (opts.structType) state.structType = opts.structType;
  if (opts.w) state.dimensions.w = opts.w;
  if (opts.h) state.dimensions.h = opts.h;
  if (opts.d) state.dimensions.d = opts.d;
  if (opts.ioTypes) state.ioTypes = opts.ioTypes;
  if (opts.capacity) state.capacity = { ...state.capacity, ...opts.capacity };
  if (opts.processTime) state.processTime = opts.processTime;
  if (opts.energyPerTick) state.energyPerTick = opts.energyPerTick;
  if (opts.blockId) state.blockId = opts.blockId;
  if (opts.defaultShellBlock) state.defaultShellBlock = opts.defaultShellBlock;
  notifyChange();
}

export function placeBlock(x: number, y: number, z: number, type: string, mode: PortMode = 'input_output', portType?: IOType): boolean {
  const { w, h, d } = state.dimensions;
  if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) return false;

  const key = `${x},${y},${z}`;

  const entry: BlockEntry = { blockId: type, mode };
  if (portType) {
    entry.portType = portType;
    if (!state.ioTypes.includes(portType)) {
      state.ioTypes.push(portType);
    }
  }
  state.blocks.set(key, entry);

  notifyChange();
  return true;
}

export function setPortType(x: number, y: number, z: number, portType: IOType | undefined, mode?: PortMode): boolean {
  const key = `${x},${y},${z}`;
  const block = state.blocks.get(key);
  if (!block) return false;

  if (portType) {
    block.portType = portType;
    if (mode) block.mode = mode;
    if (!state.ioTypes.includes(portType)) {
      state.ioTypes.push(portType);
    }
  } else {
    delete block.portType;
    block.mode = 'input_output';
  }
  notifyChange();
  return true;
}

export function setController(key: string | null, blockType?: string): boolean {
  // Clear existing controller flag
  let existingCtrlType: string | undefined;
  for (const [k, block] of state.blocks) {
    if (block.isController) {
      existingCtrlType = block.blockId;
      delete block.isController;
    }
  }
  // Mark block at new position as controller
  if (key) {
    const existing = state.blocks.get(key);
    if (blockType) {
      // Place a new block and mark as controller
      state.blocks.set(key, { blockId: blockType, mode: 'input_output', isController: true });
    } else if (existing) {
      // Mark existing block as controller
      existing.isController = true;
    } else {
      // No block at position and no type specified — use previously cleared type
      const type = existingCtrlType;
      if (!type) return false;
      state.blocks.set(key, { blockId: type, mode: 'input_output', isController: true });
    }
  }
  notifyChange();
  return true;
}

export function removeBlock(x: number, y: number, z: number): boolean {
  const result = state.blocks.delete(`${x},${y},${z}`);
  if (result) notifyChange();
  return result;
}

export function fillShell(): number {
  const { w, h, d } = state.dimensions;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const isEdge = x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1;
        if (isEdge) {
          const key = `${x},${y},${z}`;
          if (!state.blocks.has(key)) {
            state.blocks.set(key, { blockId: state.defaultShellBlock, mode: 'input_output' });
            count++;
          }
        }
      }
    }
  }
  notifyChange();
  return count;
}

export function clearBlocks(): void {
  state.blocks.clear();
  notifyChange();
}

export function addGuiComponent(type: GuiComponentType, x: number, y: number, extra?: {
  w?: number; h?: number; slotType?: SlotType; ioMode?: IoMode; direction?: 'right' | 'left' | 'up' | 'down';
}): number {
  const def = GUI_COMP_DEFS[type];
  if (!def) return -1;
  const gw = state.guiWidth || DEFAULT_GUI_W;
  const gh = state.guiHeight || DEFAULT_GUI_H;
  const comp: GuiComponent = {
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: extra?.w || def.w,
    h: extra?.h || def.h,
    slotType: extra?.slotType || def.slotType || null,
    ioMode: extra?.ioMode || def.ioMode,
    ...(extra?.direction ? { direction: extra.direction } : {}),
  };
  state.guiComponents.push(comp);
  notifyChange();
  return state.guiComponents.length - 1;
}

export function clearGui(): void {
  state.guiComponents = [];
  notifyChange();
}

export function loadGuiPreset(preset: string): void {
  clearGui();
  switch (preset) {
    // === Functional templates (based on real mod machines) ===

    // Crusher-style: 1 input → arrow → 1 output, energy bar right
    // Reference: Retronism_GuiCrusher — input(56,35), arrow(82,34), output(116,35), energy(162,17)
    case 'processor':
      addGuiComponent('slot', 55, 34, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('progress_arrow', 79, 35);
      addGuiComponent('slot', 115, 34, { slotType: 'output', ioMode: 'output' });
      addGuiComponent('energy_bar', 161, 16);
      break;

    // MegaCrusher-style: 3 parallel processing lanes, energy bar right
    // Reference: Retronism_GuiMegaCrusher — 3x (input→arrow→output) at y=17,39,61
    case 'triple_processor':
      addGuiComponent('slot', 55, 16, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('progress_arrow', 79, 17);
      addGuiComponent('slot', 115, 16, { slotType: 'output', ioMode: 'output' });
      addGuiComponent('slot', 55, 38, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('progress_arrow', 79, 39);
      addGuiComponent('slot', 115, 38, { slotType: 'output', ioMode: 'output' });
      addGuiComponent('slot', 55, 60, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('progress_arrow', 79, 61);
      addGuiComponent('slot', 115, 60, { slotType: 'output', ioMode: 'output' });
      addGuiComponent('energy_bar', 161, 16);
      break;

    // 2 inputs → arrow → 1 big output, energy bar left
    case 'dual_input':
      addGuiComponent('slot', 45, 25, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('slot', 45, 47, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('progress_arrow', 73, 35);
      addGuiComponent('big_slot', 107, 30, { slotType: 'output', ioMode: 'output' });
      addGuiComponent('energy_bar', 10, 16);
      break;

    // Generator-style: 1 fuel slot center, energy bar right
    // Reference: Retronism_GuiGenerator — fuel(80,35), energy(162,17)
    case 'generator':
      addGuiComponent('slot', 79, 34, { slotType: 'fuel', ioMode: 'input' });
      addGuiComponent('flame', 80, 16);
      addGuiComponent('energy_bar', 161, 16);
      break;

    // Pump-style: fluid tank left, bucket slot center, energy bar right
    // Reference: Retronism_GuiPump — fluid(8,17), bucket(80,35), energy(162,17)
    case 'pump':
      addGuiComponent('fluid_tank', 7, 16, { w: 14, h: 52, ioMode: 'output' });
      addGuiComponent('slot', 79, 34, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('energy_bar', 161, 16);
      break;

    // Electrolysis-style: energy left, fluid in, arrow, 2 gas tanks out
    // Reference: Retronism_GuiElectrolysis — energy(8,17), water(57,17), arrow(80,35), H2(113,17), O2(137,17)
    case 'fluid_to_gas':
      addGuiComponent('energy_bar', 7, 16);
      addGuiComponent('fluid_tank', 56, 16, { w: 14, h: 52, ioMode: 'input' });
      addGuiComponent('progress_arrow', 79, 35);
      addGuiComponent('gas_tank', 112, 16, { w: 14, h: 52, ioMode: 'output' });
      addGuiComponent('gas_tank', 136, 16, { w: 14, h: 52, ioMode: 'output' });
      break;

    // Simple: 1 slot center, energy bar right
    case 'single_slot':
      addGuiComponent('slot', 79, 34, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('energy_bar', 161, 16);
      break;

    // Tank-style: large fluid tank center, energy bar left
    case 'tank':
      addGuiComponent('fluid_tank', 80, 16, { ioMode: 'display' });
      addGuiComponent('energy_bar', 10, 16);
      break;

    // Fluid processor: fluid in → slot → arrow → slot out → fluid out
    case 'fluid_processor':
      addGuiComponent('energy_bar', 7, 16);
      addGuiComponent('fluid_tank', 26, 16, { w: 14, h: 52, ioMode: 'input' });
      addGuiComponent('slot', 55, 34, { slotType: 'input', ioMode: 'input' });
      addGuiComponent('progress_arrow', 79, 35);
      addGuiComponent('slot', 115, 34, { slotType: 'output', ioMode: 'output' });
      addGuiComponent('fluid_tank', 148, 16, { w: 14, h: 52, ioMode: 'output' });
      break;
  }
}

export function serialize(): SerializedMultiblock {
  const { w, h, d } = state.dimensions;
  const layers: StructureLayer[] = [];
  const legend: Record<string, string> = { ' ': 'air' };

  for (let y = 0; y < h; y++) {
    const pattern: string[][] = [];
    for (let z = 0; z < d; z++) {
      const row: string[] = [];
      for (let x = 0; x < w; x++) {
        const block = state.blocks.get(`${x},${y},${z}`);
        if (block) {
          const info = blockRegistry.get(block.blockId);
          if (info) {
            row.push(info.char);
            legend[info.char] = block.blockId;
          } else {
            row.push(' ');
          }
        } else {
          row.push(' ');
        }
      }
      pattern.push(row);
    }
    layers.push({ layer: y, pattern });
  }

  const portModes: Record<string, PortMode> = {};
  const portTypes: Record<string, IOType> = {};
  for (const [key, block] of state.blocks) {
    if (block.portType) {
      portModes[key] = block.mode;
      portTypes[key] = block.portType;
    }
  }

  // Find controller position (any block with category 'controller')
  let controllerPos: string | undefined;
  for (const [key, block] of state.blocks) {
    if (block.isController) {
      controllerPos = key;
      break;
    }
  }

  const customBlocks = blockRegistry.getCustom();

  return {
    name: state.name,
    structType: state.structType,
    dimensions: [w, h, d],
    ioTypes: state.ioTypes,
    capacity: state.capacity,
    processTime: state.processTime,
    energyPerTick: state.energyPerTick,
    blockId: state.blockId,
    defaultShellBlock: state.defaultShellBlock,
    ...(state.guiWidth !== DEFAULT_GUI_W ? { guiWidth: state.guiWidth } : {}),
    ...(state.guiHeight !== DEFAULT_GUI_H ? { guiHeight: state.guiHeight } : {}),
    ...(controllerPos ? { controllerPos } : {}),
    structure: layers,
    legend,
    portModes,
    ...(Object.keys(portTypes).length > 0 ? { portTypes } : {}),
    guiComponents: state.guiComponents,
    ...(state.model ? { model: state.model } : {}),
    ...(customBlocks.length > 0 ? { registry: customBlocks } : {}),
  };
}

export function getSlotInfo(): { inputs: { x: number; y: number; big: boolean }[]; outputs: { x: number; y: number; big: boolean }[] } {
  const inputs: { x: number; y: number; big: boolean }[] = [];
  const outputs: { x: number; y: number; big: boolean }[] = [];
  for (const comp of state.guiComponents) {
    if (comp.type === 'slot' || comp.type === 'big_slot') {
      const entry = { x: comp.x + 1, y: comp.y + 1, big: comp.type === 'big_slot' };
      if (comp.slotType === 'output') outputs.push(entry);
      else inputs.push(entry);
    }
  }
  return { inputs, outputs };
}

export function getComponentByType(type: GuiComponentType): GuiComponent | undefined {
  return state.guiComponents.find(c => c.type === type);
}

export function setDimensions(w: number, h: number, d: number): number {
  state.dimensions = { w, h, d };
  let removed = 0;
  for (const key of [...state.blocks.keys()]) {
    const [bx, by, bz] = key.split(',').map(Number);
    if (bx >= w || by >= h || bz >= d) {
      state.blocks.delete(key);
      removed++;
    }
  }
  notifyChange();
  return removed;
}

export function updateConfig(opts: {
  name?: string;
  structType?: StructureType;
  ioTypes?: IOType[];
  energyCapacity?: number;
  fluidCapacity?: number;
  gasCapacity?: number;
  processTime?: number;
  energyPerTick?: number;
  blockId?: number;
  defaultShellBlock?: string;
  guiWidth?: number;
  guiHeight?: number;
}): void {
  if (opts.name !== undefined) state.name = opts.name;
  if (opts.structType !== undefined) state.structType = opts.structType;
  if (opts.ioTypes !== undefined) state.ioTypes = opts.ioTypes;
  if (opts.energyCapacity !== undefined) state.capacity.energy = opts.energyCapacity;
  if (opts.fluidCapacity !== undefined) state.capacity.fluid = opts.fluidCapacity;
  if (opts.gasCapacity !== undefined) state.capacity.gas = opts.gasCapacity;
  if (opts.processTime !== undefined) state.processTime = opts.processTime;
  if (opts.energyPerTick !== undefined) state.energyPerTick = opts.energyPerTick;
  if (opts.blockId !== undefined) state.blockId = opts.blockId;
  if (opts.defaultShellBlock !== undefined) state.defaultShellBlock = opts.defaultShellBlock;
  if (opts.guiWidth !== undefined) state.guiWidth = opts.guiWidth;
  if (opts.guiHeight !== undefined) state.guiHeight = opts.guiHeight;
  notifyChange();
}

export function removeGuiComponent(index: number): boolean {
  if (index < 0 || index >= state.guiComponents.length) return false;
  state.guiComponents.splice(index, 1);
  notifyChange();
  return true;
}

export function updateGuiComponent(index: number, opts: {
  x?: number; y?: number; w?: number; h?: number; slotType?: SlotType; ioMode?: IoMode;
}): boolean {
  if (index < 0 || index >= state.guiComponents.length) return false;
  const comp = state.guiComponents[index];
  const gw = state.guiWidth || DEFAULT_GUI_W;
  const gh = state.guiHeight || DEFAULT_GUI_H;
  if (opts.x !== undefined) comp.x = Math.round(opts.x);
  if (opts.y !== undefined) comp.y = Math.round(opts.y);
  if (opts.w !== undefined) comp.w = opts.w;
  if (opts.h !== undefined) comp.h = opts.h;
  if (opts.slotType !== undefined) comp.slotType = opts.slotType;
  if (opts.ioMode !== undefined) comp.ioMode = opts.ioMode;
  notifyChange();
  return true;
}

export function deserialize(data: SerializedMultiblock): void {
  // Register custom blocks from the saved registry before loading structure
  if (data.registry) {
    for (const def of data.registry) {
      if (!blockRegistry.has(def.id)) {
        blockRegistry.register(def);
      }
    }
  }

  state.name = data.name;
  state.structType = data.structType;
  state.dimensions = { w: data.dimensions[0], h: data.dimensions[1], d: data.dimensions[2] };
  state.ioTypes = data.ioTypes;
  state.capacity = { ...data.capacity };
  state.processTime = data.processTime;
  state.energyPerTick = data.energyPerTick;
  state.blockId = data.blockId;
  state.defaultShellBlock = data.defaultShellBlock || 'iron_block';
  state.guiWidth = data.guiWidth || DEFAULT_GUI_W;
  state.guiHeight = data.guiHeight || DEFAULT_GUI_H;
  state.guiComponents = data.guiComponents ? data.guiComponents.map(c => ({
    ...c,
    ioMode: c.ioMode || GUI_COMP_DEFS[c.type]?.ioMode || 'display',
  })) : [];
  state.model = data.model || null;

  state.blocks.clear();
  const charToType: Record<string, string> = {};
  for (const [ch, type] of Object.entries(data.legend)) {
    // Legacy compat: map old 'casing'/'controller' to defaultShellBlock
    if (type === 'casing') {
      charToType[ch] = state.defaultShellBlock;
    } else if (type === 'controller') {
      charToType[ch] = state.defaultShellBlock;
    } else {
      charToType[ch] = type;
    }
  }
  for (const layer of data.structure) {
    for (let z = 0; z < layer.pattern.length; z++) {
      for (let x = 0; x < layer.pattern[z].length; x++) {
        const ch = layer.pattern[z][x];
        let type = charToType[ch];
        if (type && type !== 'air') {
          const key = `${x},${layer.layer},${z}`;
          const mode = data.portModes?.[key] || 'input_output';
          const entry: BlockEntry = { blockId: type, mode: mode as PortMode };

          // Load portType metadata
          if (data.portTypes?.[key]) {
            entry.portType = data.portTypes[key];
          }

          state.blocks.set(key, entry);
        }
      }
    }
  }

  // Legacy compat: portTypes on air positions → create machine_port blocks
  if (data.portTypes) {
    for (const [key, ioType] of Object.entries(data.portTypes)) {
      if (!state.blocks.has(key)) {
        const mode = (data.portModes?.[key] || 'input_output') as PortMode;
        state.blocks.set(key, { blockId: 'machine_port', mode, portType: ioType });
      }
    }
  }

  // controllerPos is informational — the controller block type is already in the legend

  notifyChange();
}

// =========================================================================
// BATCH OPERATIONS
// =========================================================================

export function fillRegion(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  type: string, mode: PortMode = 'input_output', overwrite = false,
): number {
  const { w, h, d } = state.dimensions;
  let count = 0;
  for (let y = Math.max(0, y1); y <= Math.min(h - 1, y2); y++) {
    for (let z = Math.max(0, z1); z <= Math.min(d - 1, z2); z++) {
      for (let x = Math.max(0, x1); x <= Math.min(w - 1, x2); x++) {
        const key = `${x},${y},${z}`;
        if (overwrite || !state.blocks.has(key)) {
          state.blocks.set(key, { blockId: type, mode });
          count++;
        }
      }
    }
  }
  if (count > 0) notifyChange();
  return count;
}

export function replaceBlocks(fromType: string, toType: string, newMode?: PortMode): number {
  let count = 0;
  for (const [key, block] of state.blocks) {
    if (block.blockId === fromType) {
      block.blockId = toType;
      if (newMode !== undefined) block.mode = newMode;
      count++;
    }
  }
  if (count > 0) notifyChange();
  return count;
}

export function fillLayer(y: number, fillMode: 'shell' | 'all', type: string, mode: PortMode = 'input_output'): number {
  const { w, h, d } = state.dimensions;
  if (y < 0 || y >= h) return 0;
  let count = 0;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (fillMode === 'shell') {
        const isEdge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (!isEdge) continue;
      }
      const key = `${x},${y},${z}`;
      if (!state.blocks.has(key)) {
        state.blocks.set(key, { blockId: type, mode });
        count++;
      }
    }
  }
  if (count > 0) notifyChange();
  return count;
}

// =========================================================================
// LAYER OPERATIONS
// =========================================================================

export function copyLayer(srcY: number, dstY: number, overwrite = false): number {
  const { w, h, d } = state.dimensions;
  if (srcY < 0 || srcY >= h || dstY < 0 || dstY >= h) return 0;
  let count = 0;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const srcKey = `${x},${srcY},${z}`;
      const dstKey = `${x},${dstY},${z}`;
      const srcBlock = state.blocks.get(srcKey);
      if (srcBlock && (overwrite || !state.blocks.has(dstKey))) {
        state.blocks.set(dstKey, { ...srcBlock });
        count++;
      }
    }
  }
  if (count > 0) notifyChange();
  return count;
}

export function mirrorStructure(axis: 'x' | 'z'): number {
  const { w, d } = state.dimensions;
  const newBlocks = new Map<string, BlockEntry>();
  let count = 0;
  for (const [key, block] of state.blocks) {
    const [x, y, z] = key.split(',').map(Number);
    let nx: number, nz: number;
    if (axis === 'x') {
      nx = w - 1 - x;
      nz = z;
    } else {
      nx = x;
      nz = d - 1 - z;
    }
    newBlocks.set(`${nx},${y},${nz}`, { ...block });
    count++;
  }
  state.blocks = newBlocks;
  notifyChange();
  return count;
}

export function rotateStructure(): { w: number; d: number; count: number } {
  const { w, d } = state.dimensions;
  const newBlocks = new Map<string, BlockEntry>();
  let count = 0;
  for (const [key, block] of state.blocks) {
    const [x, y, z] = key.split(',').map(Number);
    // 90° CW: (x,z) → (d-1-z, x)
    const nx = d - 1 - z;
    const nz = x;
    newBlocks.set(`${nx},${y},${nz}`, { ...block });
    count++;
  }
  // Swap w and d
  state.dimensions.w = d;
  state.dimensions.d = w;
  state.blocks = newBlocks;
  notifyChange();
  return { w: d, d: w, count };
}

// =========================================================================
// SMART PLACEMENT
// =========================================================================

export type Face = 'north' | 'south' | 'east' | 'west' | 'top' | 'bottom';

export function placeOnFace(
  face: Face, type: string, mode: PortMode = 'input_output', count: number = 0, replace: boolean = false,
): number {
  const { w, h, d } = state.dimensions;
  const candidates: string[] = [];

  for (const [key, block] of state.blocks) {
    const def = blockRegistry.get(block.blockId);
    if (!def) continue;
    // By default only replace the default shell block; with replace=true, replace any block
    if (!replace && def.id !== state.defaultShellBlock) continue;
    const [x, y, z] = key.split(',').map(Number);
    let onFace = false;
    switch (face) {
      case 'north':  onFace = z === 0; break;
      case 'south':  onFace = z === d - 1; break;
      case 'west':   onFace = x === 0; break;
      case 'east':   onFace = x === w - 1; break;
      case 'top':    onFace = y === h - 1; break;
      case 'bottom': onFace = y === 0; break;
    }
    if (onFace) candidates.push(key);
  }

  // Sort candidates toward center for better placement
  candidates.sort((a, b) => {
    const [ax, ay, az] = a.split(',').map(Number);
    const [bx, by, bz] = b.split(',').map(Number);
    const aDist = Math.abs(ax - (w - 1) / 2) + Math.abs(ay - (h - 1) / 2) + Math.abs(az - (d - 1) / 2);
    const bDist = Math.abs(bx - (w - 1) / 2) + Math.abs(by - (h - 1) / 2) + Math.abs(bz - (d - 1) / 2);
    return aDist - bDist;
  });

  const toPlace = count <= 0 ? candidates.length : Math.min(count, candidates.length);
  let placed = 0;
  for (let i = 0; i < toPlace; i++) {
    state.blocks.set(candidates[i], { blockId: type, mode });
    placed++;
  }
  if (placed > 0) notifyChange();
  return placed;
}

// Keep backward compat alias
export const placePortsOnFace = placeOnFace;

export function placeRing(y: number, type: string, mode: PortMode = 'input_output'): number {
  const { w, h, d } = state.dimensions;
  if (y < 0 || y >= h) return 0;
  let count = 0;
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const isEdge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
      if (isEdge) {
        const key = `${x},${y},${z}`;
        state.blocks.set(key, { blockId: type, mode });
        count++;
      }
    }
  }
  if (count > 0) notifyChange();
  return count;
}

// =========================================================================
// QUERY
// =========================================================================

export function getBlockAt(x: number, y: number, z: number): BlockEntry | null {
  return state.blocks.get(`${x},${y},${z}`) || null;
}

export function listBlocksByType(type: string): { x: number; y: number; z: number; mode: PortMode }[] {
  const result: { x: number; y: number; z: number; mode: PortMode }[] = [];
  for (const [key, block] of state.blocks) {
    if (block.blockId === type) {
      const [x, y, z] = key.split(',').map(Number);
      result.push({ x, y, z, mode: block.mode });
    }
  }
  return result;
}

// =========================================================================
// TEMPLATES
// =========================================================================

export type TemplateName = 'crusher_3x3' | 'reactor_5x5' | 'tank_3x3' | 'smelter_3x3';

export function applyTemplate(template: TemplateName): void {
  resetState();

  switch (template) {
    case 'crusher_3x3':
      configureMultiblock({
        name: 'Crusher', structType: 'machine',
        w: 3, h: 3, d: 3,
        ioTypes: ['energy', 'item'],
        capacity: { energy: 64000 },
        processTime: 200, energyPerTick: 32,
        blockId: 213, defaultShellBlock: 'iron_block',
      });
      fillShell();
      // Mark controller and ports as metadata
      setController('1,1,0');
      setPortType(2, 1, 1, 'energy', 'input');
      setPortType(0, 1, 1, 'item', 'input_output');
      loadGuiPreset('processor');
      break;

    case 'reactor_5x5':
      configureMultiblock({
        name: 'Reactor', structType: 'reactor',
        w: 5, h: 5, d: 5,
        ioTypes: ['energy', 'fluid'],
        capacity: { energy: 256000, fluid: 32000 },
        processTime: 400, energyPerTick: 64,
        blockId: 215, defaultShellBlock: 'iron_block',
      });
      fillShell();
      // Glass top layer center
      for (let x = 1; x <= 3; x++) {
        for (let z = 1; z <= 3; z++) {
          placeBlock(x, 4, z, 'glass');
        }
      }
      setController('2,2,0');
      setPortType(4, 2, 2, 'energy', 'output');
      setPortType(0, 2, 2, 'fluid', 'input');
      setPortType(2, 2, 4, 'fluid', 'input');
      clearGui();
      addGuiComponent('energy_bar', 10, 16);
      addGuiComponent('fluid_tank', 80, 16);
      addGuiComponent('slot', 55, 34, { slotType: 'input' });
      addGuiComponent('progress_arrow', 79, 35);
      addGuiComponent('slot', 115, 34, { slotType: 'output' });
      break;

    case 'tank_3x3':
      configureMultiblock({
        name: 'Tank', structType: 'tank',
        w: 3, h: 3, d: 3,
        ioTypes: ['fluid'],
        capacity: { fluid: 64000 },
        processTime: 1, energyPerTick: 0,
        blockId: 217, defaultShellBlock: 'iron_block',
      });
      fillShell();
      // Glass front face center
      placeBlock(1, 1, 0, 'glass');
      setPortType(2, 1, 1, 'fluid', 'input_output');
      setPortType(0, 1, 1, 'fluid', 'input_output');
      loadGuiPreset('tank');
      break;

    case 'smelter_3x3':
      configureMultiblock({
        name: 'Smelter', structType: 'machine',
        w: 3, h: 3, d: 3,
        ioTypes: ['energy', 'item'],
        capacity: { energy: 48000 },
        processTime: 160, energyPerTick: 24,
        blockId: 219, defaultShellBlock: 'iron_block',
      });
      fillShell();
      setController('1,1,0');
      setPortType(2, 1, 1, 'energy', 'input');
      setPortType(0, 1, 1, 'item', 'input_output');
      clearGui();
      addGuiComponent('slot', 45, 25, { slotType: 'input' });
      addGuiComponent('slot', 45, 47, { slotType: 'input' });
      addGuiComponent('flame', 47, 36);
      addGuiComponent('progress_arrow', 73, 35);
      addGuiComponent('big_slot', 107, 30, { slotType: 'output' });
      addGuiComponent('energy_bar', 10, 16);
      break;
  }
}

// =========================================================================
// MODEL
// =========================================================================

export function importBlockbenchModel(json: any, textureName?: string): BlockModel {
  const elements: ModelElement[] = [];
  for (const el of json.elements || []) {
    elements.push({
      name: el.name || `part_${elements.length}`,
      from: [el.from[0], el.from[1], el.from[2]],
      to: [el.to[0], el.to[1], el.to[2]],
    });
  }
  const name = state.name || 'Unnamed';
  const tex = textureName || Object.values(json.textures || {})[0] as string || `${name.toLowerCase()}_texture`;
  const model: BlockModel = { name, elements, textureName: tex };
  state.model = model;
  notifyChange();
  return model;
}

export function getModel(): BlockModel | null {
  return state.model;
}

export function clearModel(): void {
  state.model = null;
  notifyChange();
}

// =========================================================================
// ANIMATION
// =========================================================================

export function getAnimConfig(): AnimationConfig {
  return state.animConfig;
}

export function importObj(filePath: string, content: string): void {
  state.animConfig.objPath = filePath;
  state.animConfig.objContent = content;
  notifyChange();
}

export function importTexture(filePath: string): void {
  state.animConfig.texturePath = filePath;
  notifyChange();
}

export function importBbmodelAnim(filePath: string, content: string): { clipNames: string[]; boneNames: string[] } {
  const bbmodel = JSON.parse(content);
  const result = parseBbmodel(bbmodel);
  const animJson = toAeroAnimJson(result);

  state.animConfig.bbmodelPath = filePath;
  state.animConfig.animJson = animJson;
  state.animConfig.clipNames = result.clips.map(c => c.name);
  state.animConfig.boneNames = result.boneNames;

  // Auto-seed state mappings from clip names (one state per clip)
  const existingClips = new Set(state.animConfig.stateMappings.map(m => m.clipName));
  let nextId = state.animConfig.stateMappings.length === 0
    ? 0
    : Math.max(...state.animConfig.stateMappings.map(m => m.stateId)) + 1;
  for (const name of state.animConfig.clipNames) {
    if (!existingClips.has(name)) {
      state.animConfig.stateMappings.push({ stateId: nextId++, label: name, clipName: name });
    }
  }
  state.animConfig.stateMappings.sort((a, b) => a.stateId - b.stateId);

  notifyChange();

  return { clipNames: state.animConfig.clipNames, boneNames: result.boneNames };
}

export function setAnimStateMapping(stateId: number, label: string, clipName: string): void {
  const existing = state.animConfig.stateMappings.find(m => m.stateId === stateId);
  if (existing) {
    existing.label = label;
    existing.clipName = clipName;
  } else {
    state.animConfig.stateMappings.push({ stateId, label, clipName });
  }
  // Keep sorted by stateId
  state.animConfig.stateMappings.sort((a, b) => a.stateId - b.stateId);
  notifyChange();
}

export function removeAnimStateMapping(stateId: number): boolean {
  const idx = state.animConfig.stateMappings.findIndex(m => m.stateId === stateId);
  if (idx === -1) return false;
  state.animConfig.stateMappings.splice(idx, 1);
  notifyChange();
  return true;
}

export function clearAnimConfig(): void {
  state.animConfig = createDefaultAnimConfig();
  notifyChange();
}

export function getStateSummary(): string {
  const { w, h, d } = state.dimensions;
  const counts: Record<string, number> = {};
  for (const [, block] of state.blocks) {
    counts[block.blockId] = (counts[block.blockId] || 0) + 1;
  }
  const slotInfo = getSlotInfo();

  // Build guide: counts are already by real block type (ports are metadata, not block types)
  const buildGuide = Object.entries(counts)
    .map(([type, n]) => {
      const def = blockRegistry.get(type);
      return `${def?.label || type} ×${n}`;
    })
    .join(', ');

  const guiSizeStr = (state.guiWidth !== DEFAULT_GUI_W || state.guiHeight !== DEFAULT_GUI_H)
    ? ` (GUI: ${state.guiWidth}x${state.guiHeight})` : '';
  return [
    `Name: ${state.name} (${state.structType})${guiSizeStr}`,
    `Dimensions: ${w}x${h}x${d}`,
    `IO: ${state.ioTypes.join(', ')}`,
    `Blocks: ${state.blocks.size} total — ${Object.entries(counts).map(([t, n]) => `${t}:${n}`).join(', ') || 'none'}`,
    `Build Guide: ${buildGuide || 'none'}`,
    `GUI: ${state.guiComponents.length} components (${slotInfo.inputs.length} input slots, ${slotInfo.outputs.length} output slots)`,
    `Energy: ${state.capacity.energy} RN, Fluid: ${state.capacity.fluid} mB, Gas: ${state.capacity.gas} mB`,
    `Process: ${state.processTime} ticks @ ${state.energyPerTick} RN/tick`,
    `IDs: block=${state.blockId}, defaultShell=${state.defaultShellBlock}`,
  ].join('\n');
}
