'use client'

import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type {
  BackType,
  CardConfiguration,
  CardMaterial,
  CardOrientation,
  SlotPunch,
} from '@/lib/models/types'

interface Props {
  config: CardConfiguration
  onConfigChange: (config: CardConfiguration) => void
}

export function CardOptionsPanel({ config, onConfigChange }: Props) {
  const update = <K extends keyof CardConfiguration>(
    key: K,
    value: CardConfiguration[K],
  ) => onConfigChange({ ...config, [key]: value })

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Card Options
      </h3>

      {/* Orientation */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Orientation</label>
        <div className="flex rounded-lg border bg-muted p-0.5">
          {(['horizontal', 'vertical'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => update('orientation', o)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                config.orientation === o
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Material */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Material</label>
        <Select
          value={config.material}
          onValueChange={(v) => update('material', v as CardMaterial)}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30mil-pvc">30 Mil PVC</SelectItem>
            <SelectItem value="adhesive-pvc">Adhesive PVC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Back type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Back Side</label>
        <Select
          value={config.backType}
          onValueChange={(v) => update('backType', v as BackType)}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Back</SelectItem>
            <SelectItem value="bw">Black & White Back</SelectItem>
            <SelectItem value="full-color">Full Color Back</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Slot punch */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Slot Punch</label>
        <Select
          value={config.slotPunch}
          onValueChange={(v) => update('slotPunch', v as SlotPunch)}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="long">Long</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Backgrounds */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Front Background</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.frontBackground}
            onChange={(e) => update('frontBackground', e.target.value)}
            className="size-8 cursor-pointer rounded border p-0.5"
          />
          <Input
            value={config.frontBackground}
            onChange={(e) => update('frontBackground', e.target.value)}
            className="flex-1 text-xs font-mono h-8"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Back Background</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.backBackground}
            onChange={(e) => update('backBackground', e.target.value)}
            className="size-8 cursor-pointer rounded border p-0.5"
          />
          <Input
            value={config.backBackground}
            onChange={(e) => update('backBackground', e.target.value)}
            className="flex-1 text-xs font-mono h-8"
          />
        </div>
      </div>

      <Separator />

      {/* Safe zone */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">
          Safe Zone Margin ({config.safeZoneMargin}mm)
        </label>
        <input
          type="range"
          min={0}
          max={15}
          step={1}
          value={config.safeZoneMargin}
          onChange={(e) => update('safeZoneMargin', Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Text boundaries */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="textBoundaries"
          checked={config.textBoundaries}
          onCheckedChange={(checked) =>
            update('textBoundaries', checked === true)
          }
        />
        <label htmlFor="textBoundaries" className="text-xs font-medium">
          Show text boundaries
        </label>
      </div>

      {/* Double side */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="isDoubleSide"
          checked={config.isDoubleSide ?? true}
          onCheckedChange={(checked) =>
            update('isDoubleSide', checked === true)
          }
        />
        <label htmlFor="isDoubleSide" className="text-xs font-medium">
          Is Double Side
        </label>
      </div>
    </div>
  )
}
