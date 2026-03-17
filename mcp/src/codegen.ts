import { GeneratedFile, SerializedMultiblock, blockRegistry } from './types.js';
import { getState, getSlotInfo, getComponentByType, serialize, getAnimConfig } from './state.js';

const PREFIX = 'Retronism_';

export function generateAllFiles(): GeneratedFile[] {
  const json = serialize();
  const state = getState();
  const name = json.name;
  const files: GeneratedFile[] = [];

  const hasEnergy = json.ioTypes.includes('energy');
  const hasFluid = json.ioTypes.includes('fluid');
  const hasGas = json.ioTypes.includes('gas');
  const hasItem = json.ioTypes.includes('item');
  const slotInfo = getSlotInfo();
  const totalSlots = slotInfo.inputs.length + slotInfo.outputs.length;

  // 0. JSON definition
  files.push({
    name: `${name}.json`,
    relativePath: `tools/multiblock-designer/output/${name}.json`,
    content: JSON.stringify(json, null, 2),
  });

  // 1. Controller Block
  files.push({
    name: `${PREFIX}Block${name}Controller.java`,
    relativePath: `src/retronism/block/${PREFIX}Block${name}Controller.java`,
    content: genControllerBlock(name),
  });

  // 3. Tile Entity
  files.push({
    name: `${PREFIX}Tile${name}.java`,
    relativePath: `src/retronism/tile/${PREFIX}Tile${name}.java`,
    content: genTileEntity(json, name, hasEnergy, hasFluid, hasGas, hasItem, totalSlots, slotInfo),
  });

  // 4. Container
  files.push({
    name: `${PREFIX}Container${name}.java`,
    relativePath: `src/retronism/container/${PREFIX}Container${name}.java`,
    content: genContainer(json, name, totalSlots, slotInfo),
  });

  // 5. GUI
  files.push({
    name: `${PREFIX}Gui${name}.java`,
    relativePath: `src/retronism/gui/${PREFIX}Gui${name}.java`,
    content: genGui(json, name, hasEnergy, hasFluid, hasGas),
  });

  // 6. Output Slot
  if (slotInfo.outputs.length > 0) {
    files.push({
      name: `${PREFIX}Slot${name}Output.java`,
      relativePath: `src/retronism/slot/${PREFIX}Slot${name}Output.java`,
      content: genOutputSlot(name),
    });
  }

  // 7. Blockbench model (if linked)
  if (state.model) {
    files.push({
      name: `${name}.model.json`,
      relativePath: `src/retronism/assets/models/${name}.model.json`,
      content: JSON.stringify({
        name: state.model.name,
        elements: state.model.elements,
        textureName: state.model.textureName,
      }, null, 2),
    });
  }

  // 9. Animation files (if configured)
  const animConfig = getAnimConfig();
  if (animConfig.animJson) {
    // .anim.json
    files.push({
      name: `${name}.anim.json`,
      relativePath: `src/retronism/assets/models/${name}.anim.json`,
      content: JSON.stringify(animConfig.animJson, null, 2),
    });
  }

  if (animConfig.objContent) {
    // .obj model
    files.push({
      name: `${name}.obj`,
      relativePath: `src/retronism/assets/models/${name}.obj`,
      content: animConfig.objContent,
    });
  }

  if (animConfig.stateMappings.length > 0 && animConfig.animJson) {
    // AnimationDef Java code
    files.push({
      name: `${PREFIX}Anim${name}.java`,
      relativePath: `src/retronism/render/${PREFIX}Anim${name}.java`,
      content: genAnimationDef(name, animConfig.stateMappings),
    });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function genControllerBlock(name: string): string {
  // Check if this machine has ports
  const state = getState();
  const json = serialize();
  const controllerHasPorts = json.portModes && Object.keys(json.portModes).length > 0;

  return `package retronism.block;

import net.minecraft.src.*;${controllerHasPorts ? '\nimport retronism.api.Retronism_PortRegistry;' : ''}

public class ${PREFIX}Block${name}Controller extends BlockContainer {
    public ${PREFIX}Block${name}Controller(int id, int tex) {
        super(id, tex, Material.iron);
        setHardness(3.5F);
        setResistance(5.0F);
        setStepSound(Block.soundMetalFootstep);
        setBlockName("${name.toLowerCase()}Controller");
    }

    @Override
    protected TileEntity getBlockEntity() {
        return new ${PREFIX}Tile${name}();
    }

    @Override
    public boolean blockActivated(World world, int x, int y, int z, EntityPlayer player) {
        if (world.multiplayerWorld) return true;
        ${PREFIX}Tile${name} tile = (${PREFIX}Tile${name}) world.getBlockTileEntity(x, y, z);
        if (tile == null) return false;

        if (!tile.checkStructure(world, x, y, z)) {
            String debug = tile.getLastFailDebug();
            player.addChatMessage("Structure incomplete! " + (debug != null ? debug : ""));
            return true;
        }

        ModLoader.OpenGUI(player, new ${PREFIX}Gui${name}(player.inventory, tile));
        return true;
    }

    @Override
    public void onNeighborBlockChange(World world, int x, int y, int z, int neighborId) {
        ${PREFIX}Tile${name} tile = (${PREFIX}Tile${name}) world.getBlockTileEntity(x, y, z);
        if (tile != null) {
            tile.checkStructure(world, x, y, z);
        }
    }

    @Override
    public void onBlockRemoval(World world, int x, int y, int z) {${controllerHasPorts ? `
        Retronism_PortRegistry.unregisterAllForController(x, y, z);` : ''}
        ${PREFIX}Tile${name} tile = (${PREFIX}Tile${name}) world.getBlockTileEntity(x, y, z);
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
`;
}

function genTileEntity(
  json: SerializedMultiblock, name: string,
  hasEnergy: boolean, hasFluid: boolean, hasGas: boolean, hasItem: boolean,
  totalSlots: number, slotInfo: ReturnType<typeof getSlotInfo>,
): string {
  const interfaces = ['IInventory'];
  if (hasEnergy) interfaces.push('Retronism_IEnergyReceiver');
  if (hasFluid) interfaces.push('Retronism_IFluidHandler');
  if (hasGas) interfaces.push('Retronism_IGasHandler');

  const inputSlots = slotInfo.inputs.length;
  const outputSlots = slotInfo.outputs.length;

  // Build PORTS array from JSON portModes + portTypes
  const portEntries: { sx: number; sy: number; sz: number; portType: string; portMode: string }[] = [];
  if (json.portModes && json.portTypes) {
    for (const key of Object.keys(json.portModes)) {
      const [sx, sy, sz] = key.split(',').map(Number);
      const mode = json.portModes[key];
      const type = json.portTypes[key] || 'energy';
      portEntries.push({ sx, sy, sz, portType: type, portMode: mode });
    }
  }
  const hasPorts = portEntries.length > 0;

  let code = `package retronism.tile;

import net.minecraft.src.*;
${hasFluid ? 'import retronism.api.Retronism_IFluidHandler;\nimport retronism.api.Retronism_FluidType;\n' : ''}${hasGas ? 'import retronism.api.Retronism_IGasHandler;\nimport retronism.api.Retronism_GasType;\n' : ''}${hasEnergy ? 'import retronism.api.Retronism_IEnergyReceiver;\n' : ''}${hasPorts ? 'import retronism.api.Retronism_PortRegistry;\n' : ''}import retronism.Retronism_Registry;
public class ${PREFIX}Tile${name} extends TileEntity implements ${interfaces.join(', ')} {

    private ItemStack[] inventory = new ItemStack[${totalSlots}];
    public boolean isFormed = false;
`;

  if (hasEnergy) {
    code += `
    private int storedEnergy = 0;
    private int maxEnergy = ${json.capacity.energy};
`;
  }

  if (hasFluid) {
    code += `
    private int fluidType = Retronism_FluidType.NONE;
    private int fluidAmount = 0;
    private int fluidCapacity = ${json.capacity.fluid};
`;
  }

  if (hasGas) {
    code += `
    private int gasType = Retronism_GasType.NONE;
    private int gasAmount = 0;
    private int gasCapacity = ${json.capacity.gas};
`;
  }

  if (json.structType === 'machine') {
    code += `
    public int processTime = 0;
    public int maxProcessTime = ${json.processTime};
    private int energyPerTick = ${json.energyPerTick};
`;
  }

  // Structure pattern
  const structResult = genStructureArray(json, name);

  // Build expectedIds array initialization
  const hasMetaBlocks = structResult.typeMappings.some(m => m.mcMeta !== undefined);
  const expectedIdsInit = structResult.typeMappings
    .map(m => `        expectedIds[${m.constName}] = ${m.javaBlockIdExpr};`)
    .join('\n');
  const expectedMetaInit = hasMetaBlocks
    ? structResult.typeMappings
        .map(m => `        expectedMeta[${m.constName}] = ${m.mcMeta !== undefined ? m.mcMeta : -1};`)
        .join('\n')
    : '';

  // Generate PORTS array
  let portsCode = '';
  if (hasPorts) {
    const portTypeMap: Record<string, string> = {
      energy: 'Retronism_PortRegistry.PORT_TYPE_ENERGY',
      fluid: 'Retronism_PortRegistry.PORT_TYPE_FLUID',
      gas: 'Retronism_PortRegistry.PORT_TYPE_GAS',
    };
    const portModeMap: Record<string, string> = {
      input: 'Retronism_PortRegistry.PORT_MODE_INPUT',
      output: 'Retronism_PortRegistry.PORT_MODE_OUTPUT',
      input_output: 'Retronism_PortRegistry.PORT_MODE_INPUT',
    };
    const portLines = portEntries.map(p =>
      `        {${p.sx}, ${p.sy}, ${p.sz}, ${portTypeMap[p.portType] || portTypeMap.energy}, ${portModeMap[p.portMode] || portModeMap.input}},`
    ).join('\n');
    portsCode = `
    // Port definitions: {structX, structY, structZ, portType, portMode}
    private static final int[][] PORTS = {
${portLines}
    };

    private int formedRotation = -1;
    private boolean portsRegistered = false;
`;
  }

  code += `
${structResult.code}
${portsCode}
    private String lastFailDebug = null;
    public String getLastFailDebug() { return lastFailDebug; }

    public boolean checkStructure(World world, int cx, int cy, int cz) {
        int ctrlX = -1, ctrlY = -1, ctrlZ = -1;
        for (int y = 0; y < STRUCTURE.length; y++)
            for (int z = 0; z < STRUCTURE[y].length; z++)
                for (int x = 0; x < STRUCTURE[y][z].length; x++)
                    if (STRUCTURE[y][z][x] == ${structResult.controllerConst}) { ctrlX = x; ctrlY = y; ctrlZ = z; }
        if (ctrlX == -1) { isFormed = false; return false; }

        int[] expectedIds = new int[TYPE_COUNT];
${expectedIdsInit}${hasMetaBlocks ? `
        int[] expectedMeta = new int[TYPE_COUNT];
        for (int i = 0; i < TYPE_COUNT; i++) expectedMeta[i] = -1;
${expectedMetaInit}` : ''}

        int[][] facings = {
            { 1, 0, 0, 1},
            { 0, 1,-1, 0},
            {-1, 0, 0,-1},
            { 0,-1, 1, 0},
        };

        lastFailDebug = null;
        String allFails = "";

        for (int f = 0; f < 4; f++) {
            boolean ok = true;
            for (int sy = 0; sy < STRUCTURE.length && ok; sy++) {
                for (int sz = 0; sz < STRUCTURE[sy].length && ok; sz++) {
                    for (int sx = 0; sx < STRUCTURE[sy][sz].length && ok; sx++) {
                        int expected = STRUCTURE[sy][sz][sx];
                        if (expected == TYPE_AIR) continue;
                        int relX = sx - ctrlX;
                        int relZ = sz - ctrlZ;
                        int wx = cx + relX * facings[f][0] + relZ * facings[f][2];
                        int wy = cy + (sy - ctrlY);
                        int wz = cz + relX * facings[f][1] + relZ * facings[f][3];
                        int blockId = world.getBlockId(wx, wy, wz);${hasMetaBlocks ? `
                        int meta = world.getBlockMetadata(wx, wy, wz);
                        boolean match = (blockId == expectedIds[expected]) && (expectedMeta[expected] < 0 || meta == expectedMeta[expected]);` : `
                        boolean match = (blockId == expectedIds[expected]);`}
                        if (!match) {
                            allFails += "rot" + f + ":s(" + sx + "," + sy + "," + sz + ")w(" + wx + "," + wy + "," + wz + ")exp=" + expectedIds[expected] + "got=" + blockId + "${hasMetaBlocks ? `:" + meta + "` : `"`} | ";
                            ok = false;
                        }
                    }
                }
            }
            if (ok) {
                boolean wasFormed = isFormed;
                isFormed = true;${hasPorts ? `
                formedRotation = f;
                if (!wasFormed) {
                    registerPorts(cx, cy, cz, facings[f]);
                    applyPortMetadata(world, cx, cy, cz, facings[f]);
                }` : ''}
                return true;
            }
        }
