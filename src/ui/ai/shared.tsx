"use client";

import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

/** The brand's local wall-clock time and zone, so the AI picks sensible dates. */
export function localNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    now: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** "YYYY-MM-DDTHH:mm" (local) → Date, or undefined. */
export function fromLocal(v: string | null | undefined) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** HTML → plain text (for passing rich-text fields as AI context). */
export const htmlToText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Small "12 left today" label; hidden for admins (unlimited). */
export function AiQuota({ kind, className }: { kind: "text" | "image"; className?: string }) {
  const usage = api.ai.usage.useQuery(undefined, { staleTime: 30_000 });
  if (!usage.data || usage.data.unlimited) return null;
  const left = usage.data[kind] ?? 0;
  return (
    <span className={cn("text-xs tabular-nums", left === 0 ? "text-destructive" : "text-muted-foreground", className)}>
      {left} {kind === "image" ? "image" : "AI"} {left === 1 ? "use" : "uses"} left today
    </span>
  );
}
