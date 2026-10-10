"use client";

import { format } from "date-fns";
import { useState } from "react";

import { Checkbox } from "~/components/shadcn/ui/checkbox";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { UNLIMITED_COLLECTIONS, type PinDefaults, type PlaceItem } from "~/lib/agent/contract";
import { cn } from "~/lib/utils";

import { MapRow, day } from "./card-kit";

// ─── Fields ──────────────────────────────────────────────────────────────────

export type FieldSpec = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "date" | "datetime" | "number" | "switch" | "url";
  min?: number;
  max?: number;
};

const toLocalInput = (iso: unknown) => {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
};
const toDayInput = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");
const toText = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** A small form over a draft object; every change reports the whole draft. */
export function DraftFields({ fields, value, onChange, disabled }: { fields: FieldSpec[]; value: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className="grid grid-cols-2 gap-2 px-3 py-2.5">
      {fields.map((f) => {
        const id = `draft-${f.key}`;
        const wide = f.kind === "textarea" || f.kind === "text" || f.kind === "url";
        if (f.kind === "switch") {
          return (
            <label key={f.key} htmlFor={id} className="col-span-2 flex items-center justify-between gap-2 text-xs font-medium">
              {f.label}
              <Switch id={id} checked={Boolean(value[f.key])} onCheckedChange={(c) => set(f.key, c)} disabled={disabled} />
            </label>
          );
        }
        return (
          <label key={f.key} htmlFor={id} className={cn("space-y-1", wide && "col-span-2")}>
            <span className="text-[11px] font-medium text-muted-foreground">{f.label}</span>
            {f.kind === "textarea" ? (
              <Textarea id={id} rows={3} className="text-sm" value={toText(value[f.key])} onChange={(e) => set(f.key, e.target.value)} disabled={disabled} />
            ) : (
              <Input
                id={id}
                className="h-8 text-sm"
                disabled={disabled}
                type={f.kind === "datetime" ? "datetime-local" : f.kind === "date" ? "date" : f.kind === "number" ? "number" : f.kind === "url" ? "url" : "text"}
                min={f.min}
                max={f.max}
                value={f.kind === "datetime" ? toLocalInput(value[f.key]) : f.kind === "date" ? toDayInput(value[f.key]) : toText(value[f.key])}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (f.kind === "number") set(f.key, raw === "" ? null : Number(raw));
                  else if (f.kind === "datetime") set(f.key, raw ? new Date(raw).toISOString() : null);
                  else set(f.key, raw === "" && f.kind === "url" ? null : raw);
                }}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

export const EVENT_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "startDate", label: "Starts", kind: "datetime" },
  { key: "endDate", label: "Ends", kind: "datetime" },
  { key: "venueName", label: "Venue", kind: "text" },
  { key: "link", label: "Link", kind: "url" },
  { key: "capacity", label: "Capacity (blank = unlimited)", kind: "number", min: 1 },
];

export const ANNOUNCEMENT_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "body", label: "Message", kind: "textarea" },
  { key: "ctaLabel", label: "Button text", kind: "text" },
  { key: "ctaUrl", label: "Button link", kind: "url" },
  { key: "expiresAt", label: "Hide after", kind: "datetime" },
  { key: "pinned", label: "Pin to the top", kind: "switch" },
];

export const HOTSPOT_FIELDS: FieldSpec[] = [
  { key: "title", label: "Pin title", kind: "text" },
  { key: "radiusMetres", label: "Radius (m)", kind: "number", min: 50, max: 50000 },
  { key: "pinNumber", label: "Pins per drop", kind: "number", min: 1, max: 100 },
  { key: "startDate", label: "Starts", kind: "date" },
  { key: "endDate", label: "Ends", kind: "date" },
  { key: "dropEveryDays", label: "Drop every (days)", kind: "number", min: 1, max: 365 },
  { key: "pinDurationDays", label: "Each drop lasts (days)", kind: "number", min: 1, max: 365 },
  { key: "autoCollect", label: "Collect automatically in range", kind: "switch" },
];

// ─── New pins: which places, with which settings ────────────────────────────

const PIN_TYPES: PinDefaults["type"][] = ["LANDMARK", "EVENT", "EXPERIENCE", "LAUNCH", "OTHER"];

export function PlacePicker({ items, keep, onChange, disabled }: { items: PlaceItem[]; keep: Set<string>; onChange: (keep: Set<string>) => void; disabled: boolean }) {
  const [all, setAll] = useState(items.length <= 6);
  const shown = all ? items : items.slice(0, 6);
  const toggle = (key: string) => {
    const next = new Set(keep);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };
  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <Checkbox
          checked={keep.size === items.length ? true : keep.size === 0 ? false : "indeterminate"}
          onCheckedChange={(c) => onChange(c === true ? new Set(items.map((i) => i.key)) : new Set())}
          disabled={disabled}
          aria-label="Select all places"
        />
        <span className="font-medium">
          {keep.size} of {items.length} places selected
        </span>
      </div>
      <ul className={cn("divide-y border-t", all && items.length > 8 && "max-h-72 overflow-y-auto scrollbar-thin")}>
        {shown.map((p) => (
          <MapRow key={p.key} id={p.key} lat={p.lat} lng={p.lng} className="py-1.5">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={keep.has(p.key)} onCheckedChange={() => toggle(p.key)} disabled={disabled} />
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.kind === "event" && p.startDate ? `${day(p.startDate)} · ` : ""}
                  {p.address}
                </span>
              </span>
            </label>
          </MapRow>
        ))}
      </ul>
      {items.length > 6 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="w-full border-t py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

/** The settings every new pin gets; a one-line summary that opens into fields. */
export function PinSettings({ value, onChange, disabled, hasEvents }: { value: PinDefaults; onChange: (v: PinDefaults) => void; disabled: boolean; hasEvents: boolean }) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof PinDefaults>(k: K, v: PinDefaults[K]) => onChange({ ...value, [k]: v });
  const unlimited = value.collectionLimit >= UNLIMITED_COLLECTIONS;
  const summary = [
    value.type.charAt(0) + value.type.slice(1).toLowerCase(),
    `${day(value.startDate)} – ${day(value.endDate)}${hasEvents ? " (events keep their own dates)" : ""}`,
    value.autoCollect ? "auto-collect" : "tap to collect",
    `${value.pinNumber} per place`,
    value.grouping === "single-group" ? "one pin for all places" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-b px-3 py-2">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{summary}</p>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 text-xs font-medium text-primary hover:underline" disabled={disabled}>
          {open ? "Done" : "Edit settings"}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Type</span>
            <Select value={value.type} onValueChange={(v) => set("type", v as PinDefaults["type"])} disabled={disabled}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIN_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Pins per place</span>
            <Input type="number" min={1} max={200} className="h-8 text-sm" value={value.pinNumber} onChange={(e) => set("pinNumber", Math.max(1, Number(e.target.value) || 1))} disabled={disabled} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Starts</span>
            <Input type="date" className="h-8 text-sm" value={value.startDate.slice(0, 10)} onChange={(e) => e.target.value && set("startDate", e.target.value)} disabled={disabled} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Ends</span>
            <Input type="date" className="h-8 text-sm" value={value.endDate.slice(0, 10)} onChange={(e) => e.target.value && set("endDate", e.target.value)} disabled={disabled} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Spread (m)</span>
            <Input type="number" min={0} max={5000} className="h-8 text-sm" value={value.radius} onChange={(e) => set("radius", Math.max(0, Number(e.target.value) || 0))} disabled={disabled} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Collection limit</span>
            <Input
              type="number"
              min={1}
              className="h-8 text-sm"
              placeholder="Unlimited"
              value={unlimited ? "" : value.collectionLimit}
              onChange={(e) => set("collectionLimit", e.target.value ? Math.max(1, Number(e.target.value)) : UNLIMITED_COLLECTIONS)}
              disabled={disabled}
            />
          </label>
          <label className="col-span-2 flex items-center justify-between gap-2 text-xs font-medium">
            Collect automatically when a fan is in range
            <Switch checked={value.autoCollect} onCheckedChange={(c) => set("autoCollect", c)} disabled={disabled} />
          </label>
          <label className="col-span-2 flex items-center justify-between gap-2 text-xs font-medium">
            Put every place in one pin
            <Switch checked={value.grouping === "single-group"} onCheckedChange={(c) => set("grouping", c ? "single-group" : "per-location")} disabled={disabled} />
          </label>
        </div>
      )}
    </div>
  );
}