${hasPorts ? `
        if (isFormed) {
            unregisterPorts(cx, cy, cz);
        }` : ''}
        lastFailDebug = allFails;
        isFormed = false;${hasPorts ? '\n        formedRotation = -1;' : ''}
        return false;
    }
`;

  // Port register/unregister methods
  if (hasPorts) {
    code += `
    private void registerPorts(int cx, int cy, int cz, int[] facing) {
        int ctrlX = -1, ctrlZ = -1;
        for (int y = 0; y < STRUCTURE.length; y++)
            for (int z = 0; z < STRUCTURE[y].length; z++)
                for (int x = 0; x < STRUCTURE[y][z].length; x++)
                    if (STRUCTURE[y][z][x] == ${structResult.controllerConst}) { ctrlX = x; ctrlZ = z; }
        for (int[] port : PORTS) {
            int relX = port[0] - ctrlX, relZ = port[2] - ctrlZ;
            int wx = cx + relX * facing[0] + relZ * facing[2];
            int wy = cy + (port[1] - ${json.controllerPos ? json.controllerPos.split(',').map(Number)[1] : 0});
            int wz = cz + relX * facing[1] + relZ * facing[3];
            Retronism_PortRegistry.registerPort(wx, wy, wz, cx, cy, cz, port[3], port[4]);
        }
        portsRegistered = true;
    }

    private void unregisterPorts(int cx, int cy, int cz) {
        Retronism_PortRegistry.unregisterAllForController(cx, cy, cz);
        portsRegistered = false;
    }

    private void applyPortMetadata(World world, int cx, int cy, int cz, int[] facing) {
        int ctrlX = -1, ctrlZ = -1, ctrlY = -1;
        for (int y = 0; y < STRUCTURE.length; y++)
            for (int z = 0; z < STRUCTURE[y].length; z++)
                for (int x = 0; x < STRUCTURE[y][z].length; x++)
                    if (STRUCTURE[y][z][x] == ${structResult.controllerConst}) { ctrlX = x; ctrlY = y; ctrlZ = z; }
        for (int[] port : PORTS) {
            int relX = port[0] - ctrlX, relZ = port[2] - ctrlZ;
            int wx = cx + relX * facing[0] + relZ * facing[2];
            int wy = cy + (port[1] - ctrlY);
            int wz = cz + relX * facing[1] + relZ * facing[3];
            int meta = port[3] - 1; // PORT_TYPE_ENERGY=1->0, FLUID=2->1, GAS=3->2
            world.setBlockMetadataWithNotify(wx, wy, wz, meta);
        }
    }
