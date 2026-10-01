"use client";

import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek, subDays, subMonths } from "date-fns";
import { CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/shadcn/ui/popover";
import { cn } from "~/lib/utils";
import { FilterChips } from "~/ui/toolbar";
import type { StatusPill } from "~/ui/status-pill";

// ── Period ──────────────────────────────────────────────────────────────────

export const PERIODS = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months", all: "All time" } as const;
export type PeriodKey = keyof typeof PERIODS | "custom";
export type Period = { key: PeriodKey; from?: Date; to?: Date };

export function periodRange(key: Exclude<PeriodKey, "custom">, now = new Date()): Period {
  const today = startOfDay(now);
  switch (key) {
    case "7d":
      return { key, from: subDays(today, 6) };
    case "30d":
      return { key, from: subDays(today, 29) };
    case "90d":
      return { key, from: subDays(today, 89) };
    case "12m":
      return { key, from: subMonths(today, 12) };
    case "all":
      return { key };
  }
}

export function periodLabel(p: Period) {
  if (p.key !== "custom") return p.key === "all" ? "all time" : `the last ${PERIODS[p.key]}`;
  return `${p.from ? format(p.from, "MMM d, yyyy") : "…"} – ${p.to ? format(p.to, "MMM d, yyyy") : "today"}`;
}

/** Preset chips + a custom date range. */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from ? format(value.from, "yyyy-MM-dd") : "");
  const [to, setTo] = useState(value.to ? format(value.to, "yyyy-MM-dd") : "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChips
        label="Period"
        value={value.key === "custom" ? ("" as Exclude<PeriodKey, "custom">) : value.key}
        onChange={(k) => onChange(periodRange(k))}
        options={(Object.keys(PERIODS) as Exclude<PeriodKey, "custom">[]).map((k) => ({ value: k, label: PERIODS[k] }))}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors [&_svg]:size-4",
              value.key === "custom" ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-line-bright hover:text-foreground",
            )}
          >
            <CalendarRange /> {value.key === "custom" ? periodLabel(value) : "Custom"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              From
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              To
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </label>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!from && !to}
            onClick={() => {
              onChange({
                key: "custom",
                from: from ? new Date(`${from}T00:00:00`) : undefined,
                to: to ? new Date(`${to}T23:59:59.999`) : undefined,
              });
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Pin status ──────────────────────────────────────────────────────────────

type Tone = Parameters<typeof StatusPill>[0]["tone"];
export function pinStatus(g: { approved: boolean | null; startDate: Date | string; endDate: Date | string }, now: number): { label: string; tone: Tone } {
  if (g.approved === null) return { label: "In review", tone: "warning" };
  if (g.approved === false) return { label: "Rejected", tone: "danger" };
  if (new Date(g.startDate).getTime() > now) return { label: "Scheduled", tone: "info" };
  if (new Date(g.endDate).getTime() < now) return { label: "Ended", tone: "neutral" };
  return { label: "Live", tone: "success" };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function downloadCsv(filename: string, rows: Record<string, string | number | boolean | Date | null | undefined>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  const cell = (v: string | number | boolean | Date | null | undefined) => {
    const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Chart ───────────────────────────────────────────────────────────────────

/**
 * Collections over time as bars: one per day, or per week when the range is
 * long. Empty days are drawn too so gaps read as gaps.
 */
export function CollectionsChart({ daily, from, to, className }: { daily: { day: string; n: number }[]; from?: Date; to?: Date; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const buckets = useMemo(() => {
    const counts = new Map(daily.map((d) => [d.day, d.n]));
    const end = startOfDay(to ?? new Date());
    const first = from ? startOfDay(from) : daily[0] ? new Date(`${daily[0].day}T00:00:00`) : subDays(end, 29);
    const days = Math.max(1, differenceInCalendarDays(end, first) + 1);
    const weekly = days > 120;
    const out: { label: string; n: number }[] = [];
    if (weekly) {
      for (let d = startOfWeek(first); d <= end; d = addDays(d, 7)) {
        let n = 0;
        for (let i = 0; i < 7; i++) n += counts.get(format(addDays(d, i), "yyyy-MM-dd")) ?? 0;
        out.push({ label: `Week of ${format(d, "MMM d, yyyy")}`, n });
      }
    } else {
      for (let d = first; d <= end; d = addDays(d, 1)) out.push({ label: format(d, "EEE, MMM d, yyyy"), n: counts.get(format(d, "yyyy-MM-dd")) ?? 0 });
    }
    return { out, weekly };
  }, [daily, from, to]);

  const max = Math.max(1, ...buckets.out.map((b) => b.n));
  const total = buckets.out.reduce((s, b) => s + b.n, 0);
  const shown = hover !== null ? buckets.out[hover] : null;

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-caps">Collections per {buckets.weekly ? "week" : "day"}</h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {shown ? (
            <>
              <span className="font-medium text-foreground">{shown.n.toLocaleString()}</span> · {shown.label}
            </>
          ) : (
            `Peak ${max === 1 && total === 0 ? 0 : max.toLocaleString()}`
          )}
        </p>
      </div>
      {total === 0 ? (
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No collections in this period</div>
      ) : (
        <div className="mt-3 flex h-40 items-end gap-px" onMouseLeave={() => setHover(null)} role="img" aria-label={`${total} collections`}>
          {buckets.out.map((b, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={cn("w-full rounded-t-sm transition-colors", b.n ? (hover === i ? "bg-primary" : "bg-primary/70") : "bg-muted")}
                style={{ height: b.n ? `${Math.max(4, (b.n / max) * 100)}%` : "2px" }}
              />
            </div>
          ))}
        </div>
      )}
      {buckets.out.length > 1 && total > 0 && (
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{buckets.out[0]!.label.replace(/^\w+, |^Week of /, "")}</span>
          <span>{buckets.out.at(-1)!.label.replace(/^\w+, |^Week of /, "")}</span>
        </div>
      )}
    </div>
  );
}

/** "+12% vs previous period" — or nothing when there is nothing to compare. */
export function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  if (before === 0) return now > 0 ? <span className="text-success">New this period</span> : <span>No change</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span>Same as previous period</span>;
  return (
    <span className={pct > 0 ? "text-success" : "text-destructive"}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs previous period
    </span>
  );
}
