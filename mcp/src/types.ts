import { DEFAULT_BLOCKS } from '@aero/shared/block-defaults';

// Block category determines behavior in codegen and structure validation
export type BlockCategory = 'mod' | 'vanilla' | 'custom';
export type StructureType = 'machine' | 'tank' | 'reactor' | 'custom';
export type PortMode = 'input' | 'output' | 'input_output';
export type IOType = 'energy' | 'fluid' | 'gas' | 'item';
export type SlotType = 'input' | 'output' | 'fuel';
export type IoMode = 'input' | 'output' | 'display';
export type ArrowDirection = 'right' | 'left' | 'up' | 'down';

export type GuiComponentType =
  | 'slot' | 'big_slot' | 'energy_bar' | 'progress_arrow'
  | 'flame' | 'fluid_tank' | 'gas_tank' | 'fluid_tank_small' | 'gas_tank_small' | 'separator'
  | 'search_box' | 'search_box_light' | 'scrollbar' | 'scrollbar_tab' | 'scrollbar_tab_left';

export const GUI_COMP_DEFS: Record<GuiComponentType, { w: number; h: number; slotType?: SlotType; ioMode: IoMode }> = {
  slot:           { w: 18, h: 18, slotType: 'input', ioMode: 'input' },
  big_slot:       { w: 26, h: 26, slotType: 'output', ioMode: 'output' },
  energy_bar:     { w: 8,  h: 54, ioMode: 'display' },
  progress_arrow: { w: 24, h: 17, ioMode: 'display' },
  flame:          { w: 14, h: 14, ioMode: 'display' },
  fluid_tank:       { w: 18, h: 54, ioMode: 'input' },
  gas_tank:         { w: 18, h: 54, ioMode: 'input' },
  fluid_tank_small: { w: 18, h: 27, ioMode: 'input' },
  gas_tank_small:   { w: 18, h: 27, ioMode: 'input' },
  separator:        { w: 162, h: 2, ioMode: 'display' },
  search_box:       { w: 88, h: 12, ioMode: 'display' },
  search_box_light: { w: 88, h: 12, ioMode: 'display' },
  scrollbar:        { w: 6, h: 108, ioMode: 'display' },
  scrollbar_tab:    { w: 22, h: 108, ioMode: 'display' },
  scrollbar_tab_left: { w: 22, h: 108, ioMode: 'display' },
};

export interface BlockDef {
  id: string;
  category: BlockCategory;
  label: string;
  color: number;
  char: string;
  portType?: IOType;
  tier?: number;
  builtIn: boolean;
  mcId?: number;
  mcMeta?: number;
  terrainIndex?: number;
  /** Relative or absolute path to a custom texture PNG */
  texturePath?: string;
}

export interface BlockEntry {
  blockId: string;
  mode: PortMode;
  portType?: IOType;
  isController?: boolean;
}

export interface GuiComponent {
  type: GuiComponentType;
  x: number;
  y: number;
  w: number;
  h: number;
  slotType: SlotType | null;
  ioMode: IoMode;
  direction?: ArrowDirection;
}

export interface Capacity {
  energy: number;
  fluid: number;
  gas: number;
}

export interface ModelElement {
  name: string;
  from: [number, number, number];
  to: [number, number, number];
}

export interface BlockModel {
  name: string;
  elements: ModelElement[];
  textureName: string;
}

export interface MultiblockState {
  name: string;
  structType: StructureType;
  dimensions: { w: number; h: number; d: number };
  blocks: Map<string, BlockEntry>;
  ioTypes: IOType[];
  capacity: Capacity;
  processTime: number;
  energyPerTick: number;
  blockId: number;
  defaultShellBlock: string;
  guiWidth: number;
  guiHeight: number;
  guiComponents: GuiComponent[];
  model: BlockModel | null;
  animConfig: AnimationConfig;
}

// Note: casingId is deprecated — use defaultShellBlock instead

// -------------------------------------------------------------------------
// Animation / Model types
// -------------------------------------------------------------------------

/** A single animation state mapping: stateId → clipName */
export interface AnimStateMapping {
  stateId: number;
  label: string;       // human-readable label (e.g. "idle", "processing", "done")
  clipName: string;    // clip name in the .anim.json
}