`;
  }

  // updateEntity for machines
  if (json.structType === 'machine') {
    let portReRegister = '';
    if (hasPorts) {
      portReRegister = `
        // Re-register ports after world load
        if (isFormed && !portsRegistered && formedRotation >= 0) {
            int[][] facings = {
                { 1, 0, 0, 1}, { 0, 1, -1, 0}, {-1, 0, 0,-1}, { 0,-1, 1, 0},
            };
            registerPorts(xCoord, yCoord, zCoord, facings[formedRotation]);
        }

        // Periodically recheck structure integrity
        if (isFormed && ++recheckTimer >= 20) {
            recheckTimer = 0;
            checkStructure(worldObj, xCoord, yCoord, zCoord);
        }
`;
    }
    code += `${hasPorts ? '\n    private int recheckTimer = 0;\n' : ''}
    @Override
    public void updateEntity() {
        if (worldObj.multiplayerWorld) return;
${portReRegister}
        if (!isFormed) return;

        boolean canProcess = canProcess();
        if (canProcess && storedEnergy >= energyPerTick) {
            storedEnergy -= energyPerTick;
            processTime++;
            if (processTime >= maxProcessTime) {
                processTime = 0;
                processItem();
            }
        } else if (!canProcess) {
            processTime = 0;
        }
    }

    private boolean canProcess() {
        if (inventory[0] == null) return false;
        // TODO: Add recipe lookup here
        return true;
    }

    private void processItem() {
        // TODO: Add recipe processing here
    }
