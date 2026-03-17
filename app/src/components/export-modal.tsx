import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useStore } from '@/hooks/use-store'
import { toast } from 'sonner'

interface ExportOptions {
  prefix: string
  outputDir: string
  includeJava: boolean
  includeGuiTexture: boolean
  includeModel: boolean
  includeAnimations: boolean
  includeDefinition: boolean
}

interface GeneratedFilePreview {
  name: string
  category: string
}

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useStore((s) => s.name)
  const animConfig = useStore((s) => s.animConfig)
  const serialize = useStore((s) => s.serialize)
  const overlayRef = useRef<HTMLDivElement>(null)

  const [options, setOptions] = useState<ExportOptions>({
    prefix: 'MyMod_',
    outputDir: '',
    includeJava: true,
    includeGuiTexture: true,
    includeModel: true,
    includeAnimations: true,
    includeDefinition: true,
  })
  const [exporting, setExporting] = useState(false)
  const [results, setResults] = useState<{ path: string; success: boolean }[] | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setResults(null)
      setExporting(false)
    }
  }, [open])

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const hasModel = !!(animConfig.objContent)
  const hasAnimations = !!(animConfig.animJson && animConfig.stateMappings.length > 0)
  const hasTexture = !!(animConfig.textureDataUrl)

  // Generate file preview list
  const previewFiles = getFilePreview(name, options, hasModel, hasAnimations, hasTexture)

  const handleBrowse = async () => {
    const api = (window as any).api
    if (!api) return
    const dir = await api.selectDirectory(options.outputDir || undefined)
    if (dir) setOptions({ ...options, outputDir: dir })
  }

  const handleExport = async () => {
    if (!options.outputDir) {
      toast.error('Please select an output directory')
      return
    }
    if (!options.prefix.trim()) {
      toast.error('Prefix cannot be empty')
      return
    }

    setExporting(true)
    try {
      const api = (window as any).api
      if (!api) throw new Error('Electron API not available')

      const data = serialize()
      const files = generateExportFiles(data, name, options, animConfig)

      // Write files to selected directory
      const writeResults: { path: string; success: boolean }[] = []
      for (const file of files) {
        const fullPath = `${options.outputDir}/${name}/${file.relativePath}`
        try {
          await api.saveFile(fullPath, file.content)
          writeResults.push({ path: file.relativePath, success: true })
        } catch (err: any) {
          writeResults.push({ path: file.relativePath, success: false })
        }
      }

      setResults(writeResults)
      const successCount = writeResults.filter(r => r.success).length
      toast.success(`Exported ${successCount}/${writeResults.length} files to ${options.outputDir}/${name}`)
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleOverlayClick}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[680px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-white">Export to Mod</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Generate source files for your mod project</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Prefix */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Mod Prefix</Label>
            <Input
              value={options.prefix}
              onChange={(e) => setOptions({ ...options, prefix: e.target.value })}
              placeholder="MyMod_"
              className="h-8 text-xs bg-zinc-800 border-zinc-600"
            />
            <p className="text-[10px] text-zinc-500">Used in class names: {options.prefix}Block{name}Controller</p>
          </div>

          {/* Output directory */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Output Directory</Label>
            <div className="flex gap-2">
              <Input
                value={options.outputDir}
                onChange={(e) => setOptions({ ...options, outputDir: e.target.value })}
                placeholder="Select a directory..."
                className="h-8 text-xs bg-zinc-800 border-zinc-600 flex-1"
                readOnly
              />
              <Button variant="secondary" size="sm" className="h-8 text-xs px-3" onClick={handleBrowse}>
                Browse...
              </Button>
            </div>
            {options.outputDir && (
              <p className="text-[10px] text-zinc-500">Files will be written to: {options.outputDir}/{name}/</p>
            )}
          </div>

          {/* What to include */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-300">Include</Label>
            <div className="grid grid-cols-2 gap-2">
              <Checkbox
                id="inc-java"
                checked={options.includeJava}
                onChange={(e) => setOptions({ ...options, includeJava: (e.target as HTMLInputElement).checked })}
                label="Java sources (Block, Tile, Container, Gui)"
              />
              <Checkbox
                id="inc-gui"
                checked={options.includeGuiTexture}
                onChange={(e) => setOptions({ ...options, includeGuiTexture: (e.target as HTMLInputElement).checked })}
                label="GUI texture (PNG)"
              />
              <Checkbox
                id="inc-model"
                checked={options.includeModel && hasModel}
                onChange={(e) => setOptions({ ...options, includeModel: (e.target as HTMLInputElement).checked })}
                disabled={!hasModel}
                label={`3D Model + texture${!hasModel ? ' (none imported)' : ''}`}
              />
              <Checkbox
                id="inc-anim"
                checked={options.includeAnimations && hasAnimations}
                onChange={(e) => setOptions({ ...options, includeAnimations: (e.target as HTMLInputElement).checked })}
                disabled={!hasAnimations}
                label={`Animations${!hasAnimations ? ' (none configured)' : ''}`}
              />
              <Checkbox
                id="inc-def"
                checked={options.includeDefinition}
                onChange={(e) => setOptions({ ...options, includeDefinition: (e.target as HTMLInputElement).checked })}
                label="Aero project file backup (.aeroproject)"
              />
            </div>
          </div>

          {/* File preview */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Files to generate ({previewFiles.length})</Label>
            <div className="bg-zinc-800/50 border border-zinc-700 rounded p-2 max-h-[140px] overflow-y-auto">
              {previewFiles.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No files selected</p>
              ) : (
                previewFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    {results ? (
                      <span className={`text-xs ${results[i]?.success ? 'text-emerald-400' : 'text-red-400'}`}>
                        {results[i]?.success ? '✓' : '✗'}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">•</span>
                    )}
                    <span className="text-[10px] text-zinc-500 w-14">{f.category}</span>
                    <span className="text-xs text-zinc-300 font-mono">{f.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-700 flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button
              variant="success"
              size="sm"
              className="h-8 text-xs px-4"
              onClick={handleExport}
              disabled={exporting || !options.outputDir}
            >
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Helpers ---

function getFilePreview(
  name: string,
  options: ExportOptions,
  hasModel: boolean,
  hasAnimations: boolean,
  hasTexture: boolean,
): GeneratedFilePreview[] {
  const p = options.prefix
  const files: GeneratedFilePreview[] = []

  if (options.includeJava) {
    files.push({ name: `${p}Block${name}Controller.java`, category: 'block' })
    files.push({ name: `${p}Tile${name}.java`, category: 'tile' })
    files.push({ name: `${p}Container${name}.java`, category: 'container' })
    files.push({ name: `${p}Gui${name}.java`, category: 'gui' })
    files.push({ name: `${p}Slot${name}Output.java`, category: 'slot' })
  }

  if (options.includeGuiTexture) {
    files.push({ name: `retronism_${name.toLowerCase()}.png`, category: 'texture' })
  }

  if (options.includeModel && hasModel) {
    files.push({ name: `${name}.obj`, category: 'model' })
    if (hasTexture) {
      files.push({ name: `${name}.png`, category: 'model' })
    }
  }

  if (options.includeAnimations && hasAnimations) {
    files.push({ name: `${name}.anim.json`, category: 'anim' })
    if (options.includeJava) {
      files.push({ name: `${p}Anim${name}.java`, category: 'anim' })
    }
  }

  if (options.includeDefinition) {
    files.push({ name: `${name}.aeroproject`, category: 'project' })
  }

  return files
}

interface ExportFile {
  relativePath: string
  content: string
}

function generateExportFiles(
  data: any,
  name: string,
  options: ExportOptions,
  animConfig: any,
): ExportFile[] {
  const p = options.prefix
  const files: ExportFile[] = []

  if (options.includeJava) {
    // We generate Java using the MCP codegen pattern, but with custom prefix
    // For now, we tell the user to use the MCP tool. In the future, we could
    // embed the codegen directly in the Electron app.
    // Instead, we generate stub files with the correct package/class names.
    files.push({
      relativePath: `src/block/${p}Block${name}Controller.java`,
      content: genControllerBlockPortable(name, p),
    })
    files.push({
      relativePath: `src/tile/${p}Tile${name}.java`,
      content: genTileEntityStub(name, p, data),
    })
    files.push({
      relativePath: `src/container/${p}Container${name}.java`,
      content: genContainerStub(name, p),
    })
    files.push({
      relativePath: `src/gui/${p}Gui${name}.java`,
      content: genGuiStub(name, p),
    })
    files.push({
      relativePath: `src/slot/${p}Slot${name}Output.java`,
      content: genOutputSlotPortable(name, p),
    })
  }

  if (options.includeModel && animConfig.objContent) {
    files.push({
      relativePath: `assets/models/${name}.obj`,
      content: animConfig.objContent,
    })
  }

  if (options.includeModel && animConfig.textureDataUrl) {
    // textureDataUrl is a data:image/png;base64,... string
    // Extract the base64 and save as binary later — for now save as data URL
    files.push({
      relativePath: `assets/models/${name}.png`,
      content: animConfig.textureDataUrl,
    })
  }

  if (options.includeAnimations && animConfig.animJson) {
    files.push({
      relativePath: `assets/models/${name}.anim.json`,
      content: JSON.stringify(animConfig.animJson, null, 2),
    })
    if (options.includeJava && animConfig.stateMappings?.length > 0) {
      files.push({
        relativePath: `src/render/${p}Anim${name}.java`,
        content: genAnimDefPortable(name, p, animConfig.stateMappings),
      })
    }
  }

  if (options.includeDefinition) {
    files.push({
      relativePath: `${name}.aeroproject`,
      content: JSON.stringify(data, null, 2),
    })
  }

  return files
}

// --- Portable Java generators (prefix-aware) ---

function genControllerBlockPortable(name: string, prefix: string): string {
  return `package net.minecraft.src;

/**
 * Controller block for ${name} multiblock.
 * Generated by Aero Machine Maker.
 *
 * TODO: Register this block in your mod class.
 * TODO: Adjust package/imports for your mod structure.
 */
public class ${prefix}Block${name}Controller extends BlockContainer {
    public ${prefix}Block${name}Controller(int id, int tex) {
        super(id, tex, Material.iron);
        setHardness(3.5F);
        setResistance(5.0F);
        setStepSound(Block.soundMetalFootstep);
        setBlockName("${name.toLowerCase()}Controller");
    }

    @Override
    protected TileEntity getBlockEntity() {
        return new ${prefix}Tile${name}();
    }

    @Override
    public boolean blockActivated(World world, int x, int y, int z, EntityPlayer player) {
        if (world.multiplayerWorld) return true;
        ${prefix}Tile${name} tile = (${prefix}Tile${name}) world.getBlockTileEntity(x, y, z);
        if (tile == null) return false;

        if (!tile.checkStructure(world, x, y, z)) {
            String debug = tile.getLastFailDebug();
            player.addChatMessage("Structure incomplete! " + (debug != null ? debug : ""));
            return true;
        }

        ModLoader.OpenGUI(player, new ${prefix}Gui${name}(player.inventory, tile));
        return true;
    }

    @Override
    public void onNeighborBlockChange(World world, int x, int y, int z, int neighborId) {
        ${prefix}Tile${name} tile = (${prefix}Tile${name}) world.getBlockTileEntity(x, y, z);
        if (tile != null) {
            tile.checkStructure(world, x, y, z);
        }
    }

    @Override
    public void onBlockRemoval(World world, int x, int y, int z) {
        ${prefix}Tile${name} tile = (${prefix}Tile${name}) world.getBlockTileEntity(x, y, z);
        if (tile != null) {
            tile.isFormed = false;
            for (int i = 0; i < tile.getSizeInventory(); i++) {
                ItemStack stack = tile.getStackInSlot(i);
                if (stack != null) {
                    float rx = world.rand.nextFloat() * 0.6F + 0.1F;
                    float ry = world.rand.nextFloat() * 0.6F + 0.1F;
                    float rz = world.rand.nextFloat() * 0.6F + 0.1F;
                    EntityItem entity = new EntityItem(world, x + rx, y + ry, z + rz, stack);
                    world.entityJoinedWorld(entity);
                }
            }
        }
        super.onBlockRemoval(world, x, y, z);
    }
}
`
}

function genTileEntityStub(name: string, prefix: string, data: any): string {
  const hasEnergy = data.ioTypes?.includes('energy')
  const hasFluid = data.ioTypes?.includes('fluid')
  const hasGas = data.ioTypes?.includes('gas')

  const interfaces = ['IInventory']
  if (hasEnergy) interfaces.push('/* IEnergyReceiver */')
  if (hasFluid) interfaces.push('/* IFluidHandler */')
  if (hasGas) interfaces.push('/* IGasHandler */')

  return `package net.minecraft.src;

/**
 * TileEntity for ${name} multiblock.
 * Generated by Aero Machine Maker.
 *
 * TODO: Implement interfaces for your energy/fluid/gas API.
 * TODO: Add structure validation (checkStructure).
 * TODO: Add recipe processing logic.
 */
public class ${prefix}Tile${name} extends TileEntity implements ${interfaces.join(', ')} {

    public boolean isFormed = false;
    private ItemStack[] inventory = new ItemStack[${data.guiComponents?.filter((c: any) => c.type === 'slot' || c.type === 'big_slot').length || 2}];
${hasEnergy ? `
    private int storedEnergy = 0;
    private int maxEnergy = ${data.capacity?.energy || 64000};
` : ''}${hasFluid ? `
    private int fluidAmount = 0;
    private int fluidCapacity = ${data.capacity?.fluid || 16000};
` : ''}${hasGas ? `
    private int gasAmount = 0;
    private int gasCapacity = ${data.capacity?.gas || 16000};
` : ''}
    public int processTime = 0;
    public int maxProcessTime = ${data.processTime || 200};

    private String lastFailDebug = null;
    public String getLastFailDebug() { return lastFailDebug; }

    public boolean checkStructure(World world, int cx, int cy, int cz) {
        // TODO: Generated structure validation goes here
        // Use the ${name}.json definition to build the STRUCTURE array
        lastFailDebug = "checkStructure not implemented";
        return false;
    }

    // --- IInventory ---
    @Override public int getSizeInventory() { return inventory.length; }
    @Override public ItemStack getStackInSlot(int slot) { return inventory[slot]; }
    @Override public String getInvName() { return "${name}"; }
    @Override public int getInventoryStackLimit() { return 64; }

    @Override
    public ItemStack decrStackSize(int slot, int amount) {
        if (inventory[slot] != null) {
            if (inventory[slot].stackSize <= amount) {
                ItemStack stack = inventory[slot];
                inventory[slot] = null;
                return stack;
            }
            ItemStack split = inventory[slot].splitStack(amount);
            if (inventory[slot].stackSize == 0) inventory[slot] = null;
            return split;
        }
        return null;
    }

    @Override
    public void setInventorySlotContents(int slot, ItemStack stack) {
        inventory[slot] = stack;
        if (stack != null && stack.stackSize > getInventoryStackLimit()) {
            stack.stackSize = getInventoryStackLimit();
        }
    }

    @Override
    public boolean canInteractWith(EntityPlayer player) {
        return worldObj.getBlockTileEntity(xCoord, yCoord, zCoord) == this
            && player.getDistanceSq(xCoord + 0.5, yCoord + 0.5, zCoord + 0.5) <= 64.0;
    }

    @Override
    public void readFromNBT(NBTTagCompound nbt) {
        super.readFromNBT(nbt);
        isFormed = nbt.getBoolean("Formed");
        // TODO: Read energy, fluid, gas, inventory from NBT
    }

    @Override
    public void writeToNBT(NBTTagCompound nbt) {
        super.writeToNBT(nbt);
        nbt.setBoolean("Formed", isFormed);
        // TODO: Write energy, fluid, gas, inventory to NBT
    }
}
`
}

function genContainerStub(name: string, prefix: string): string {
  return `package net.minecraft.src;

/**
 * Container for ${name} multiblock.
 * Generated by Aero Machine Maker.
 *
 * TODO: Add machine slots based on your GUI layout.
 */
public class ${prefix}Container${name} extends Container {

    private ${prefix}Tile${name} tile;

    public ${prefix}Container${name}(InventoryPlayer playerInv, ${prefix}Tile${name} tile) {
        this.tile = tile;

        // TODO: Add machine slots here (input, output, fuel)

        // Player inventory (3 rows)
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                addSlot(new Slot(playerInv, col + row * 9 + 9, 8 + col * 18, 84 + row * 18));
            }
        }

        // Hotbar
        for (int col = 0; col < 9; col++) {
            addSlot(new Slot(playerInv, col, 8 + col * 18, 142));
        }
    }

    public boolean isUsableByPlayer(EntityPlayer player) {
        return tile.canInteractWith(player);
    }

    public ItemStack getStackInSlot(int slotIndex) {
        return null; // TODO: Implement shift-click transfer
    }
}
`
}

function genGuiStub(name: string, prefix: string): string {
  const textureName = `retronism_${name.toLowerCase()}`
  return `package net.minecraft.src;

import org.lwjgl.opengl.GL11;

/**
 * GUI for ${name} multiblock.
 * Generated by Aero Machine Maker.
 *
 * TODO: Add energy bar, progress arrow, fluid/gas tank overlays.
 */
public class ${prefix}Gui${name} extends GuiContainer {

    private ${prefix}Tile${name} tile;
    private int textureID;

    public ${prefix}Gui${name}(InventoryPlayer playerInv, ${prefix}Tile${name} tile) {
        super(new ${prefix}Container${name}(playerInv, tile));
        this.tile = tile;
        this.xSize = 176;
        this.ySize = 166;
    }

    @Override
    protected void drawGuiContainerForegroundLayer() {
        fontRenderer.drawString("${name}", (xSize - fontRenderer.getStringWidth("${name}")) / 2, 6, 4210752);
        fontRenderer.drawString("Inventory", 8, ySize - 96 + 2, 4210752);

        if (!tile.isFormed) {
            fontRenderer.drawString("Structure incomplete!", 8, 20, 0xFF4444);
        }
    }

    @Override
    protected void drawGuiContainerBackgroundLayer(float partialTicks) {
        GL11.glColor4f(1.0F, 1.0F, 1.0F, 1.0F);
        textureID = this.mc.renderEngine.getTexture("/gui/${textureName}.png");
        this.mc.renderEngine.bindTexture(textureID);
        int x = (width - xSize) / 2;
        int y = (height - ySize) / 2;
        this.drawTexturedModalRect(x, y, 0, 0, xSize, ySize);
    }
}
`
}

function genOutputSlotPortable(name: string, prefix: string): string {
  return `package net.minecraft.src;

public class ${prefix}Slot${name}Output extends Slot {
    public ${prefix}Slot${name}Output(IInventory inv, int slotIndex, int x, int y) {
        super(inv, slotIndex, x, y);
    }

    @Override
    public boolean isItemValid(ItemStack stack) {
        return false;
    }
}
`
}

function genAnimDefPortable(name: string, prefix: string, stateMappings: any[]): string {
  const stateConstants = stateMappings.map((m: any) =>
    `    public static final int STATE_${m.label.toUpperCase().replace(/\s+/g, '_')} = ${m.stateId};`
  ).join('\n')

  const stateBuilderCalls = stateMappings.map((m: any) =>
    `        .state(STATE_${m.label.toUpperCase().replace(/\s+/g, '_')}, "${m.clipName}")`
  ).join('\n')

  return `package net.minecraft.src;

/**
 * Animation definition for ${name}.
 * Generated by Aero Machine Maker.
 *
 * Requires: AeroModelLib (aero.modellib package)
 */
public class ${prefix}Anim${name} {

    // State constants
${stateConstants}

    public static final Aero_MeshModel MODEL =
        Aero_ObjLoader.load("/models/${name}.obj");

    public static final Aero_AnimationBundle BUNDLE =
        Aero_AnimationLoader.load("/models/${name}.anim.json");

    public static final Aero_AnimationDefinition ANIM_DEF = new Aero_AnimationDefinition()
${stateBuilderCalls};
}
`
}