/** Full animation config for a machine model */
export interface AnimationConfig {
  /** Path to the imported .obj file (absolute) */
  objPath: string | null;
  /** Raw OBJ text content (for Three.js viewer) */
  objContent: string | null;
  /** Path to the imported .bbmodel file */
  bbmodelPath: string | null;
  /** Path to the imported texture file */
  texturePath: string | null;
  /** Generated .anim.json data */
  animJson: any | null;
  /** Available clip names (extracted from .bbmodel) */
  clipNames: string[];
  /** Bone names found in the model */
  boneNames: string[];
  /** State → clip mappings configured by user */
  stateMappings: AnimStateMapping[];
}

export function createDefaultAnimConfig(): AnimationConfig {
  return {
    objPath: null,
    objContent: null,
    bbmodelPath: null,
    texturePath: null,
    animJson: null,
    clipNames: [],
    boneNames: [],
    stateMappings: [],
  };
}

// -------------------------------------------------------------------------

export interface GeneratedFile {
  name: string;
  relativePath: string;
  content: string;
}

export interface StructureLayer {
  layer: number;
  pattern: string[][];
}

export interface SerializedMultiblock {
  name: string;
  structType: StructureType;
  dimensions: [number, number, number];
  ioTypes: IOType[];
  capacity: Capacity;
  processTime: number;
  energyPerTick: number;
  blockId: number;
  defaultShellBlock?: string;
  guiWidth?: number;
  guiHeight?: number;
  controllerPos?: string;
  structure: StructureLayer[];
  legend: Record<string, string>;
  portModes: Record<string, PortMode>;
  portTypes?: Record<string, IOType>;
  guiComponents: GuiComponent[];
  model?: BlockModel;
  registry?: BlockDef[];
  /** @deprecated Legacy field — ignored on load */
  casingId?: number;
}

// ---------------------------------------------------------------------------
// Block Registry
// ---------------------------------------------------------------------------

const CHAR_POOL = 'iklmnopqrstuvwxyzZ0123456789';

export class BlockRegistry {
  private blocks = new Map<string, BlockDef>();
  private charToId = new Map<string, string>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    for (const b of DEFAULT_BLOCKS) {
      this.register({
        id: b.id,
        category: b.category as BlockCategory,
        label: b.label,
        color: b.color,
        char: b.char,
        portType: b.portType as IOType | undefined,
        builtIn: true,
        mcId: b.mcId,
        mcMeta: (b as any).mcMeta,
        terrainIndex: b.terrainIndex,
      });
    }
  }

  register(def: BlockDef): void {
    if (this.blocks.has(def.id)) {
      // Update existing block instead of throwing
      const existing = this.blocks.get(def.id)!;
      Object.assign(existing, def, { char: existing.char });
      return;
    }
    // Auto-resolve char conflicts
    let ch = def.char;
    if (this.charToId.has(ch)) {
      const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
      ch = pool.split('').find(c => !this.charToId.has(c)) || '?';
      def = { ...def, char: ch };
    }
    this.blocks.set(def.id, def);
    this.charToId.set(ch, def.id);
  }

  unregister(id: string): boolean {
    const def = this.blocks.get(id);
    if (!def) return false;
    if (def.builtIn) return false;
    this.charToId.delete(def.char);
    this.blocks.delete(id);
    return true;
  }

  has(id: string): boolean { return this.blocks.has(id); }
  get(id: string): BlockDef | undefined { return this.blocks.get(id); }
  getByChar(char: string): BlockDef | undefined {
    const id = this.charToId.get(char);
    return id ? this.blocks.get(id) : undefined;
  }
  getAll(): BlockDef[] { return [...this.blocks.values()]; }
  getIds(): string[] { return [...this.blocks.keys()]; }

  getCustom(): BlockDef[] {
    return this.getAll().filter(b => !b.builtIn);
  }

  nextAvailableChar(): string | null {
    for (const ch of CHAR_POOL) {
      if (!this.charToId.has(ch)) return ch;
    }
    return null;
  }

  reset(): void {
    this.blocks.clear();
    this.charToId.clear();
    this.registerDefaults();
  }
}

export const blockRegistry = new BlockRegistry();