`;
  }

  // IInventory
  code += `
    // --- IInventory ---
    @Override
    public int getSizeInventory() { return inventory.length; }

    @Override
    public ItemStack getStackInSlot(int slot) { return inventory[slot]; }

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
    public String getInvName() { return "${name}"; }

    @Override
    public int getInventoryStackLimit() { return 64; }

    @Override
    public boolean canInteractWith(EntityPlayer player) {
        return worldObj.getBlockTileEntity(xCoord, yCoord, zCoord) == this
            && player.getDistanceSq(xCoord + 0.5, yCoord + 0.5, zCoord + 0.5) <= 64.0;
    }
`;

  // Energy
  if (hasEnergy) {
    code += `
    // --- IEnergyReceiver ---
    @Override
    public int receiveEnergy(int amount) {
        int accepted = Math.min(amount, maxEnergy - storedEnergy);
        storedEnergy += accepted;
        return accepted;
    }

    @Override
    public int getStoredEnergy() { return storedEnergy; }

    @Override
    public int getMaxEnergy() { return maxEnergy; }

    public int getEnergyScaled(int scale) {
        return maxEnergy > 0 ? storedEnergy * scale / maxEnergy : 0;
    }
`;
  }

  // Fluid
  if (hasFluid) {
    code += `
    // --- IFluidHandler ---
    @Override
    public int receiveFluid(int type, int amountMB) {
        if (fluidType != Retronism_FluidType.NONE && fluidType != type) return 0;
        int accepted = Math.min(amountMB, fluidCapacity - fluidAmount);
        if (accepted > 0) { fluidType = type; fluidAmount += accepted; }
        return accepted;
    }

    @Override
    public int extractFluid(int type, int amountMB) {
        if (fluidType != type) return 0;
        int extracted = Math.min(amountMB, fluidAmount);
        fluidAmount -= extracted;
        if (fluidAmount <= 0) { fluidAmount = 0; fluidType = Retronism_FluidType.NONE; }
        return extracted;
    }

    @Override public int getFluidType() { return fluidType; }
    @Override public int getFluidAmount() { return fluidAmount; }
    @Override public int getFluidCapacity() { return fluidCapacity; }
`;
  }

  // Gas
  if (hasGas) {
    code += `
    // --- IGasHandler ---
    @Override
    public int receiveGas(int type, int amountMB) {
        if (gasType != Retronism_GasType.NONE && gasType != type) return 0;
        int accepted = Math.min(amountMB, gasCapacity - gasAmount);
        if (accepted > 0) { gasType = type; gasAmount += accepted; }
        return accepted;
    }

    @Override
    public int extractGas(int type, int amountMB) {
        if (gasType != type) return 0;
        int extracted = Math.min(amountMB, gasAmount);
        gasAmount -= extracted;
        if (gasAmount <= 0) { gasAmount = 0; gasType = Retronism_GasType.NONE; }
        return extracted;
    }

    @Override public int getGasType() { return gasType; }
    @Override public int getGasAmount() { return gasAmount; }
    @Override public int getGasCapacity() { return gasCapacity; }
`;
  }

  // Scaling helpers
  if (json.structType === 'machine') {
    code += `
    public int getCookProgressScaled(int scale) {
        return maxProcessTime > 0 ? processTime * scale / maxProcessTime : 0;
    }
