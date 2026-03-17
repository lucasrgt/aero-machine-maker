export interface DefaultBlockDef {
  id: string;
  category: string;
  label: string;
  color: number;
  char: string;
  portType?: string;
  mcId?: number;
  terrainIndex?: number;
}

export declare const DEFAULT_BLOCKS: DefaultBlockDef[];

export declare function buildBlockLookups(blocks: DefaultBlockDef[]): {
  byId: Record<string, DefaultBlockDef>;
  byChar: Record<string, string>;
};
