// Minimal built-in blocks needed by the MCP server for codegen and templates.
// Full vanilla block list is in dictionaries/vanilla.json (loaded by the app at runtime).

export const DEFAULT_BLOCKS = [
  { id: 'glass', category: 'vanilla', label: 'Glass', color: 0x88ddff, char: 'W', mcId: 20, terrainIndex: 49 },
  { id: 'stone', category: 'vanilla', label: 'Stone', color: 0x7d7d7d, char: 'S', mcId: 1, terrainIndex: 1 },
  { id: 'cobblestone', category: 'vanilla', label: 'Cobblestone', color: 0x7a7a7a, char: 'b', mcId: 4, terrainIndex: 16 },
  { id: 'iron_block', category: 'vanilla', label: 'Iron Block', color: 0xc8c8c8, char: 'R', mcId: 42, terrainIndex: 22 },
  { id: 'gold_block', category: 'vanilla', label: 'Gold Block', color: 0xf5d900, char: 'H', mcId: 41, terrainIndex: 23 },
  { id: 'diamond_block', category: 'vanilla', label: 'Diamond Block', color: 0x6ee8e4, char: 'A', mcId: 57, terrainIndex: 24 },
  { id: 'obsidian', category: 'vanilla', label: 'Obsidian', color: 0x1b1029, char: 'O', mcId: 49, terrainIndex: 37 },
  { id: 'brick', category: 'vanilla', label: 'Brick', color: 0x9b634a, char: 'J', mcId: 45, terrainIndex: 7 },
  { id: 'planks', category: 'vanilla', label: 'Planks', color: 0xbc9862, char: 'P', mcId: 5, terrainIndex: 4 },
];

// Build lookup objects from block array
export function buildBlockLookups(blocks) {
  const byId = {};
  const byChar = {};
  for (const b of blocks) {
    byId[b.id] = b;
    byChar[b.char] = b.id;
  }
  return { byId, byChar };
}