`;
  }

  // NBT
  code += `
    // --- NBT ---
    @Override
    public void readFromNBT(NBTTagCompound nbt) {
        super.readFromNBT(nbt);
        isFormed = nbt.getBoolean("Formed");
`;
  if (hasPorts) code += `        formedRotation = nbt.getInteger("FormedRotation");\n`;
  if (hasEnergy) code += `        storedEnergy = nbt.getInteger("Energy");\n`;
  if (hasFluid) {
    code += `        fluidType = nbt.getInteger("FluidType");\n`;
    code += `        fluidAmount = nbt.getInteger("FluidAmount");\n`;
  }
  if (hasGas) {
    code += `        gasType = nbt.getInteger("GasType");\n`;
    code += `        gasAmount = nbt.getInteger("GasAmount");\n`;
  }
  if (json.structType === 'machine') {
    code += `        processTime = nbt.getShort("ProcessTime");\n`;
  }
  code += `
        NBTTagList items = nbt.getTagList("Items");
        inventory = new ItemStack[${totalSlots}];
        for (int i = 0; i < items.tagCount(); i++) {
            NBTTagCompound slot = (NBTTagCompound) items.tagAt(i);
            int idx = slot.getByte("Slot") & 255;
            if (idx < inventory.length) {
                int id = slot.getShort("id");
                int count = slot.getByte("Count");
                int dmg = slot.getShort("Damage");
                inventory[idx] = new ItemStack(id, count, dmg);
            }
        }
    }

    @Override
    public void writeToNBT(NBTTagCompound nbt) {
        super.writeToNBT(nbt);
        nbt.setBoolean("Formed", isFormed);
`;
  if (hasPorts) code += `        nbt.setInteger("FormedRotation", formedRotation);\n`;
  if (hasEnergy) code += `        nbt.setInteger("Energy", storedEnergy);\n`;
  if (hasFluid) {
    code += `        nbt.setInteger("FluidType", fluidType);\n`;
    code += `        nbt.setInteger("FluidAmount", fluidAmount);\n`;
  }
  if (hasGas) {
    code += `        nbt.setInteger("GasType", gasType);\n`;
    code += `        nbt.setInteger("GasAmount", gasAmount);\n`;
  }
  if (json.structType === 'machine') {
    code += `        nbt.setShort("ProcessTime", (short) processTime);\n`;
  }
  code += `
        NBTTagList items = new NBTTagList();
        for (int i = 0; i < inventory.length; i++) {
            if (inventory[i] != null) {
                NBTTagCompound slot = new NBTTagCompound();
                slot.setByte("Slot", (byte) i);
                slot.setShort("id", (short) inventory[i].itemID);
                slot.setByte("Count", (byte) inventory[i].stackSize);
                slot.setShort("Damage", (short) inventory[i].getItemDamage());
                items.setTag(slot);
            }
        }
        nbt.setTag("Items", items);
    }
}
`;

  return code;
}

interface BlockTypeMapping {
  constName: string;
  intValue: number;
  javaBlockIdExpr: string; // Java expression to get block ID
  mcMeta?: number; // If defined, also check block metadata
}

interface StructureArrayResult {
  code: string;
  controllerConst: string;
  typeCount: number;
  typeMappings: BlockTypeMapping[];
}

function genStructureArray(json: SerializedMultiblock, name: string): StructureArrayResult {
  // Collect all chars used in the structure
  const usedChars = new Set<string>();
  for (const layer of json.structure) {
    for (const row of layer.pattern) {
      for (const ch of row) {
        if (ch !== ' ') usedChars.add(ch);
      }
    }
  }

  // Find controller position and char
  const controllerPos = json.controllerPos;
  let controllerChar: string | null = null;
  if (controllerPos) {
    const [cx, cy, cz] = controllerPos.split(',').map(Number);
    for (const layer of json.structure) {
      if (layer.layer === cy) {
        if (layer.pattern[cz] && layer.pattern[cz][cx] && layer.pattern[cz][cx] !== ' ') {
          controllerChar = layer.pattern[cz][cx];
        }
      }
    }
  }

  const charToInt: Record<string, number> = { ' ': 0 };
  let nextInt = 1;
  let code = '    private static final int TYPE_AIR = 0;\n';

  // TYPE_CONTROLLER = 1
  code += `    private static final int TYPE_CONTROLLER = 1;\n`;
  const controllerConst = 'TYPE_CONTROLLER';
  const typeMappings: BlockTypeMapping[] = [];
  const lowerName = name.charAt(0).toLowerCase() + name.slice(1);
  typeMappings.push({
    constName: 'TYPE_CONTROLLER',
    intValue: 1,
    javaBlockIdExpr: `Retronism_Registry.${lowerName}ControllerBlock.blockID`,
  });
  nextInt = 2;

  // --- Handle all block chars ---
  for (const ch of usedChars) {
    const blockId = json.legend[ch];
    if (!blockId || blockId === 'air') continue;
    const blockDef = blockRegistry.get(blockId);
    if (!blockDef) continue;

    // Skip controller char if only used at controller position
    if (ch === controllerChar) {
      let usedElsewhere = false;
      for (const layer of json.structure) {
        for (let z = 0; z < layer.pattern.length; z++) {
          for (let x = 0; x < layer.pattern[z].length; x++) {
            if (layer.pattern[z][x] === ch) {
              const key = `${x},${layer.layer},${z}`;
              if (key !== controllerPos) usedElsewhere = true;
            }
          }
        }
      }
      if (!usedElsewhere) {
        charToInt[ch] = 1; // TYPE_CONTROLLER
        continue;
      }
    }

    if (charToInt[ch] !== undefined) continue;
    charToInt[ch] = nextInt;
    const constName = `TYPE_${blockDef.id.toUpperCase()}`;
    code += `    private static final int ${constName} = ${nextInt};\n`;

    let javaBlockIdExpr: string;
    if (blockId === 'machine_port') {
      javaBlockIdExpr = 'Retronism_Registry.machinePortBlock.blockID';
    } else {
      javaBlockIdExpr = `${blockDef.mcId ?? 0}`;
    }
    typeMappings.push({ constName, intValue: nextInt, javaBlockIdExpr });
    nextInt++;
  }

  code += `    private static final int TYPE_COUNT = ${nextInt};\n`;

  code += '\n    private static final int[][][] STRUCTURE = {\n';
  for (const layer of json.structure) {
    code += `        { // Layer ${layer.layer}\n`;
    for (let z = 0; z < layer.pattern.length; z++) {
      const row = layer.pattern[z];
      const ints = row.map((ch, x) => {
        const key = `${x},${layer.layer},${z}`;
        if (key === controllerPos) return 1; // TYPE_CONTROLLER
        return charToInt[ch] || 0;
      });
      code += `            {${ints.join(', ')}},\n`;
    }
    code += '        },\n';
  }
  code += '    };\n';

  return { code, controllerConst, typeCount: nextInt, typeMappings };
}

