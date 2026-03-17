import * as THREE from 'three'
import { getBlockInfo, blockRegistry } from './types'

const TILE_SIZE = 16
const ATLAS_TILES = 16

// Port overlay colors (for wireframe overlays on port blocks)
const PORT_OVERLAYS: Record<string, string> = {
  energy_port: '#eeee00',
  fluid_port:  '#4488ff',
  gas_port:    '#bbbbbb',
  item_port:   '#ff8800',
}

let terrainCanvas: HTMLCanvasElement | null = null
const tileCache = new Map<string, HTMLCanvasElement>()
const customCache = new Map<string, HTMLCanvasElement>()
const portCache = new Map<string, HTMLCanvasElement>()
const materialCache = new Map<string, THREE.Material>()
let ready = false
let projectRoot = ''

function loadImageFromBase64(base64: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      resolve(c)
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/png;base64,${base64}`
  })
}

function extractTile(index: number): HTMLCanvasElement | null {
  const key = `tile_${index}`
  if (tileCache.has(key)) return tileCache.get(key)!
  if (!terrainCanvas) return null

  const col = index % ATLAS_TILES
  const row = Math.floor(index / ATLAS_TILES)
  const c = document.createElement('canvas')
  c.width = TILE_SIZE
  c.height = TILE_SIZE
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(terrainCanvas, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE)
  tileCache.set(key, c)
  return c
}

function createPortTexture(baseTile: HTMLCanvasElement, overlayColor: string): HTMLCanvasElement {
  const cacheKey = `port_${overlayColor}`
  if (tileCache.has(cacheKey)) return tileCache.get(cacheKey)!

  const c = document.createElement('canvas')
  c.width = TILE_SIZE
  c.height = TILE_SIZE
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(baseTile, 0, 0)

  // Colored border (2px)
  ctx.fillStyle = overlayColor
  ctx.globalAlpha = 0.75
  ctx.fillRect(0, 0, TILE_SIZE, 2)
  ctx.fillRect(0, TILE_SIZE - 2, TILE_SIZE, 2)
  ctx.fillRect(0, 2, 2, TILE_SIZE - 4)
  ctx.fillRect(TILE_SIZE - 2, 2, 2, TILE_SIZE - 4)

  // Center diamond indicator
  ctx.globalAlpha = 0.9
  ctx.fillRect(7, 6, 2, 4)
  ctx.fillRect(6, 7, 4, 2)

  tileCache.set(cacheKey, c)
  return c
}

function canvasToTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export async function loadTextures(): Promise<boolean> {
  const api = (window as any).api
  if (!api?.readFileBase64 || !api?.getProjectRoot) return false

  try {
    projectRoot = await api.getProjectRoot()

    // Load terrain.png atlas
    const terrainB64 = await api.readFileBase64(`${projectRoot}/temp/merged/terrain.png`)
    if (terrainB64) {
      terrainCanvas = await loadImageFromBase64(terrainB64)
    }

    ready = !!terrainCanvas

    // Load textures for all registered blocks that have texturePath
    if (ready) {
      await loadRegisteredBlockTextures()
    }

    return ready
  } catch (e) {
    console.warn('Texture loading failed:', e)
    return false
  }
}

/**
 * Scan the block registry and load textures for any block that has a texturePath set.
 * Called on initial load and can be called again when new blocks are registered.
 */
async function loadRegisteredBlockTextures(): Promise<void> {
  const api = (window as any).api
  if (!api?.readFileBase64) return

  for (const [id, def] of blockRegistry.entries()) {
    if (def.texturePath && !customCache.has(id)) {
      await loadBlockTexture(id, def.texturePath)
    }
  }
}

/**
 * Load a single block's custom texture from a file path.
 * Path can be absolute or relative to project root.
 * Invalidates the material cache for this block so next render picks up the texture.
 */
async function loadBlockTexture(blockId: string, texturePath: string): Promise<boolean> {
  const api = (window as any).api
  if (!api?.readFileBase64) return false

  // Resolve relative paths against project root
  const fullPath = texturePath.match(/^[a-zA-Z]:[\\/]|^\//)
    ? texturePath
    : `${projectRoot}/${texturePath}`

  try {
    const b64 = await api.readFileBase64(fullPath)
    if (b64) {
      const canvas = await loadImageFromBase64(b64)
      if (canvas) {
        customCache.set(blockId, canvas)
        // Invalidate cached material so it gets recreated with the texture
        invalidateMaterial(blockId)
        return true
      }
    }
  } catch (e) {
    console.warn(`Failed to load texture for ${blockId}: ${texturePath}`, e)
  }
  return false
}

/**
 * Register a custom texture for a block dynamically.
 * Called by loadDictionary or register_block when a texturePath is provided.
 * Returns true if the texture was loaded successfully.
 */
export async function registerBlockTexture(blockId: string, texturePath: string): Promise<boolean> {
  if (!ready) return false
  return loadBlockTexture(blockId, texturePath)
}

/**
 * Register a texture from raw base64 PNG data (for blocks loaded from external sources).
 */
export async function registerBlockTextureFromBase64(blockId: string, base64: string): Promise<boolean> {
  const canvas = await loadImageFromBase64(base64)
  if (canvas) {
    customCache.set(blockId, canvas)
    invalidateMaterial(blockId)
    return true
  }
  return false
}

/** Remove cached material entries for a block so they get recreated */
function invalidateMaterial(blockId: string): void {
  for (const key of materialCache.keys()) {
    if (key.startsWith(blockId + '_')) {
      materialCache.get(key)?.dispose()
      materialCache.delete(key)
    }
  }
}


export function isTexturesReady(): boolean {
  return ready
}

/**
 * Check if a block has a loaded custom texture.
 */
export function hasBlockTexture(blockId: string): boolean {
  return customCache.has(blockId)
}

/**
 * Get the data URL for a block's texture (for palette icons).
 * Checks: custom texture > terrain tile > null.
 */
export function getBlockTextureDataUrl(blockId: string): string | null {
  const custom = customCache.get(blockId)
  if (custom) return custom.toDataURL()

  const def = blockRegistry.get(blockId)
  if (def?.terrainIndex !== undefined) return getTileDataUrl(def.terrainIndex)

  return null
}

/**
 * Extract a 16x16 tile from terrain.png as a data URL for use in UI (palette icons).
 * Returns null if terrain textures aren't loaded yet.
 */
export function getTileDataUrl(terrainIndex: number): string | null {
  if (!ready) return null
  const tile = extractTile(terrainIndex)
  if (!tile) return null
  return tile.toDataURL()
}

/**
 * Create a BoxGeometry with Minecraft-style per-face brightness baked into vertex colors.
 *
 * Minecraft Beta 1.7.3 face brightness multipliers (from RenderBlocks.java):
 *   Top    (Y+) = 1.0
 *   Bottom (Y-) = 0.5
 *   East   (X+) = 0.8
 *   West   (X-) = 0.8
 *   South  (Z+) = 0.6
 *   North  (Z-) = 0.6
 *
 * Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
 * Each face has 4 vertices (indexed).
 */
let _mcGeom: THREE.BoxGeometry | null = null
export function getMinecraftBoxGeometry(): THREE.BoxGeometry {
  if (_mcGeom) return _mcGeom

  const geom = new THREE.BoxGeometry(0.92, 0.92, 0.92)

  // Minecraft face brightness: [+X, -X, +Y, -Y, +Z, -Z]
  const faceBrightness = [0.8, 0.8, 1.0, 0.5, 0.6, 0.6]

  const count = geom.attributes.position.count // 24 (4 vertices × 6 faces)
  const colors = new Float32Array(count * 3)

  for (let face = 0; face < 6; face++) {
    const b = faceBrightness[face]
    for (let v = 0; v < 4; v++) {
      const i = (face * 4 + v) * 3
      colors[i] = b
      colors[i + 1] = b
      colors[i + 2] = b
    }
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  _mcGeom = geom
  return geom
}

/**
 * Create a labeled color tile: solid background + centered block name text.
 * Used as fallback for blocks without a texture (mod blocks, custom blocks).
 * High-res canvas (256x256) with linear filtering for crisp text on 3D cubes.
 */
const labelCache = new Map<string, HTMLCanvasElement>()
function createLabeledTile(color: number, label: string): HTMLCanvasElement {
  const key = `${color}_${label}`
  if (labelCache.has(key)) return labelCache.get(key)!

  const SIZE = 256
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  const ctx = c.getContext('2d')!

  // Fill background with block color
  const hex = '#' + (color & 0xffffff).toString(16).padStart(6, '0')
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Subtle border (darker shade of the color)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, SIZE - 6, SIZE - 6)

  // Determine text brightness: use dark text on light backgrounds
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const textColor = luminance > 0.6 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)'
  const shadowColor = luminance > 0.6 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.6)'

  // Word wrap: split label into short lines
  const words = label.split(/[\s-]+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > 10 && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)

  // Font size based on line count
  const fontSize = lines.length <= 2 ? 40 : lines.length <= 3 ? 34 : 28
  const lineHeight = fontSize + 8
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const totalHeight = lines.length * lineHeight
  const startY = (SIZE - totalHeight) / 2 + lineHeight / 2

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight
    // Shadow
    ctx.fillStyle = shadowColor
    ctx.fillText(lines[i], SIZE / 2 + 2, y + 2)
    // Text
    ctx.fillStyle = textColor
    ctx.fillText(lines[i], SIZE / 2, y)
  }

  labelCache.set(key, c)
  return c
}

/** Convert canvas to Three.js texture with linear filtering (smooth text) */
function canvasToTextureLinear(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Get a block material using MeshBasicMaterial with vertexColors.
 * No dynamic lights needed — face brightness comes from vertex colors
 * (Minecraft-style per-face shading baked into the geometry).
 *
 * Priority: port texture > custom texture (from texturePath) > terrain tile > labeled color tile
 */
export function getBlockMaterial(type: string, portType?: string): THREE.Material {
  const key = `${type}_${portType || 'none'}`
  if (materialCache.has(key)) return materialCache.get(key)!

  const blockDef = blockRegistry.get(type)
  const isGlass = type === 'glass'
  let tileCanvas: HTMLCanvasElement | null = null

  if (ready) {
    // 1. Port texture: use actual in-game port texture based on portType
    if (portType && portCache.has(portType)) {
      tileCanvas = portCache.get(portType)!
    }
    // 2. Custom texture (loaded from texturePath or registered dynamically)
    else if (customCache.has(type)) {
      tileCanvas = customCache.get(type)!
    }
    // 3. terrainIndex from block registry (vanilla blocks or mod blocks pointing to terrain.png)
    else if (blockDef?.terrainIndex !== undefined) {
      tileCanvas = extractTile(blockDef.terrainIndex)
    }
  }

  let mat: THREE.Material
  if (tileCanvas) {
    mat = new THREE.MeshBasicMaterial({
      map: canvasToTexture(tileCanvas),
      vertexColors: true,
      transparent: isGlass,
      opacity: isGlass ? 0.5 : 1.0,
    })
  } else {
    // Fallback: labeled color tile with block name on all faces
    const info = getBlockInfo(type)
    const labelTile = createLabeledTile(info.color, info.label)
    mat = new THREE.MeshBasicMaterial({
      map: canvasToTextureLinear(labelTile),
      vertexColors: true,
      transparent: isGlass,
      opacity: isGlass ? 0.5 : 1.0,
    })
  }

  materialCache.set(key, mat)
  return mat
}

export function clearMaterialCache(): void {
  for (const mat of materialCache.values()) mat.dispose()
  materialCache.clear()
}
