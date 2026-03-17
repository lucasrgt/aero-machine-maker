import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { useStore, type AnimStateMapping } from '@/hooks/use-store'
import { getBlockInfo, blockRegistry } from '@/core/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

/**
 * Apply Minecraft-style per-face brightness to a BufferGeometry via vertex colors.
 *
 * Minecraft Beta 1.7.3 face brightness multipliers (from RenderBlocks.java):
 *   Top    (Y+) = 1.0
 *   Bottom (Y-) = 0.5
 *   East/West   (X±) = 0.8
 *   North/South (Z±) = 0.6
 *
 * For arbitrary OBJ meshes, each vertex's brightness is determined by its face normal
 * direction — we blend the axis-aligned multipliers based on the normal components.
 */
function applyMinecraftLighting(geometry: THREE.BufferGeometry) {
  // Ensure normals exist
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals()
  }

  const normals = geometry.attributes.normal
  const count = normals.count
  const colors = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const nx = normals.getX(i)
    const ny = normals.getY(i)
    const nz = normals.getZ(i)

    // Minecraft multipliers per axis direction:
    // Y+ = 1.0, Y- = 0.5, X± = 0.8, Z± = 0.6
    // Blend by the absolute contribution of each axis component
    const absX = Math.abs(nx)
    const absY = Math.abs(ny)
    const absZ = Math.abs(nz)
    const sum = absX + absY + absZ || 1

    const yBrightness = ny > 0 ? 1.0 : 0.5
    const brightness = (absX / sum) * 0.8 + (absY / sum) * yBrightness + (absZ / sum) * 0.6

    colors[i * 3] = brightness
    colors[i * 3 + 1] = brightness
    colors[i * 3 + 2] = brightness
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function generateModelContext(): string {
  const s = useStore.getState()
  const { w, h, d } = s.dimensions

  // Block counts and port info
  const counts: Record<string, number> = {}
  const portDetails: { blockId: string; pos: string; mode: string; portType?: string }[] = []
  for (const [key, block] of s.blocks) {
    counts[block.type] = (counts[block.type] || 0) + 1
    if (block.portType) {
      portDetails.push({ blockId: block.type, pos: key, mode: block.mode, portType: block.portType })
    }
  }

  // Block palette
  const usedBlocks = new Set<string>()
  for (const [, block] of s.blocks) usedBlocks.add(block.type)
  const palette = [...usedBlocks].map(id => {
    const def = blockRegistry.get(id)
    if (!def) return ''
    return `  <block id="${id}" category="${def.category}" color="#${def.color.toString(16).padStart(6, '0')}" label="${def.label}"${def.portType ? ` portType="${def.portType}"` : ''} count="${counts[id] || 0}" />`
  }).filter(Boolean)

  // Structure layers
  let layerGrid = ''
  for (let y = 0; y < h; y++) {
    layerGrid += `  <layer y="${y}">\n`
    for (let z = 0; z < d; z++) {
      let row = '    '
      for (let x = 0; x < w; x++) {
        const block = s.blocks.get(`${x},${y},${z}`)
        row += block ? (getBlockInfo(block.type)?.char || '?') : '.'
      }
      layerGrid += row + '\n'
    }
    layerGrid += '  </layer>\n'
  }

  const portXml = portDetails.map(p =>
    `  <port type="${p.portType}" blockId="${p.blockId}" position="${p.pos}" mode="${p.mode}" />`
  ).join('\n')

  return `# ${s.name} — Multiblock Model Context

> Auto-generated metadata for Blockbench MCP model creation.

<machine>
  <name>${s.name}</name>
  <type>${s.structType}</type>
  <dimensions width="${w}" height="${h}" depth="${d}" />
  <blockSize>16</blockSize>
  <modelSize width="${w * 16}" height="${h * 16}" depth="${d * 16}" unit="pixels" />
</machine>

<io types="${s.ioTypes.join(', ')}">
  <energy capacity="${s.capacity.energy}" perTick="${s.energyPerTick}" />
  <fluid capacity="${s.capacity.fluid}" />
  <gas capacity="${s.capacity.gas}" />
  <processTime ticks="${s.processTime}" />
</io>

<palette>
${palette.join('\n')}
</palette>

<structure totalBlocks="${s.blocks.size}">
${layerGrid}</structure>

<ports count="${portDetails.length}">
${portXml}
</ports>

<gui components="${s.guiComponents.length}">
${s.guiComponents.map((c, i) => `  <component index="${i}" type="${c.type}" x="${c.x}" y="${c.y}" w="${c.w}" h="${c.h}"${c.slotType ? ` slotType="${c.slotType}"` : ''} ioMode="${c.ioMode}" />`).join('\n')}
</gui>

## Notes for Blockbench

### For multiblock structures:
- The Blockbench model represents the ENTIRE FORMED STRUCTURE, not just the controller block
- Use the \`<modelSize>\` dimensions above as the Blockbench canvas size (e.g., 48x64x48 pixels for a 3x3x4 structure)
- Design as one unified industrial machine — NOT a collection of separate casing blocks
- When the multiblock forms in-game, casing blocks become invisible and this model renders at the controller's position

### For single-block machines:
- Coordinates range 0-16 per axis (one block = 16 pixels)
- 8-15 elements for visual richness

### Render system (both types):
- Uses \`setBlockBounds\` + \`renderStandardBlock\` (axis-aligned boxes only, no rotations)
- Texture is a single 16x16 atlas referenced by all faces
- Each element maps to a \`float[] {fromX, fromY, fromZ, toX, toY, toZ}\` in the Java PARTS array
`
}