function genContainer(
  json: SerializedMultiblock, name: string, totalSlots: number,
  slotInfo: ReturnType<typeof getSlotInfo>,
): string {
  const inputSlots = slotInfo.inputs.length;
  const outputSlots = slotInfo.outputs.length;
  const guiW = json.guiWidth || 176;
  const guiH = json.guiHeight || 166;
  const invX = Math.floor((guiW - 162) / 2);  // 162 = 9 slots × 18px, centered
  const invY = guiH - 83;  // 83px from bottom edge

  let slotCode = '';
  let slotIdx = 0;
  for (const slot of slotInfo.inputs) {
    slotCode += `        addSlot(new Slot(tile, ${slotIdx}, ${slot.x}, ${slot.y}));\n`;
    slotIdx++;
  }
  for (const slot of slotInfo.outputs) {
    slotCode += `        addSlot(new ${PREFIX}Slot${name}Output(tile, ${slotIdx}, ${slot.x}, ${slot.y}));\n`;
    slotIdx++;
  }

  const syncFields: { field: string; getter: string }[] = [];
  if (json.ioTypes.includes('energy')) {
    syncFields.push({ field: 'lastEnergy', getter: 'tile.getStoredEnergy()' });
  }
  if (json.structType === 'machine') {
    syncFields.push({ field: 'lastProcessTime', getter: 'tile.processTime' });
    syncFields.push({ field: 'lastMaxProcessTime', getter: 'tile.maxProcessTime' });
  }

  const lastFieldDecl = syncFields.map(f => `    private int ${f.field} = -1;`).join('\n');
  const syncCheck = syncFields.map((f, i) =>
    `        if (${f.field} != ${f.getter}) {\n            ${f.field} = ${f.getter};\n            for (int j = 0; j < this.field_20121_g.size(); j++) {\n                ((ICrafting)this.field_20121_g.get(j)).func_20158_a(this, ${i}, ${f.field});\n            }\n        }`
  ).join('\n');
  const syncReceive = syncFields.map((f, i) =>
    `        if (id == ${i}) { /* ${f.field} */ }`
  ).join('\n');

  return `package retronism.container;

import net.minecraft.src.*;
${outputSlots > 0 ? `import retronism.slot.${PREFIX}Slot${name}Output;\n` : ''}import retronism.tile.${PREFIX}Tile${name};

public class ${PREFIX}Container${name} extends Container {

    private ${PREFIX}Tile${name} tile;
${lastFieldDecl}

    public ${PREFIX}Container${name}(InventoryPlayer playerInv, ${PREFIX}Tile${name} tile) {
        this.tile = tile;

        // Machine slots
${slotCode}
        // Player inventory (3 rows)
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                addSlot(new Slot(playerInv, col + row * 9 + 9, ${invX} + col * 18, ${invY} + row * 18));
            }
        }

        // Hotbar
        for (int col = 0; col < 9; col++) {
            addSlot(new Slot(playerInv, col, ${invX} + col * 18, ${invY + 58}));
        }
    }

    public boolean isUsableByPlayer(EntityPlayer player) {
        return tile.canInteractWith(player);
    }

    public void updateCraftingResults() {
        super.updateCraftingResults();
${syncCheck}
    }

    public void func_20112_a(int id, int value) {
${syncReceive}
    }

    public ItemStack getStackInSlot(int slotIndex) {
        ItemStack result = null;
        Slot slot = (Slot) this.slots.get(slotIndex);
        if (slot != null && slot.getHasStack()) {
            ItemStack slotStack = slot.getStack();
            result = slotStack.copy();
            if (slotIndex < ${totalSlots}) {
                if (!func_28125_a(slotStack, ${totalSlots}, ${totalSlots + 36}, true)) return null;
            } else {
                if (!func_28125_a(slotStack, 0, ${inputSlots}, false)) return null;
            }
            if (slotStack.stackSize == 0) slot.putStack(null);
            else slot.onSlotChanged();
        }
        return result;
    }
}
`;
}

