import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { useStore } from '@/hooks/use-store'
import { blockRegistry, type BlockDef, type BlockCategory } from '@/core/types'
import { loadTextures, isTexturesReady, getBlockMaterial, getMinecraftBoxGeometry, clearMaterialCache, getTileDataUrl, getBlockTextureDataUrl } from '@/core/textures'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { BuildGuide } from '@/components/build-guide'

export function StructureEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    raycaster: THREE.Raycaster
    meshes: Map<string, THREE.Mesh>
    gridGroup: THREE.Group
    groundPlane: THREE.Mesh
    animId: number
    orbitState: { dragging: boolean; panning: boolean; lastX: number; lastY: number; theta: number; phi: number; radius: number }
    target: THREE.Vector3
    spaceDown: boolean
  } | null>(null)

  const blocks = useStore((s) => s.blocks)
  const dimensions = useStore((s) => s.dimensions)
  const selectedTool = useStore((s) => s.selectedTool)
  const selectedBlocks = useStore((s) => s.selectedBlocks)
  const layerFilter = useStore((s) => s.layerFilter)
  const pendingCamera = useStore((s) => s.pendingCamera)
  const pendingHighlight = useStore((s) => s.pendingHighlight)
  const registryVersion = useStore((s) => s.registryVersion)

  // Initialize Three.js
  useEffect(() => {
    const container = containerRef.current
    if (!container || sceneRef.current) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111111)

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    // No dynamic lights needed — Minecraft-style face brightness is baked
    // into vertex colors on the shared BoxGeometry (see textures.ts)

    // Ground grid (populated by dimensions effect)
    const gridGroup = new THREE.Group()
    scene.add(gridGroup)

    const { w, h, d } = useStore.getState().dimensions
    const target = new THREE.Vector3(w / 2 - 0.5, h / 2 - 0.5, d / 2 - 0.5)
    const orbitState = { dragging: false, panning: false, lastX: 0, lastY: 0, theta: 0.6, phi: 0.8, radius: 8 }
    let spaceDown = false

    function updateCamera() {
      camera.position.set(
        target.x + orbitState.radius * Math.sin(orbitState.phi) * Math.cos(orbitState.theta),
        target.y + orbitState.radius * Math.cos(orbitState.phi),
        target.z + orbitState.radius * Math.sin(orbitState.phi) * Math.sin(orbitState.theta),
      )
      camera.lookAt(target)
    }
    updateCamera()

    // Keyboard: space for pan mode
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.style.outline = 'none'
    canvas.style.userSelect = 'none'
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') { spaceDown = true; e.preventDefault() }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const s = useStore.getState()
        if (s.selectedBlocks.length > 0) {
          s.removeSelectedBlocks()
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') { spaceDown = false } }
    canvas.addEventListener('keydown', onKeyDown)
    canvas.addEventListener('keyup', onKeyUp)

    // Mouse controls: orbit (alt+drag / middle), pan (space+drag)
    canvas.addEventListener('mousedown', (e) => {
      if (e.altKey || e.button === 1) {
        orbitState.dragging = true
        orbitState.lastX = e.clientX
        orbitState.lastY = e.clientY
      } else if (spaceDown && e.button === 0) {
        orbitState.panning = true
        orbitState.lastX = e.clientX
        orbitState.lastY = e.clientY
      }
    })
    canvas.addEventListener('mousemove', (e) => {
      if (orbitState.panning) {
        // Pan: move target in camera-local XY plane
        const dx = (e.clientX - orbitState.lastX) * 0.002 * orbitState.radius
        const dy = (e.clientY - orbitState.lastY) * 0.002 * orbitState.radius
        const right = new THREE.Vector3()
        const up = new THREE.Vector3()
        camera.getWorldDirection(new THREE.Vector3())
        right.crossVectors(camera.up, new THREE.Vector3().subVectors(camera.position, target).normalize()).normalize()
        up.copy(camera.up)
        target.add(right.multiplyScalar(-dx))
        target.add(up.multiplyScalar(dy))
        orbitState.lastX = e.clientX
        orbitState.lastY = e.clientY
        updateCamera()
        return
      }
      if (!orbitState.dragging) return
      orbitState.theta += (e.clientX - orbitState.lastX) * 0.008
      orbitState.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitState.phi - (e.clientY - orbitState.lastY) * 0.008))
      orbitState.lastX = e.clientX
      orbitState.lastY = e.clientY
      updateCamera()
    })
    canvas.addEventListener('mouseup', () => { orbitState.dragging = false; orbitState.panning = false })
    let wheelLocked = false
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (wheelLocked) return
      orbitState.radius = Math.max(3, Math.min(30, orbitState.radius + e.deltaY * 0.01))
      updateCamera()
    }, { passive: false })

    // Raycast helper
    const raycaster = new THREE.Raycaster()
    function raycastBlocks(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(mouse, camera)
      const meshArray = Array.from(sceneRef.current?.meshes.values() || [])
      return raycaster.intersectObjects(meshArray, false)
        .filter(hit => hit.object.userData.key)
    }

    // Invisible ground plane for placing blocks on empty space (y=0 layer)
    const groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    )
    groundPlane.rotation.x = -Math.PI / 2
    groundPlane.position.set(w / 2 - 0.5, -0.5, d / 2 - 0.5)
    groundPlane.userData.isGround = true
    scene.add(groundPlane)

    function raycastGround(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(mouse, camera)
      return raycaster.intersectObject(groundPlane)
    }

    // Left-click: select existing block only (no placement)
    canvas.addEventListener('click', (e) => {
      if (e.altKey || spaceDown) return
      const hits = raycastBlocks(e)
      const store = useStore.getState()

      if (hits.length > 0) {
        const hit = hits[0]
        const key = hit.object.userData.key as string

        if (e.shiftKey) {
          // Add/remove from multi-selection
          const current = store.selectedBlocks
          if (current.includes(key)) {
            store.setSelectedBlocks(current.filter(k => k !== key))
          } else {
            store.setSelectedBlocks([...current, key])
          }
        } else {
          // Normal click: replace selection
          store.setSelectedBlocks([key])
        }
      } else {
        // Click on empty space: deselect everything unless holding shift
        if (!e.shiftKey) {
          store.setSelectedBlocks([])
        }
      }
    })

    // Right-click: place block on adjacent face, or on ground if empty
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (e.altKey || spaceDown) return
      const hits = raycastBlocks(e)
      if (hits.length > 0) {
        const hit = hits[0]
        const normal = hit.face?.normal
        if (normal) {
          const store = useStore.getState()
          const pos = hit.object.userData.key.split(',').map(Number)
          const nx = pos[0] + Math.round(normal.x)
          const ny = pos[1] + Math.round(normal.y)
          const nz = pos[2] + Math.round(normal.z)
          const { w, h, d } = store.dimensions
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && nz >= 0 && nz < d) {
            store.placeBlock(nx, ny, nz, store.selectedTool)
          }
        }
      } else {
        // Right-click on empty: place on ground
        const groundHits = raycastGround(e)
        if (groundHits.length > 0) {
          const point = groundHits[0].point
          const bx = Math.round(point.x)
          const bz = Math.round(point.z)
          const store = useStore.getState()
          const { w, h, d } = store.dimensions
          if (bx >= 0 && bx < w && bz >= 0 && bz < d) {
            store.placeBlock(bx, 0, bz, store.selectedTool)
          }
        }
      }
    })

    const animId = requestAnimationFrame(function animate() {
      if (sceneRef.current) sceneRef.current.animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    })

    sceneRef.current = { scene, camera, renderer, raycaster, meshes: new Map(), gridGroup, groundPlane, animId, orbitState, target, spaceDown }

    // Load real block textures from terrain.png + custom assets
    loadTextures().then((ok) => {
      if (ok) {
        setTexturesReady(true)
        clearMaterialCache()
        // Remove all existing meshes so they get recreated with textured materials
        const sc = sceneRef.current
        if (sc) {
          for (const [, mesh] of sc.meshes) {
            sc.scene.remove(mesh)
          }
          sc.meshes.clear()
        }
        // Trigger the sync effect to recreate all meshes
        useStore.setState({ blocks: new Map(useStore.getState().blocks) })
      }
    })

    // Handle resize — lock wheel briefly to prevent zoom glitches from layout shifts
    const resizeObs = new ResizeObserver(() => {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      wheelLocked = true
      setTimeout(() => { wheelLocked = false }, 150)
    })
    resizeObs.observe(container)

    return () => {
      cancelAnimationFrame(animId)
      resizeObs.disconnect()
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('keyup', onKeyUp)
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // Port overlay: colored wireframe cube on blocks with portType
  const PORT_COLORS: Record<string, number> = { energy: 0xfbbf24, fluid: 0x3b82f6, gas: 0xa3a3a3, item: 0xf97316 }
  function updatePortOverlay(mesh: THREE.Mesh, portType: string | null) {
    const existing = mesh.children.find(c => c.userData.isPortOverlay)
    if (existing) mesh.remove(existing)
    if (!portType || !PORT_COLORS[portType]) return
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 1.0, 1.0))
    const overlay = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: PORT_COLORS[portType], linewidth: 2 }))
    overlay.userData.isPortOverlay = true
    mesh.add(overlay)
  }

  // Controller overlay: red wireframe
  function updateControllerOverlay(mesh: THREE.Mesh, isController: boolean) {
    const existing = mesh.children.find(c => c.userData.isControllerOverlay)
    if (existing) mesh.remove(existing)
    if (!isController) return
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05))
    const overlay = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff2222, linewidth: 3 }))
    overlay.userData.isControllerOverlay = true
    mesh.add(overlay)
  }

  // Selection overlay: bright wireframe outline (like Minecraft's block highlight)
  function updateSelectionOverlay(mesh: THREE.Mesh, selected: boolean) {
    const existing = mesh.children.find(c => c.userData.isSelectionOverlay)
    if (existing) mesh.remove(existing)
    if (!selected) return
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.94, 0.94))
    const overlay = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }))
    overlay.userData.isSelectionOverlay = true
    mesh.add(overlay)
  }


  // Sync blocks to meshes
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return

    // Clear material cache when registry changes to ensure new textures are picked up
    clearMaterialCache()

    // Shared geometry with Minecraft face brightness vertex colors
    const sharedGeom = getMinecraftBoxGeometry()

    // Remove old meshes
    for (const [key, mesh] of s.meshes) {
      if (!blocks.has(key)) {
        s.scene.remove(mesh)
          ; (mesh.material as THREE.Material).dispose()
        s.meshes.delete(key)
      }
    }

    // Add/update
    for (const [key, block] of blocks) {
      const [x, y, z] = key.split(',').map(Number)

      // Layer filter
      if (layerFilter >= 0 && y !== layerFilter) {
        if (s.meshes.has(key)) {
          s.meshes.get(key)!.visible = false
        }
        continue
      }

      const isSelected = selectedBlocks.includes(key)
      const portType = block.portType || null
      const isCtrl = block.isController || false
      let mesh = s.meshes.get(key)

      // We always recreate materials when registryVersion changes because of the clearMaterialCache() above
      const needsNewMaterial = !mesh || mesh.userData.blockType !== block.type || mesh.userData.portType !== portType || true

      const needsOverlayUpdate = mesh && (
        mesh.userData.portType !== portType ||
        mesh.userData.isCtrl !== isCtrl
      )
      const needsSelectionUpdate = mesh && (
        mesh.userData.selected !== isSelected
      )

      if (!mesh) {
        const mat = getBlockMaterial(block.type, portType || undefined)
        mesh = new THREE.Mesh(sharedGeom, mat)
        mesh.position.set(x, y, z)
        mesh.userData.key = key
        mesh.userData.blockType = block.type
        mesh.userData.selected = isSelected
        mesh.userData.portType = portType
        mesh.userData.isCtrl = isCtrl
        s.scene.add(mesh)
        s.meshes.set(key, mesh)
        updatePortOverlay(mesh, portType)
        updateControllerOverlay(mesh, isCtrl)
        updateSelectionOverlay(mesh, isSelected)
      } else {
        mesh.visible = true
        // If registry changed, we might need a refresh anyway
        mesh.material = getBlockMaterial(block.type, portType || undefined)
        mesh.userData.blockType = block.type

        if (needsOverlayUpdate) {
          mesh.userData.portType = portType
          mesh.userData.isCtrl = isCtrl
          updatePortOverlay(mesh, portType)
          updateControllerOverlay(mesh, isCtrl)
        }
        if (needsSelectionUpdate) {
          mesh.userData.selected = isSelected
          updateSelectionOverlay(mesh, isSelected)
        }
      }
    }
  }, [blocks, selectedBlocks, layerFilter, registryVersion])

  // Handle camera commands from MCP WebSocket
  useEffect(() => {
    if (!pendingCamera || !sceneRef.current) return
    const cmd = useStore.getState().consumeCameraCommand()
    if (!cmd) return
    const orbit = sceneRef.current.orbitState
    if (cmd.theta !== undefined) orbit.theta = cmd.theta
    if (cmd.phi !== undefined) orbit.phi = cmd.phi
    if (cmd.radius !== undefined) orbit.radius = cmd.radius
    // Trigger camera update by modifying position (render loop will pick it up)
    const { target } = sceneRef.current
    const camera = sceneRef.current.camera
    camera.position.set(
      target.x + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
      target.y + orbit.radius * Math.cos(orbit.phi),
      target.z + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    )
    camera.lookAt(target)
  }, [pendingCamera])

  // Handle highlight commands from MCP WebSocket
  useEffect(() => {
    if (!pendingHighlight || !sceneRef.current) return
    const cmd = useStore.getState().consumeHighlightCommand()
    if (!cmd) return
    const { keys, duration } = cmd
    const meshes = sceneRef.current.meshes
    const originalMaterials: Map<string, any> = new Map()
    const highlightMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.6 })

    // Apply highlight
    for (const key of keys) {
      const mesh = meshes.get(key)
      if (mesh) {
        originalMaterials.set(key, mesh.material)
        mesh.material = highlightMat
      }
    }

    // Revert after duration
    setTimeout(() => {
      for (const [key, mat] of originalMaterials) {
        const mesh = meshes.get(key)
        if (mesh) mesh.material = mat
      }
      highlightMat.dispose()
    }, duration)
  }, [pendingHighlight])

  // Update camera target, grid, and auto-fit when dimensions change
  useEffect(() => {
    if (sceneRef.current) {
      const { w, h, d } = dimensions
      sceneRef.current.target.set(w / 2 - 0.5, h / 2 - 0.5, d / 2 - 0.5)
      // Update ground plane position
      sceneRef.current.groundPlane.position.set(w / 2 - 0.5, -0.5, d / 2 - 0.5)
      // Auto-fit: radius based on the largest dimension
      const maxDim = Math.max(w, h, d)
      sceneRef.current.orbitState.radius = Math.max(5, maxDim * 2)

      // Rebuild ground grid
      const gg = sceneRef.current.gridGroup
      while (gg.children.length) gg.remove(gg.children[0])
      const gridW = Math.max(w, 5) + 4
      const gridD = Math.max(d, 5) + 4
      const mainMat = new THREE.LineBasicMaterial({ color: 0x333333 })
      for (let x = 0; x <= gridW; x++) {
        const gx = x - (gridW - w) / 2 - 0.5
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(gx, -0.5, -(gridD - d) / 2 - 0.5),
          new THREE.Vector3(gx, -0.5, d + (gridD - d) / 2 - 0.5),
        ])
        gg.add(new THREE.Line(geom, mainMat))
      }
      for (let z = 0; z <= gridD; z++) {
        const gz = z - (gridD - d) / 2 - 0.5
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-(gridW - w) / 2 - 0.5, -0.5, gz),
          new THREE.Vector3(w + (gridW - w) / 2 - 0.5, -0.5, gz),
        ])
        gg.add(new THREE.Line(geom, mainMat))
      }
      // Build area border
      const areaMat = new THREE.LineBasicMaterial({ color: 0x666666 })
      const areaGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(w - 0.5, -0.5, -0.5),
        new THREE.Vector3(w - 0.5, -0.5, d - 0.5),
        new THREE.Vector3(-0.5, -0.5, d - 0.5),
        new THREE.Vector3(-0.5, -0.5, -0.5),
      ])
      gg.add(new THREE.Line(areaGeom, areaMat))
    }
  }, [dimensions])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [addBlockOpen, setAddBlockOpen] = useState(false)
  const [texturesReady, setTexturesReady] = useState(isTexturesReady())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['vanilla']))

  // Organize blocks by category (reactive to registryVersion)
  const mergedCategories = useMemo(() => {
    const cats: Record<string, BlockDef[]> = {}
    for (const def of blockRegistry.values()) {
      let catKey = def.category as string
      if (catKey === 'mod' && def.modId) {
        catKey = `mod:${def.modId}`
      }
      if (!cats[catKey]) cats[catKey] = []
      cats[catKey].push(def)
    }
    // Sort blocks alphabetically within each category
    for (const key of Object.keys(cats)) {
      cats[key].sort((a, b) => a.label.localeCompare(b.label))
    }
    return cats
  }, [registryVersion])

  const categoryLabels: Record<string, string> = {
    vanilla: 'Vanilla',
    custom: 'Custom',
  }

  const categoryOrder = useMemo(() => {
    const keys = Object.keys(mergedCategories)
    const mods = keys.filter(k => k.startsWith('mod:')).sort()
    const tailOrder = ['vanilla', 'custom']
    return [...mods, ...tailOrder].filter(k => keys.includes(k))
  }, [mergedCategories])

  const selectedDef = blockRegistry.get(selectedTool)

  // Detect mixed mod blocks in the structure
  const mixedModWarning = useMemo(() => {
    const modIds = new Set<string>()
    for (const entry of blocks.values()) {
      const def = blockRegistry.get(entry.type)
      if (def?.modId) modIds.add(def.modId)
    }
    if (modIds.size < 2) return null
    const names = [...modIds].map(id => {
      const def = [...blockRegistry.values()].find(d => d.modId === id)
      return def?.modName || id.toUpperCase()
    })
    return names
  }, [blocks])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Compact toolbar: selected block + palette toggle + layer slider */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-background border-b border-border gap-2 z-30 relative">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(!paletteOpen)}
            className="flex items-center gap-2 px-2 py-1 rounded border border-border hover:bg-muted/50 transition-colors"
          >
            <BlockIcon def={selectedDef} size={20} />
            <span className="text-sm font-medium">{selectedDef?.label || selectedTool}</span>
            <span className="text-xs text-muted-foreground">{paletteOpen ? '\u25B2' : '\u25BC'}</span>
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            Layer:
            <input
              type="range"
              min={-1}
              max={dimensions.h - 1}
              value={layerFilter}
              onChange={(e) => useStore.getState().setLayerFilter(+e.target.value)}
              className="w-20"
            />
            <span className="text-foreground font-bold w-6">{layerFilter < 0 ? 'All' : layerFilter}</span>
          </label>
        </div>
      </div>

      {/* Block palette dropdown — absolute overlay to avoid resizing the canvas */}
      {paletteOpen && (
        <div className="absolute left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 max-h-80 overflow-auto shadow-lg" style={{ top: '34px' }}>
          {categoryOrder.map((cat) => {
            const defs = mergedCategories[cat]
            if (!defs || defs.length === 0) return null
            const isMod = cat.startsWith('mod:')
            const isCollapsible = isMod || cat === 'vanilla'
            const isCollapsed = collapsedSections.has(cat)
            const label = isMod
              ? `${defs[0].modName || cat.split(':')[1].toUpperCase()} (${defs.length})`
              : `${categoryLabels[cat] || cat} (${defs.length})`

            const toggleCollapse = () => {
              setCollapsedSections(prev => {
                const next = new Set(prev)
                if (next.has(cat)) next.delete(cat)
                else next.add(cat)
                return next
              })
            }

            return (
              <div key={cat} className="mb-1.5">
                <button
                  onClick={isCollapsible ? toggleCollapse : undefined}
                  className={`flex items-center gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1 ${isCollapsible ? 'cursor-pointer hover:text-foreground' : ''}`}
                >
                  {isCollapsible && <span className="text-[8px]">{isCollapsed ? '\u25B6' : '\u25BC'}</span>}
                  {label}
                </button>
                {!isCollapsed && (
                  <div className="flex flex-wrap gap-1">
                    {defs.map((def) => (
                      <button
                        key={def.id}
                        title={`${def.label}${def.mcId ? ` (ID: ${def.mcId})` : ''}`}
                        onClick={() => {
                          useStore.getState().setSelectedTool(def.id)
                          setPaletteOpen(false)
                        }}
                        className={`
                          flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors
                          ${selectedTool === def.id
                            ? 'border-primary bg-primary/20 text-foreground font-semibold'
                            : 'border-border hover:bg-muted/50 text-foreground'
                          }
                        `}
                      >
                        <BlockIcon def={def} size={16} />
                        <span className="max-w-[80px] truncate">{def.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div className="mt-2 pt-2 border-t border-border">
            <button
              onClick={() => setAddBlockOpen(!addBlockOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-dashed border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="text-sm font-bold">+</span> Add Block
            </button>
          </div>
          {addBlockOpen && <AddBlockForm onDone={() => setAddBlockOpen(false)} />}
        </div>
      )}

      {/* Mixed-mod warning banner */}
      {mixedModWarning && (
        <div className="px-3 py-1.5 bg-yellow-900/40 border-b border-yellow-700/50 flex items-center gap-2 text-xs text-yellow-300">
          <span>⚠</span>
          <span>
            Mixing blocks from different mods ({mixedModWarning.join(' + ')}) — cross-mod compatibility is not guaranteed.
          </span>
        </div>
      )}

      {/* Three.js viewport */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-[#111] cursor-crosshair select-none" style={{ outline: 'none' }} />

      {/* Build Guide collapsible */}
      <BuildGuideDropdown />
    </div>
  )
}

function BlockIcon({ def, size = 16 }: { def?: { color: number; terrainIndex?: number; texturePath?: string; id: string }; size?: number }) {
  if (!def) return <span className="inline-block rounded-sm border border-white/20" style={{ width: size, height: size, background: '#ff00ff' }} />

  // Use unified texture lookup: custom texture > terrain tile > null
  const dataUrl = getBlockTextureDataUrl(def.id)
  if (dataUrl) {
    return <img src={dataUrl} width={size} height={size} className="rounded-sm border border-white/10" style={{ imageRendering: 'pixelated' }} />
  }

  // Fallback: color swatch
  return (
    <span
      className="inline-block rounded-sm border border-white/20"
      style={{ width: size, height: size, background: `#${def.color.toString(16).padStart(6, '0')}` }}
    />
  )
}


const CHAR_POOL = 'iklmnopqrstuvwxyzZ0123456789'
function nextAvailableChar(): string {
  const used = new Set([...blockRegistry.values()].map(b => b.char))
  for (const ch of CHAR_POOL) {
    if (!used.has(ch)) return ch
  }
  return '?'
}

function AddBlockForm({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<BlockCategory>('mod')
  const [color, setColor] = useState('#6a8a6a')
  const [mcId, setMcId] = useState(213)
  const registerBlock = useStore((s) => s.registerBlock)

  const handleSubmit = () => {
    const cleanId = id.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+/, '')
    if (!cleanId || blockRegistry.has(cleanId)) {
      toast.error(blockRegistry.has(cleanId) ? `Block "${cleanId}" already exists` : 'Invalid ID')
      return
    }
    const char = nextAvailableChar()
    registerBlock({
      id: cleanId,
      category,
      label: label || cleanId,
      color: parseInt(color.replace('#', ''), 16),
      char,
      builtIn: false,
      mcId: mcId || undefined,
      terrainIndex: 45,
    })
    toast.success(`Block "${cleanId}" registered`)
    setId('')
    setLabel('')
    onDone()
  }

  return (
    <div className="mt-2 p-2 rounded border border-border bg-muted/30 space-y-1.5">
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Label>ID (snake_case)</Label>
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="crusher_ctrl" />
        </div>
        <div className="flex-1">
          <Label>Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Crusher Controller" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value as BlockCategory)}>
            <option value="mod">Mod</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
        <div className="w-16">
          <Label>Color</Label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="w-full h-7 rounded border border-border cursor-pointer" />
        </div>
        <div className="w-16">
          <Label>MC ID</Label>
          <Input type="number" value={mcId} min={200} max={255} onChange={(e) => setMcId(+e.target.value)} />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={handleSubmit}>Add</Button>
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}

function BuildGuideDropdown() {
  const showBuildGuide = useStore((s) => s.showBuildGuide)

  return (
    <div className="border-t border-border bg-background">
      <button
        onClick={() => useStore.getState().setShowBuildGuide(!showBuildGuide)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="font-semibold">Build Guide</span>
        <span>{showBuildGuide ? '\u25B2' : '\u25BC'}</span>
      </button>
      {showBuildGuide && (
        <div className="max-h-64 overflow-auto border-t border-border">
          <BuildGuide />
        </div>
      )}
    </div>
  )
}
