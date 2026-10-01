"use client";

import { MapIcon, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/shadcn/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { cn } from "~/lib/utils";

import { LOCS, NO_FILTERS, SUBMITTED, TYPE_LABEL, activeChips, type Filters, type LocCount, type SubmittedPreset } from "./model";

type Brand = { id: string; name: string; count: number };

/** "Filters" button + popover with every filter Pin review supports. */
export function FilterButton({
  filters,
  onChange,
  brands,
  types,
  onPickArea,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  brands: Brand[];
  types: { type: string; count: number }[];
  onPickArea: () => void;
}) {
  const active = activeChips(filters, () => "").length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(active > 0 && "border-primary/50 text-primary")}>
          <SlidersHorizontal /> Filters
          {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">{active}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,380px)] p-0">
        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
          <Section title="Submitted">
            <Chips<SubmittedPreset>
              value={filters.submitted}
              options={Object.entries(SUBMITTED).map(([value, label]) => ({ value: value as SubmittedPreset, label }))}
              onChange={(submitted) => onChange({ submitted })}
            />
            {filters.submitted === "custom" && (
              <DateRange from={filters.submittedFrom} to={filters.submittedTo} onChange={(from, to) => onChange({ submittedFrom: from, submittedTo: to })} />
            )}
          </Section>

          <Section title="Live between" hint="Pins whose run overlaps these dates.">
            <DateRange from={filters.liveFrom} to={filters.liveTo} onChange={(liveFrom, liveTo) => onChange({ liveFrom, liveTo })} />
          </Section>

          <Section title="Locations per pin">
            <Chips<LocCount>
              value={filters.locs}
              options={Object.entries(LOCS).map(([value, label]) => ({ value: value as LocCount, label }))}
              onChange={(locs) => onChange({ locs })}
            />
          </Section>

          {types.length > 1 && (
            <Section title="Type">
              <div className="flex flex-wrap gap-1.5">
                {types.map(({ type, count }) => {
                  const on = filters.types.includes(type);
                  return (
                    <Chip key={type} on={on} onClick={() => onChange({ types: on ? filters.types.filter((t) => t !== type) : [...filters.types, type] })}>
                      {TYPE_LABEL[type] ?? type} <span className="opacity-60 tabular-nums">{count}</span>
                    </Chip>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Brand">
            <Select value={filters.brand ?? "all"} onValueChange={(v) => onChange({ brand: v === "all" ? null : v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} <span className="text-muted-foreground tabular-nums">· {b.count}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          <Section title="Area" hint="Only pins with a location inside an area of the map.">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onPickArea}>
                <MapIcon /> {filters.area ? "Change area" : "Pick on map"}
              </Button>
              {filters.area && (
                <Button variant="ghost" size="sm" onClick={() => onChange({ area: null })}>
                  Clear
                </Button>
              )}
            </div>
          </Section>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2.5">
          <span className="text-xs text-muted-foreground">{active ? `${active} active` : "No filters"}</span>
          <Button variant="ghost" size="sm" disabled={!active} onClick={() => onChange(NO_FILTERS)}>
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The active filters as chips under the toolbar, each removable. */
export function ActiveFilters({ filters, onChange, brandName }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; brandName: (id: string) => string }) {
  const chips = activeChips(filters, brandName);
  if (!chips.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-2.5 text-xs">
          {c.label}
          <button type="button" onClick={() => onChange(c.clear)} aria-label={`Remove filter: ${c.label}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={() => onChange(NO_FILTERS)} className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Clear all
      </button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="label-caps">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <Chip key={o.value} on={o.value === value} onClick={() => onChange(o.value)} role="radio">
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children, role }: { on: boolean; onClick: () => void; children: ReactNode; role?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? on : undefined}
      aria-pressed={role ? undefined : on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs text-muted-foreground">
        From
        <Input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className="h-9" />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        To
        <Input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className="h-9" />
      </label>
    </div>
  );
}