function genGui(
  json: SerializedMultiblock, name: string,
  hasEnergy: boolean, hasFluid: boolean, hasGas: boolean,
): string {
  const textureName = `retronism_${name.toLowerCase()}`;
  let overlayCode = '';

  const energyBar = getComponentByType('energy_bar');
  if (hasEnergy && energyBar) {
    const bx = energyBar.x + 1, by = energyBar.y + 1;
    const bw = energyBar.w - 2, bh = energyBar.h - 2;
    overlayCode += `
        // Energy bar fill
        int barX = x + ${bx}, barY = y + ${by}, barW = ${bw}, barH = ${bh};
        int scaled = tile.getEnergyScaled(barH);
        if (scaled > 0) {
            int top = barY + barH - scaled;
            for (int sy = top; sy < barY + barH; sy++) {
                int color = (sy % 2 == 0) ? 0xFF3BFB98 : 0xFF36E38A;
                drawRect(barX, sy, barX + barW, sy + 1, color);
            }
        }
`;
  }

  const arrow = getComponentByType('progress_arrow');
  if (json.structType === 'machine' && arrow) {
    const dir = (arrow as any).direction || 'right';
    if (dir === 'right') {
      overlayCode += `
        // Progress arrow (right)
        int cookScale = tile.getCookProgressScaled(24);
        if (cookScale > 0) {
            this.drawTexturedModalRect(x + ${arrow.x}, y + ${arrow.y}, 176, 14, cookScale + 1, 17);
        }
`;
    } else if (dir === 'left') {
      overlayCode += `
        // Progress arrow (left)
        int cookScale = tile.getCookProgressScaled(24);
        if (cookScale > 0) {
            this.drawTexturedModalRect(x + ${arrow.x} + 24 - cookScale - 1, y + ${arrow.y}, 176 + 24 - cookScale - 1, 14, cookScale + 1, 17);
        }
`;
    } else if (dir === 'down') {
      overlayCode += `
        // Progress arrow (down)
        int cookScale = tile.getCookProgressScaled(24);
        if (cookScale > 0) {
            this.drawTexturedModalRect(x + ${arrow.x}, y + ${arrow.y}, 176, 14, 17, cookScale + 1);
        }
`;
    } else {
      overlayCode += `
        // Progress arrow (up)
        int cookScale = tile.getCookProgressScaled(24);
        if (cookScale > 0) {
            this.drawTexturedModalRect(x + ${arrow.x}, y + ${arrow.y} + 24 - cookScale - 1, 176, 14 + 24 - cookScale - 1, 17, cookScale + 1);
        }
`;
    }
  }

  const fluidTank = getComponentByType('fluid_tank') || getComponentByType('fluid_tank_small');
  if (hasFluid && fluidTank) {
    const tx = fluidTank.x + 1, ty = fluidTank.y + 1;
    const tw = fluidTank.w - 2, th = fluidTank.h - 2;
    overlayCode += `
        // Fluid tank fill
        int fluidScaled = tile.getFluidAmount() * ${th} / Math.max(1, tile.getFluidCapacity());
        if (fluidScaled > 0) {
            drawRect(x + ${tx}, y + ${ty} + ${th} - fluidScaled, x + ${tx} + ${tw}, y + ${ty} + ${th}, 0xFF2850DC);
        }
`;
  }

  const gasTank = getComponentByType('gas_tank') || getComponentByType('gas_tank_small');
  if (hasGas && gasTank) {
    const gx = gasTank.x + 1, gy = gasTank.y + 1;
    const gw = gasTank.w - 2, gh = gasTank.h - 2;
    overlayCode += `
        // Gas tank fill
        int gasScaled = tile.getGasAmount() * ${gh} / Math.max(1, tile.getGasCapacity());
        if (gasScaled > 0) {
            drawRect(x + ${gx}, y + ${gy} + ${gh} - gasScaled, x + ${gx} + ${gw}, y + ${gy} + ${gh}, 0xFFAAAAAA);
        }
`;
  }

  // Build tooltip code
  let tooltipChecks = '';
  if (hasEnergy && energyBar) {
    const ex1 = energyBar.x, ey1 = energyBar.y;
    const ex2 = energyBar.x + energyBar.w, ey2 = energyBar.y + energyBar.h;
    tooltipChecks += `
        if (relMouseX >= ${ex1} && relMouseX < ${ex2} && relMouseY >= ${ey1} && relMouseY < ${ey2}) {
            tooltip = "Energy: " + tile.getStoredEnergy() + " / " + tile.getMaxEnergy() + " RN";
        }`;
  }
  if (hasFluid && fluidTank) {
    const fx1 = fluidTank.x, fy1 = fluidTank.y;
    const fx2 = fluidTank.x + fluidTank.w, fy2 = fluidTank.y + fluidTank.h;
    tooltipChecks += `
        ${tooltipChecks ? 'else ' : ''}if (relMouseX >= ${fx1} && relMouseX < ${fx2} && relMouseY >= ${fy1} && relMouseY < ${fy2}) {
            tooltip = "Fluid: " + tile.getFluidAmount() + " / " + tile.getFluidCapacity() + " mB";
        }`;
  }
  if (hasGas && gasTank) {
    const gx1 = gasTank.x, gy1 = gasTank.y;
    const gx2 = gasTank.x + gasTank.w, gy2 = gasTank.y + gasTank.h;
    tooltipChecks += `
        ${tooltipChecks ? 'else ' : ''}if (relMouseX >= ${gx1} && relMouseX < ${gx2} && relMouseY >= ${gy1} && relMouseY < ${gy2}) {
            tooltip = "Gas: " + tile.getGasAmount() + " / " + tile.getGasCapacity() + " mB";
        }`;
  }

  return `package retronism.gui;

import net.minecraft.src.*;
import org.lwjgl.opengl.GL11;
import retronism.tile.${PREFIX}Tile${name};
import retronism.container.${PREFIX}Container${name};

public class ${PREFIX}Gui${name} extends GuiContainer {

    private ${PREFIX}Tile${name} tile;
    private int textureID;
    private int mouseX;
    private int mouseY;

    public ${PREFIX}Gui${name}(InventoryPlayer playerInv, ${PREFIX}Tile${name} tile) {
        super(new ${PREFIX}Container${name}(playerInv, tile));
        this.tile = tile;
        this.xSize = ${json.guiWidth || 176};
        this.ySize = ${json.guiHeight || 166};
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTick) {
        this.mouseX = mouseX;
        this.mouseY = mouseY;
        super.drawScreen(mouseX, mouseY, partialTick);
    }

    @Override
    protected void drawGuiContainerForegroundLayer() {
        fontRenderer.drawString("${name}", (xSize - fontRenderer.getStringWidth("${name}")) / 2, 6, 4210752);
        fontRenderer.drawString("Inventory", ${Math.floor(((json.guiWidth || 176) - 162) / 2)}, ySize - 96 + 2, 4210752);

        if (!tile.isFormed) {
            fontRenderer.drawString("Structure incomplete!", 8, 20, 0xFF4444);
            return;
        }

        int guiLeft = (this.width - this.xSize) / 2;
        int guiTop = (this.height - this.ySize) / 2;
        int relMouseX = this.mouseX - guiLeft;
        int relMouseY = this.mouseY - guiTop;

        String tooltip = null;
${tooltipChecks}

        if (tooltip != null) {
            int tw = this.fontRenderer.getStringWidth(tooltip);
            int tx = relMouseX - tw - 5;
            if (tx < 0) tx = relMouseX + 12;
            int ty = relMouseY - 12;
            this.drawGradientRect(tx - 3, ty - 3, tx + tw + 3, ty + 11, -1073741824, -1073741824);
            this.fontRenderer.drawStringWithShadow(tooltip, tx, ty, -1);
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
${overlayCode}
    }
}
`;
}

