import { Card, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useStore } from '@/hooks/use-store'

export function LeftPanel() {
  const s = useStore()
  const isMultiblock = s.projectType === 'multiblock'

  return (
    <div className="w-60 bg-background border-r border-border overflow-y-auto p-3 space-y-3 shrink-0">
      <Card>
        <CardTitle>Project</CardTitle>
        <Label>Name</Label>
        <Input value={s.name} onChange={(e) => s.setName(e.target.value)} placeholder="e.g. Crusher" />
        <Label>Project Type</Label>
        <Select value={s.projectType} onChange={(e) => s.setProjectType(e.target.value as any)}>
          <option value="single">Single Block</option>
          <option value="multiblock">Multiblock</option>
        </Select>
        <Label>Machine Type</Label>
        <Select value={s.structType} onChange={(e) => s.setStructType(e.target.value as any)}>
          <option value="machine">Machine (processes items)</option>
          <option value="tank">Tank (stores fluid/gas)</option>
          <option value="reactor">Reactor (generates energy)</option>
          <option value="custom">Custom</option>
        </Select>
      </Card>

      {isMultiblock && (
        <Card>
          <CardTitle>Dimensions</CardTitle>
          <div className="flex gap-1.5">
            <div>
              <Label>W</Label>
              <Input type="number" value={s.dimensions.w} min={3} max={9} step={2}
                onChange={(e) => s.setDimensions(+e.target.value, s.dimensions.h, s.dimensions.d)} />
            </div>
            <div>
              <Label>H</Label>
              <Input type="number" value={s.dimensions.h} min={3} max={9}
                onChange={(e) => s.setDimensions(s.dimensions.w, +e.target.value, s.dimensions.d)} />
            </div>
            <div>
              <Label>D</Label>
              <Input type="number" value={s.dimensions.d} min={3} max={9} step={2}
                onChange={(e) => s.setDimensions(s.dimensions.w, s.dimensions.h, +e.target.value)} />
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => {
            s.clearBlocks()
            s.fillShell()
          }}>
            Apply & Fill Shell
          </Button>
        </Card>
      )}

      <Card>
        <CardTitle>IO Types</CardTitle>
        <Checkbox label="Energy (RN)" checked={s.ioTypes.includes('energy')} onChange={() => s.toggleIOType('energy')} />
        <Checkbox label="Fluid (mB)" checked={s.ioTypes.includes('fluid')} onChange={() => s.toggleIOType('fluid')} />
        <Checkbox label="Gas (mB)" checked={s.ioTypes.includes('gas')} onChange={() => s.toggleIOType('gas')} />
        <Checkbox label="Items" checked={s.ioTypes.includes('item')} onChange={() => s.toggleIOType('item')} />
      </Card>

      <Card>
        <CardTitle>Capacities</CardTitle>
        <Label>Max Energy (RN)</Label>
        <Input type="number" value={s.capacity.energy} min={0} step={1000} onChange={(e) => s.setCapacity('energy', +e.target.value)} />
        <Label>Max Fluid (mB)</Label>
        <Input type="number" value={s.capacity.fluid} min={0} step={1000} onChange={(e) => s.setCapacity('fluid', +e.target.value)} />
        <Label>Max Gas (mB)</Label>
        <Input type="number" value={s.capacity.gas} min={0} step={1000} onChange={(e) => s.setCapacity('gas', +e.target.value)} />
        <Label>Process Time (ticks)</Label>
        <Input type="number" value={s.processTime} min={1} onChange={(e) => s.setProcessTime(+e.target.value)} />
        <Label>Energy/tick (RN)</Label>
        <Input type="number" value={s.energyPerTick} min={1} onChange={(e) => s.setEnergyPerTick(+e.target.value)} />
      </Card>

      <Card>
        <CardTitle>IDs</CardTitle>
        <Label>Block ID</Label>
        <Input type="number" value={s.blockId} min={200} max={255} onChange={(e) => s.setBlockId(+e.target.value)} />
      </Card>
    </div>
  )
}
