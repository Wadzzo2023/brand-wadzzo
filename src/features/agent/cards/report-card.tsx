"use client";

import { format } from "date-fns";
import { BarChart3, Table2 } from "lucide-react";
import { useState } from "react";

import type { AgentBlock, ReportBar } from "~/lib/agent/contract";
import { cn } from "~/lib/utils";

import { Card, n } from "./card-kit";

type Report = Extract<AgentBlock, { kind: "report" }>;

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const label = (s: string) => (isDay(s) ? format(new Date(`${s}T00:00:00`), "MMM d") : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " "));

/** Collection report: KPI tiles, then one breakdown (columns over time, bars by pin/type), with a table view. */
export function ReportCard({ block }: { block: Report }) {
  const [table, setTable] = useState(false);
  const bars = block.bars;
  return (
    <Card
      icon={BarChart3}
      title={block.title}
      actions={
        bars && (
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-pressed={table}
            aria-label={table ? "Show chart" : "Show as table"}
            title={table ? "Show chart" : "Show as table"}
          >
            {table ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          </button>
        )
      }
    >
      <dl className="grid grid-cols-3 divide-x border-b">
        {block.stats.map((s) => (
          <div key={s.label} className="min-w-0 px-3 py-2.5">
            <dt className="truncate text-[11px] text-muted-foreground">{s.label}</dt>
            <dd className="font-hud text-lg font-semibold">{s.value}</dd>
            {s.hint && <dd className="truncate text-[11px] text-faint">{s.hint}</dd>}
          </div>
        ))}
      </dl>
      {block.note && <p className="px-3 py-3 text-center text-xs text-muted-foreground">{block.note}</p>}
      {bars && bars.items.length > 0 && (
        <div className="px-3 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{bars.title}</p>
          {table ? <BarTable items={bars.items} /> : bars.items.every((b) => isDay(b.label)) ? <Columns items={bars.items} /> : <Bars items={bars.items} />}
        </div>
      )}
    </Card>
  );
}

/** Over time: one column per day/week; hover or focus a column for its value. */
function Columns({ items }: { items: ReportBar[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...items.map((b) => b.value));
  const shown = active === null ? null : items[active];
  return (
    <div>
      <p className="mb-1 h-4 text-xs tabular-nums" aria-live="polite">
        {shown ? (
          <>
            <b className="font-semibold">{n(shown.value)}</b> <span className="text-muted-foreground">on {label(shown.label)}</span>
          </>
        ) : (
          <span className="text-faint">Peak {n(max)} · hover a column for its day</span>
        )}
      </p>
      <div className="flex h-28 items-end gap-0.5 border-b border-border" onPointerLeave={() => setActive(null)}>
        {items.map((b, i) => (
          <button
            key={b.label}
            type="button"
            className="flex h-full min-w-0 flex-1 items-end justify-center outline-none"
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${label(b.label)}: ${n(b.value)}`}
          >
            <span
              className={cn("w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity", active !== null && active !== i && "opacity-60")}
              style={{ height: `${Math.max(b.value > 0 ? 3 : 0, (b.value / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>{label(items[0]!.label)}</span>
        {items.length > 1 && <span>{label(items[items.length - 1]!.label)}</span>}
      </div>
    </div>
  );
}

/** By pin or type: horizontal bars, label beside, value at the tip. */
function Bars({ items }: { items: ReportBar[] }) {
  const max = Math.max(1, ...items.map((b) => b.value));
  return (
    <ul className="space-y-1.5">
      {items.map((b) => (
        <li key={b.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-2" title={`${label(b.label)}: ${n(b.value)}`}>
          <span className="truncate text-xs">{label(b.label)}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 rounded-r-[4px] bg-primary" style={{ width: `max(2px, calc((100% - 3rem) * ${b.value / max}))` }} />
            <span className="shrink-0 text-[11px] font-medium tabular-nums">{n(b.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function BarTable({ items }: { items: ReportBar[] }) {
  return (
    <div className="max-h-56 overflow-y-auto scrollbar-thin">
      <table className="w-full text-xs">
        <tbody className="divide-y">
          {items.map((b) => (
            <tr key={b.label}>
              <td className="py-1 pr-2">{label(b.label)}</td>
              <td className="py-1 text-right font-medium tabular-nums">{n(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