export function ModelEditor() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const animFrameRef = useRef<number>(0)

  const animConfig = useStore((s) => s.animConfig)

  // Camera orbit state
  const orbitRef = useRef({ theta: 45, phi: 30, radius: 3, target: new THREE.Vector3(0, 0.5, 0) })
  const draggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })

  // Animation playback
  const [selectedClip, setSelectedClip] = useState<string | null>(null)
  const selectedClipRef = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const playingRef = useRef(false)
  const clipTimeRef = useRef(0)
  const lastFrameRef = useRef(0)

  // Bone group refs for animation (keyed by BONE name, not element name)
  const boneGroupsRef = useRef<Map<string, THREE.Group>>(new Map())
  // Element mesh refs (keyed by element/OBJ child name) — used to rebuild hierarchy
  const elementMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())

  // -----------------------------------------------------------------------
  // Three.js setup
  // -----------------------------------------------------------------------
  useEffect(() => {
    const container = canvasRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111111)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 100)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // No dynamic lights — Minecraft-style face brightness is baked
    // into vertex colors based on face normals (see applyMinecraftLighting)

    // Grid helper (1 block = 1 unit)
    const grid = new THREE.GridHelper(4, 16, 0x333333, 0x666666)
    scene.add(grid)

    // Axis helper
    const axes = new THREE.AxesHelper(1)
    scene.add(axes)

    // Render loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)

      // Update camera from orbit
      const o = orbitRef.current
      const sinPhi = Math.sin(o.phi * Math.PI / 180)
      const cosPhi = Math.cos(o.phi * Math.PI / 180)
      const sinTheta = Math.sin(o.theta * Math.PI / 180)
      const cosTheta = Math.cos(o.theta * Math.PI / 180)
      camera.position.set(
        o.target.x + o.radius * cosPhi * sinTheta,
        o.target.y + o.radius * sinPhi,
        o.target.z + o.radius * cosPhi * cosTheta,
      )
      camera.lookAt(o.target)

      // Animation playback — read from refs/store to avoid stale closure
      if (playingRef.current && selectedClipRef.current) {
        const currentAnimConfig = useStore.getState().animConfig
        const clipName = selectedClipRef.current
        const clipData = currentAnimConfig.animJson?.animations?.[clipName]
        if (clipData) {
          const now = performance.now()
          const dt = (now - lastFrameRef.current) / 1000
          lastFrameRef.current = now

          clipTimeRef.current += dt
          if (clipData.loop) {
            clipTimeRef.current = clipTimeRef.current % clipData.length
          } else {
            clipTimeRef.current = Math.min(clipTimeRef.current, clipData.length)
          }
          applyAnimationFromStore(clipData, clipTimeRef.current)
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const onResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const resizeObs = new ResizeObserver(onResize)
    resizeObs.observe(container)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      resizeObs.disconnect()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Keep selectedClipRef in sync with state
  useEffect(() => {
    selectedClipRef.current = selectedClip
  }, [selectedClip])

  // -----------------------------------------------------------------------
  // Apply animation keyframes to bone groups (reads from store, no stale closure)
  // -----------------------------------------------------------------------
  function applyAnimationFromStore(clipData: any, time: number) {
    const pivots = useStore.getState().animConfig.animJson?.pivots || {}
    for (const [boneName, boneData] of Object.entries(clipData.bones as Record<string, any>)) {
      const group = boneGroupsRef.current.get(boneName)
      if (!group) continue

      // Rotation (Euler degrees → radians)
      if (boneData.rotation) {
        const rot = sampleKeyframes(boneData.rotation, time)
        if (rot) {
          group.rotation.set(
            rot[0] * Math.PI / 180,
            rot[1] * Math.PI / 180,
            rot[2] * Math.PI / 180,
          )
        }
      }

      // Position (Blockbench pixels → block units, added to pivot)
      if (boneData.position) {
        const pos = sampleKeyframes(boneData.position, time)
        if (pos) {
          const pivot = pivots[boneName] || [0, 0, 0]
          group.position.set(
            pivot[0] / 16 + pos[0] / 16,
            pivot[1] / 16 + pos[1] / 16,
            pivot[2] / 16 + pos[2] / 16,
          )
        }
      }

      // Scale (multipliers, 1.0 = original)
      if (boneData.scale) {
        const scl = sampleKeyframes(boneData.scale, time)
        if (scl) {
          group.scale.set(scl[0], scl[1], scl[2])
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Build material (texture or plain) — shared between OBJ load and texture change
  // -----------------------------------------------------------------------
  const buildModelMaterial = useCallback((textureUrl: string | null): THREE.MeshBasicMaterial => {
    if (textureUrl) {
      const tex = new THREE.TextureLoader().load(textureUrl)
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.colorSpace = THREE.SRGBColorSpace
      return new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide })
    }
    return new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide })
  }, [])

  // -----------------------------------------------------------------------
  // Track model rebuild count so texture effect can re-apply after rebuild
  // -----------------------------------------------------------------------
  const [modelVersion, setModelVersion] = useState(0)

  // -----------------------------------------------------------------------
  // Build bone hierarchy from elements + childMap
  // childMap maps element names → bone names (from bbmodel outliner)
  // Without childMap, each element becomes its own "bone group"
  // -----------------------------------------------------------------------
  function buildBoneHierarchy(
    wrapper: THREE.Group,
    elements: Map<string, THREE.Object3D>,
    childMap: Record<string, string> | null,
    pivots: Record<string, [number, number, number]>,
  ) {
    boneGroupsRef.current.clear()

    if (childMap && Object.keys(childMap).length > 0) {
      // childMap contains BOTH element→bone AND bone→bone mappings
      // (matching Aero_Convert.java behavior)

      // 1. Collect all bone names (values in childMap that aren't elements)
      const allBoneNames = new Set<string>()
      for (const val of Object.values(childMap)) allBoneNames.add(val)
      // Also add keys that are bones (have children of their own, i.e. appear as values)
      for (const key of Object.keys(childMap)) {
        if (allBoneNames.has(key)) allBoneNames.add(key)
      }
      // Add any key that maps to a bone (it's a bone or element)
      // A key is a bone if it also appears as a value somewhere
      // Let's just create groups for all unique bone names
      for (const key of Object.keys(childMap)) {
        // If this key is NOT an element mesh, it's a bone
        if (!elements.has(key)) allBoneNames.add(key)
      }

      // 2. Create THREE.Group for each bone
      for (const boneName of allBoneNames) {
        const boneGroup = new THREE.Group()
        boneGroup.name = `bone_${boneName}`
        const pivot = pivots[boneName]
        if (pivot) {
          boneGroup.position.set(pivot[0] / 16, pivot[1] / 16, pivot[2] / 16)
        }
        boneGroupsRef.current.set(boneName, boneGroup)
      }

      // 3. Assign element meshes to their parent bone groups
      const ungrouped: THREE.Object3D[] = []
      for (const [elemName, mesh] of elements) {
        const parentBone = childMap[elemName]
        const parentGroup = parentBone ? boneGroupsRef.current.get(parentBone) : undefined
        if (parentGroup) {
          const pivot = pivots[parentBone]
          if (pivot) {
            mesh.position.set(-pivot[0] / 16, -pivot[1] / 16, -pivot[2] / 16)
          }
          parentGroup.add(mesh)
        } else {
          ungrouped.push(mesh)
        }
      }

      // 4. Nest bone groups under parent bone groups (bone→bone hierarchy)
      const topLevelBones: string[] = []
      for (const boneName of allBoneNames) {
        const parentBone = childMap[boneName]
        const parentGroup = parentBone ? boneGroupsRef.current.get(parentBone) : undefined
        if (parentGroup) {
          // This bone is a child of another bone — nest it
          const childGroup = boneGroupsRef.current.get(boneName)!
          const parentPivot = pivots[parentBone]
          if (parentPivot) {
            // Offset child position relative to parent pivot
            childGroup.position.set(
              childGroup.position.x - parentPivot[0] / 16,
              childGroup.position.y - parentPivot[1] / 16,
              childGroup.position.z - parentPivot[2] / 16,
            )
          }
          parentGroup.add(childGroup)
        } else {
          topLevelBones.push(boneName)
        }
      }

      // 5. Add top-level bones and ungrouped elements to wrapper
      for (const boneName of topLevelBones) {
        const group = boneGroupsRef.current.get(boneName)!
        wrapper.add(group)
      }
      for (const mesh of ungrouped) wrapper.add(mesh)
    } else {
      // No childMap — treat each OBJ child as its own bone group (fallback)
      for (const [name, child] of elements) {
        const boneGroup = new THREE.Group()
        boneGroup.name = `bone_${name}`
        const pivot = pivots[name]
        if (pivot) {
          boneGroup.position.set(pivot[0] / 16, pivot[1] / 16, pivot[2] / 16)
          child.position.set(-pivot[0] / 16, -pivot[1] / 16, -pivot[2] / 16)
        }
        boneGroup.add(child)
        wrapper.add(boneGroup)
        boneGroupsRef.current.set(name, boneGroup)
      }
    }
  }

  // -----------------------------------------------------------------------
  // Load OBJ model when objContent changes
  // Only depends on objContent — reads childMap/pivots/texture from current state
  // -----------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // Remove old model
    if (modelRef.current) {
      scene.remove(modelRef.current)
      modelRef.current = null
      boneGroupsRef.current.clear()
      elementMeshesRef.current.clear()
    }

    if (!animConfig.objContent) return

    const loader = new OBJLoader()
    const obj = loader.parse(animConfig.objContent)

    // Apply Minecraft-style per-face lighting via vertex colors
    const material = buildModelMaterial(animConfig.textureDataUrl ?? null)
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        applyMinecraftLighting(child.geometry)
        child.material = material
      }
    })

    // Collect all named children (elements) from parsed OBJ
    const elements = new Map<string, THREE.Object3D>()
    const unnamed: THREE.Object3D[] = []
    for (const child of [...obj.children]) {
      if (child.name) {
        obj.remove(child)
        elements.set(child.name, child)
      } else {
        obj.remove(child)
        unnamed.push(child)
      }
    }
    elementMeshesRef.current = elements

    // Build bone hierarchy
    const wrapper = new THREE.Group()
    const currentAnim = animConfig.animJson
    buildBoneHierarchy(
      wrapper,
      elements,
      currentAnim?.childMap || null,
      currentAnim?.pivots || {},
    )

    // Add unnamed children directly
    for (const child of unnamed) wrapper.add(child)

    // Center the model
    const box = new THREE.Box3().setFromObject(wrapper)
    const center = box.getCenter(new THREE.Vector3())
    wrapper.position.sub(center)
    wrapper.position.y += box.getSize(new THREE.Vector3()).y / 2

    scene.add(wrapper)
    modelRef.current = wrapper
    setModelVersion(v => v + 1)
  }, [animConfig.objContent])

  // -----------------------------------------------------------------------
  // Rebuild bone hierarchy when animJson changes (bbmodel imported after OBJ)
  // Uses childMap to properly group OBJ elements under animation bones
  // -----------------------------------------------------------------------
  useEffect(() => {
    const model = modelRef.current
    if (!model || !animConfig.animJson) return
    if (elementMeshesRef.current.size === 0) return

    // Detach all current children from the wrapper
    const children = [...model.children]
    for (const child of children) model.remove(child)

    // Rebuild bone hierarchy with the new childMap
    buildBoneHierarchy(
      model,
      elementMeshesRef.current,
      animConfig.animJson.childMap || null,
      animConfig.animJson.pivots || {},
    )
  }, [animConfig.animJson])

  // -----------------------------------------------------------------------
  // Apply texture to model when textureDataUrl changes OR model is rebuilt
  // -----------------------------------------------------------------------
  useEffect(() => {
    const model = modelRef.current
    if (!model) return

    const material = buildModelMaterial(animConfig.textureDataUrl ?? null)
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material
      }
    })
  }, [animConfig.textureDataUrl, modelVersion])

  // -----------------------------------------------------------------------
  // Mouse controls (orbit)
  // -----------------------------------------------------------------------
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && e.altKey) {
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    }
    if (e.button === 1) { // middle click
      draggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
    orbitRef.current.theta -= dx * 0.5
    orbitRef.current.phi = Math.max(-89, Math.min(89, orbitRef.current.phi + dy * 0.5))
  }, [])

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    orbitRef.current.radius = Math.max(0.5, Math.min(20, orbitRef.current.radius + e.deltaY * 0.005))
  }, [])

  // -----------------------------------------------------------------------
  // Playback controls
  // -----------------------------------------------------------------------
  const togglePlay = useCallback(() => {
    if (!selectedClip) return
    const next = !playing
    setPlaying(next)
    playingRef.current = next
    if (next) {
      clipTimeRef.current = 0
      lastFrameRef.current = performance.now()
    } else {
      // Reset bone transforms
      resetBoneTransforms()
    }
  }, [playing, selectedClip])

  const resetBoneTransforms = useCallback(() => {
    const pivots = useStore.getState().animConfig.animJson?.pivots || {}
    for (const [, group] of boneGroupsRef.current) {
      group.rotation.set(0, 0, 0)
      group.scale.set(1, 1, 1)
      const boneName = group.name.replace('bone_', '')
      const pivot = pivots[boneName]
      if (pivot) {
        group.position.set(pivot[0] / 16, pivot[1] / 16, pivot[2] / 16)
      } else {
        group.position.set(0, 0, 0)
      }
    }
  }, [])

  // -----------------------------------------------------------------------
  // File import handlers
  // -----------------------------------------------------------------------
  const handleImportObj = useCallback(async () => {
    const api = (window as any).api
    if (!api) return
    const filePath = await api.openDialog([{ name: 'OBJ Model', extensions: ['obj'] }])
    if (!filePath) return
    const content = await api.readFile(filePath)
    if (content) {
      useStore.getState().setAnimConfig({
        ...useStore.getState().animConfig,
        objPath: filePath,
        objContent: content,
      })
    }
  }, [])

  const handleImportTexture = useCallback(async () => {
    const api = (window as any).api
    if (!api) return
    const filePath = await api.openDialog([{ name: 'Texture', extensions: ['png', 'jpg', 'jpeg'] }])
    if (!filePath) return
    const base64 = await api.readFileBase64(filePath)
    if (base64) {
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
      useStore.getState().setAnimConfig({
        ...useStore.getState().animConfig,
        texturePath: filePath,
        textureDataUrl: `data:${mime};base64,${base64}`,
      })
    }
  }, [])

  const handleImportBbmodel = useCallback(async () => {
    const api = (window as any).api
    if (!api) return
    const filePath = await api.openDialog([{ name: 'Blockbench Model', extensions: ['bbmodel'] }])
    if (!filePath) return
    const content = await api.readFile(filePath)
    if (content) {
      try {
        // Parse .bbmodel client-side (import the parser)
        const bbmodel = JSON.parse(content)
        const { parseBbmodel, toAeroAnimJson } = await import('./bbmodel-parser-client')
        const result = parseBbmodel(bbmodel)
        const animJson = toAeroAnimJson(result)
        const clipNames = result.clips.map((c: any) => c.name)

        // Auto-seed state mappings from clip names (one state per clip)
        const currentConfig = useStore.getState().animConfig
        const existingClips = new Set(currentConfig.stateMappings.map(m => m.clipName))
        const newMappings = [...currentConfig.stateMappings]
        let nextId = newMappings.length === 0 ? 0 : Math.max(...newMappings.map(m => m.stateId)) + 1
        for (const name of clipNames) {
          if (!existingClips.has(name)) {
            newMappings.push({ stateId: nextId++, label: name, clipName: name })
          }
        }

        useStore.getState().setAnimConfig({
          ...currentConfig,
          bbmodelPath: filePath,
          animJson,
          clipNames,
          boneNames: result.boneNames,
          stateMappings: newMappings,
        })
      } catch (err) {
        console.error('Error parsing .bbmodel:', err)
      }
    }
  }, [])

  // -----------------------------------------------------------------------
  // State mapping — auto-seed from clip names on bbmodel import
  // -----------------------------------------------------------------------
  const updateStateMapping = useCallback((stateId: number, field: 'label' | 'clipName', value: string) => {
    const config = useStore.getState().animConfig
    useStore.getState().setAnimConfig({
      ...config,
      stateMappings: config.stateMappings.map(m =>
        m.stateId === stateId ? { ...m, [field]: value } : m,
      ),
    })
  }, [])

  const addStateMapping = useCallback(() => {
    const config = useStore.getState().animConfig
    const nextId = config.stateMappings.length === 0 ? 0 : Math.max(...config.stateMappings.map(m => m.stateId)) + 1
    useStore.getState().setAnimConfig({
      ...config,
      stateMappings: [...config.stateMappings, { stateId: nextId, label: '', clipName: '' }],
    })
  }, [])

  const removeStateMapping = useCallback((stateId: number) => {
    const config = useStore.getState().animConfig
    useStore.getState().setAnimConfig({
      ...config,
      stateMappings: config.stateMappings.filter(m => m.stateId !== stateId),
    })
  }, [])

  // Play a specific clip by name (used by per-row play buttons)
  const playClip = useCallback((clipName: string) => {
    if (selectedClipRef.current === clipName && playingRef.current) {
      // Stop if already playing this clip
      setPlaying(false)
      playingRef.current = false
      setSelectedClip(null)
      selectedClipRef.current = null
      resetBoneTransforms()
    } else {
      setSelectedClip(clipName)
      selectedClipRef.current = clipName
      setPlaying(true)
      playingRef.current = true
      clipTimeRef.current = 0
      lastFrameRef.current = performance.now()
    }
  }, [resetBoneTransforms])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const hasObj = !!animConfig.objContent
  const hasAnims = animConfig.clipNames.length > 0
  const hasTexture = !!animConfig.textureDataUrl

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 3D Viewport */}
      <div
        ref={canvasRef}
        className="flex-1 relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {!hasObj && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Card className="text-center max-w-sm space-y-3">
              <p className="text-lg font-medium text-foreground">No model loaded</p>
              <p className="text-sm text-muted-foreground">Import an OBJ model from Blockbench</p>
              <Button onClick={handleImportObj} variant="outline" className="w-full">Import OBJ</Button>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-1.5">Using AI or Blockbench MCP to create the model?</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={async () => {
                    const md = generateModelContext()
                    try {
                      await navigator.clipboard.writeText(md)
                      toast.success('Model context copied to clipboard — paste it into your AI chat')
                    } catch {
                      const api = (window as any).api
                      if (api) {
                        const filePath = await api.saveDialog(`${useStore.getState().name}_context.md`, [
                          { name: 'Markdown', extensions: ['md'] },
                        ])
                        if (filePath) {
                          await api.saveFile(filePath, md)
                          toast.success(`Saved to ${filePath}`)
                        }
                      }
                    }
                  }}
                >
                  Export Structure Context
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Right panel — animation config */}
      <div className="w-80 border-l border-border bg-card overflow-y-auto p-3 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Model & Animation</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={async () => {
              const md = generateModelContext()
              const api = (window as any).api
              // Try clipboard first
              try {
                await navigator.clipboard.writeText(md)
                toast.success('Model context copied to clipboard')
              } catch {
                // Fallback: save to file
                if (api) {
                  const filePath = await api.saveDialog(`${useStore.getState().name}_context.md`, [
                    { name: 'Markdown', extensions: ['md'] },
                  ])
                  if (filePath) {
                    await api.saveFile(filePath, md)
                    toast.success(`Saved to ${filePath}`)
                  }
                }
              }
            }}
          >
            Export Structure Context
          </Button>
        </div>

        {/* Import — Model */}
        <div className="space-y-1.5">
          <h4 className="text-xs text-muted-foreground">Model</h4>
          <div className="flex gap-1.5">
            <Button onClick={handleImportObj} variant="outline" className="flex-1 py-2 px-2 h-auto text-xs whitespace-normal text-left">
              {hasObj ? animConfig.objPath?.split(/[\\/]/).pop() : 'Import OBJ'}
            </Button>
            <Button onClick={handleImportTexture} variant="outline" className="flex-1 py-2 px-2 h-auto text-xs whitespace-normal text-left">
              {hasTexture ? animConfig.texturePath?.split(/[\\/]/).pop() : 'Texture (.png)'}
            </Button>
          </div>
        </div>

        {/* Import — Animations */}
        <div className="space-y-1.5">
          <h4 className="text-xs text-muted-foreground">Animations</h4>
          <Button onClick={handleImportBbmodel} variant="outline" className="w-full py-2 px-2 h-auto text-xs whitespace-normal text-left">
            {hasAnims ? `BBModel: ${animConfig.bbmodelPath?.split(/[\\/]/).pop()}` : 'Import Animations (.bbmodel)'}
          </Button>
        </div>

        {/* Bones list (collapsible) */}
        {animConfig.boneNames.length > 0 && (
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
              Bones ({animConfig.boneNames.length})
            </summary>
            <div className="text-xs space-y-0.5 mt-1">
              {animConfig.boneNames.map((name) => (
                <div key={name} className="px-2 py-0.5 bg-muted/50 rounded">{name}</div>
              ))}
            </div>
          </details>
        )}

        {/* Animation States — unified clip + state mapping table */}
        {hasAnims && (
          <div>
            <h4 className="text-xs text-muted-foreground mb-1">Animation States</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Each row maps a machine state ID to a clip. These generate Java constants.
            </p>

            {/* Column headers */}
            <div className="flex items-center gap-1 mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span className="w-8 text-center">ID</span>
              <span className="flex-1">Label</span>
              <span className="flex-1">Clip</span>
              <span className="w-14 text-center">Preview</span>
              <span className="w-5"></span>
            </div>

            {/* State mapping rows */}
            <div className="space-y-1">
              {animConfig.stateMappings.map((m) => {
                const clipData = m.clipName ? animConfig.animJson?.animations?.[m.clipName] : null
                const isPlaying = playing && selectedClip === m.clipName
                return (
                  <div key={m.stateId} className="flex items-center gap-1">
                    <span className="w-8 text-center text-xs font-mono bg-muted/50 rounded py-1">{m.stateId}</span>
                    <Input
                      value={m.label}
                      onChange={(e) => updateStateMapping(m.stateId, 'label', e.target.value)}
                      placeholder="idle"
                      className="flex-1 h-7 text-xs"
                    />
                    <select
                      value={m.clipName}
                      onChange={(e) => updateStateMapping(m.stateId, 'clipName', e.target.value)}
                      className="flex-1 h-7 text-xs bg-background border border-border rounded px-1"
                    >
                      <option value="">--</option>
                      {animConfig.clipNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <button
                      className={`w-14 h-7 rounded border text-xs transition-colors ${
                        isPlaying
                          ? 'bg-primary/20 border-primary text-foreground'
                          : 'border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                      } ${!m.clipName ? 'opacity-30 pointer-events-none' : ''}`}
                      onClick={() => m.clipName && playClip(m.clipName)}
                      title={clipData ? `${clipData.length}s ${clipData.loop ? 'loop' : 'once'}` : ''}
                    >
                      {isPlaying ? 'Stop' : 'Play'}
                    </button>
                    <button
                      className="w-5 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => removeStateMapping(m.stateId)}
                      title="Remove state"
                    >
                      x
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Add state button */}
            <Button onClick={addStateMapping} variant="outline" size="sm" className="w-full mt-2 h-7 text-xs">
              + Add State
            </Button>
          </div>
        )}

        {/* Info */}
        {hasObj && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Alt+drag: orbit | Scroll: zoom</div>
          </div>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------
// Keyframe sampling (linear interpolation, matches Aero_AnimationClip.sample)
// -------------------------------------------------------------------------
/**
 * Samples keyframes with per-keyframe interpolation mode.
 * Supports both legacy format { "0.0": [x,y,z] } and
 * new format { "0.0": { "value": [x,y,z], "interp": "linear" } }
 */
function sampleKeyframes(kfMap: Record<string, any>, time: number): [number, number, number] | null {
  type KfEntry = { time: number; value: [number, number, number]; interp: string }
  const entries: KfEntry[] = Object.entries(kfMap)
    .map(([t, v]) => {
      if (Array.isArray(v)) {
        // Legacy format
        return { time: parseFloat(t), value: v as [number, number, number], interp: 'linear' }
      }
      // New format with { value, interp }
      return { time: parseFloat(t), value: v.value as [number, number, number], interp: v.interp || 'linear' }
    })
    .sort((a, b) => a.time - b.time)

  if (entries.length === 0) return null
  if (entries.length === 1) return [...entries[0].value]
  if (time <= entries[0].time) return [...entries[0].value]
  if (time >= entries[entries.length - 1].time) return [...entries[entries.length - 1].value]

  // Find interval
  let lo = 0
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].time >= time) { lo = i - 1; break }
  }
  const hi = lo + 1
  const t0 = entries[lo].time
  const t1 = entries[hi].time
  const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0

  // Interp mode is on the destination keyframe (how to arrive)
  const mode = entries[hi].interp

  const a = entries[lo].value
  const b = entries[hi].value

  if (mode === 'step') {
    return [...a]
  }

  if (mode === 'catmullrom') {
    const p0 = lo > 0 ? entries[lo - 1].value : a
    const p3 = hi < entries.length - 1 ? entries[hi + 1].value : b
    return catmullRom(p0, a, b, p3, alpha)
  }

  // Linear (default)
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha,
  ]
}

/** Catmull-Rom spline interpolation */
function catmullRom(
  p0: [number, number, number], p1: [number, number, number],
  p2: [number, number, number], p3: [number, number, number],
  t: number,
): [number, number, number] {
  const t2 = t * t, t3 = t2 * t
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])]
}