function genOutputSlot(name: string): string {
  return `package retronism.slot;

import net.minecraft.src.*;

public class ${PREFIX}Slot${name}Output extends Slot {
    public ${PREFIX}Slot${name}Output(IInventory inv, int slotIndex, int x, int y) {
        super(inv, slotIndex, x, y);
    }

    @Override
    public boolean isItemValid(ItemStack stack) {
        return false;
    }
}
`;
}

function genAnimationDef(name: string, stateMappings: { stateId: number; label: string; clipName: string }[]): string {
  const lowerName = name.toLowerCase();
  const stateConstants = stateMappings.map(m =>
    `    public static final int STATE_${m.label.toUpperCase().replace(/\s+/g, '_')} = ${m.stateId};`
  ).join('\n');

  const stateBuilderCalls = stateMappings.map(m =>
    `        .state(STATE_${m.label.toUpperCase().replace(/\s+/g, '_')}, "${m.clipName}")`
  ).join('\n');

  return `package retronism.render;

import aero.modellib.*;

/**
 * Animation definition for ${name}.
 * Generated by Aero Machine Maker — do not edit manually.
 *
 * Usage in TileEntity:
 *   public final Aero_AnimationState animState = ${PREFIX}Anim${name}.ANIM_DEF.createState(${PREFIX}Anim${name}.BUNDLE);
 *
 * In updateEntity():
 *   animState.tick();
 *   animState.setState(isProcessing ? STATE_PROCESSING : STATE_IDLE);
 *
 * In renderer:
 *   Aero_MeshRenderer.renderModel(MODEL, tile, tileX, tileY, tileZ, animState.getCurrentClip(), animState.getTime(), BUNDLE);
 */
public class ${PREFIX}Anim${name} {

    // State constants
${stateConstants}

    // Model and animation bundle (loaded once, cached)
    public static final Aero_MeshModel MODEL =
        Aero_ObjLoader.load("/models/${name}.obj");

    public static final Aero_AnimationBundle BUNDLE =
        Aero_AnimationLoader.load("/models/${name}.anim.json");

    // Animation definition: maps state IDs to clip names
    public static final Aero_AnimationDefinition ANIM_DEF = new Aero_AnimationDefinition()
${stateBuilderCalls};
}
`;
}
