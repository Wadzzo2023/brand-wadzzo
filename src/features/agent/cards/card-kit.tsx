"use client";

import { format } from "date-fns";
import { ChevronDown, Crosshair, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";

import { useAgentMap } from "../agent-map";

/** Frame for every card in the chat: icon, title, count, optional actions. */
export function Card({
  icon: Icon,
  title,
  count,
  actions,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex items-center gap-2 border-b bg-surface-2/50 px-3 py-2">
        <Icon className="size-4 shrink-0 text-primary" />
        <h3 className="min-w-0 flex-1 truncate font-hud text-[13px] font-semibold">{title}</h3>
        {count !== undefined && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-hud text-[11px] font-semibold tabular-nums">{count}</span>}
        {actions}
      </header>
      {children}
    </section>
  );
}

/** A list that shows the first few rows, with "Show all N". */
export function ShortList<T>({ items, initial = 5, render, empty }: { items: T[]; initial?: number; render: (item: T, i: number) => ReactNode; empty: string }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{empty}</p>;
  const shown = all ? items : items.slice(0, initial);
  return (
    <>
      <ul className={cn("divide-y", all && "max-h-80 overflow-y-auto scrollbar-thin")}>{shown.map(render)}</ul>
      {items.length > initial && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {all ? "Show less" : `Show all ${items.length}`}
          <ChevronDown className={cn("size-3.5 transition-transform", all && "rotate-180")} />
        </button>
      )}
    </>
  );
}

/** A row that flies the map to its item when clicked. */
export function MapRow({
  id,
  lat,
  lng,
  children,
  aside,
  className,
}: {
  id: string;
  lat?: number | null;
  lng?: number | null;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  const focusOn = useAgentMap((s) => s.focusOn);
  const located = typeof lat === "number" && typeof lng === "number";
  return (
    <li className={cn("flex items-center gap-2 px-3 py-2", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {aside}
      {located && (
        <button
          type="button"
          onClick={() => focusOn({ id, lat, lng })}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Show on map"
          title="Show on map"
        >
          <Crosshair className="size-3.5" />
        </button>
      )}
    </li>
  );
}

export const day = (iso: string) => format(new Date(iso), "MMM d, yyyy");
export const dayTime = (iso: string) => format(new Date(iso), "MMM d, h:mm a");
export const range = (from: string, to: string) => {
  const end = new Date(to);
  // The 100-year "no end" default reads better as open-ended.
  return end.getFullYear() - new Date().getFullYear() > 50 ? `From ${day(from)}` : `${format(new Date(from), "MMM d")} – ${day(to)}`;
};
export const n = (v: number) => v.toLocaleString();
