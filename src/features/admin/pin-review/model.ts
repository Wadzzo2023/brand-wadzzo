import { endOfDay, startOfDay, subDays } from "date-fns";

import type { RouterOutputs } from "~/utils/api";

export type Group = RouterOutputs["maps"]["pin"]["getAdminLocationGroups"][number];
export type View = "pending" | "approved";

export const TYPE_LABEL: Record<string, string> = {
  OTHER: "General",
  LANDMARK: "Landmark",
  EVENT: "Event",
  BOUNTY: "Bounty",
  EXPERIENCE: "Experience",
  LAUNCH: "Launch",
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// ── Sorting ─────────────────────────────────────────────────────────────────

export const SORTS = {
  newest: "Newest submitted",
  oldest: "Oldest submitted",
  starts: "Starts soonest",
  ends: "Ends soonest",
  most: "Most locations",
  title: "Title A–Z",
} as const;
export type Sort = keyof typeof SORTS;

const time = (d: Date | string) => new Date(d).getTime();
const COMPARE: Record<Sort, (a: Group, b: Group) => number> = {
  newest: (a, b) => time(b.createdAt) - time(a.createdAt),
  oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
  starts: (a, b) => time(a.startDate) - time(b.startDate),
  ends: (a, b) => time(a.endDate) - time(b.endDate),
  most: (a, b) => b._count.locations - a._count.locations,
  title: (a, b) => a.title.localeCompare(b.title),
};

// ── Filters ─────────────────────────────────────────────────────────────────

export const SUBMITTED = {
  any: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  older: "Older than 30 days",
  custom: "Custom range",
} as const;
export type SubmittedPreset = keyof typeof SUBMITTED;

export const LOCS = { any: "Any", one: "1", few: "2–10", many: "11+" } as const;
export type LocCount = keyof typeof LOCS;

export type Area = { north: number; south: number; east: number; west: number };

export type Filters = {
  submitted: SubmittedPreset;
  /** yyyy-MM-dd, used when submitted = "custom". */
  submittedFrom: string;
  submittedTo: string;
  /** Live at some point in this range (the pin's run overlaps it). */
  liveFrom: string;
  liveTo: string;
  locs: LocCount;
  types: string[];
  brand: string | null;
  area: Area | null;
};

export const NO_FILTERS: Filters = {
  submitted: "any",
  submittedFrom: "",
  submittedTo: "",
  liveFrom: "",
  liveTo: "",
  locs: "any",
  types: [],
  brand: null,
  area: null,
};

const day = (s: string) => new Date(`${s}T00:00:00`);

function submittedRange(f: Filters, now: number): [number, number] | null {
  const today = startOfDay(now);
  switch (f.submitted) {
    case "any":
      return null;
    case "today":
      return [today.getTime(), Infinity];
    case "7d":
      return [subDays(today, 6).getTime(), Infinity];
    case "30d":
      return [subDays(today, 29).getTime(), Infinity];
    case "older":
      return [-Infinity, subDays(today, 29).getTime() - 1];
    case "custom":
      return [f.submittedFrom ? day(f.submittedFrom).getTime() : -Infinity, f.submittedTo ? endOfDay(day(f.submittedTo)).getTime() : Infinity];
  }
}

/** Filters everything but the text search and the map area (those need their own inputs). */
export function matches(g: Group, f: Filters, now: number, areaIds: Set<string> | null) {
  if (f.brand && g.creator.id !== f.brand) return false;
  if (f.types.length && !f.types.includes(g.type)) return false;
  const n = g._count.locations;
  if (f.locs === "one" && n !== 1) return false;
  if (f.locs === "few" && (n < 2 || n > 10)) return false;
  if (f.locs === "many" && n <= 10) return false;
  const sub = submittedRange(f, now);
  if (sub) {
    const t = time(g.createdAt);
    if (t < sub[0] || t > sub[1]) return false;
  }
  if (f.liveFrom || f.liveTo) {
    const from = f.liveFrom ? day(f.liveFrom).getTime() : -Infinity;
    const to = f.liveTo ? endOfDay(day(f.liveTo)).getTime() : Infinity;
    if (time(g.endDate) < from || time(g.startDate) > to) return false;
  }
  if (areaIds && !areaIds.has(g.id)) return false;
  return true;
}

export function sortGroups(rows: Group[], sort: Sort) {
  return [...rows].sort((a, b) => COMPARE[sort](a, b) || a.title.localeCompare(b.title));
}

/** Active filters as removable chips. */
export function activeChips(f: Filters, brandName: (id: string) => string): { key: string; label: string; clear: Partial<Filters> }[] {
  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.submitted !== "any") {
    const label =
      f.submitted === "custom" ? `Submitted ${f.submittedFrom || "…"} → ${f.submittedTo || "…"}` : `Submitted: ${SUBMITTED[f.submitted].toLowerCase()}`;
    chips.push({ key: "submitted", label, clear: { submitted: "any", submittedFrom: "", submittedTo: "" } });
  }
  if (f.liveFrom || f.liveTo) chips.push({ key: "live", label: `Live ${f.liveFrom || "…"} → ${f.liveTo || "…"}`, clear: { liveFrom: "", liveTo: "" } });
  if (f.locs !== "any") chips.push({ key: "locs", label: `${LOCS[f.locs]} location${f.locs === "one" ? "" : "s"}`, clear: { locs: "any" } });
  if (f.types.length) chips.push({ key: "types", label: f.types.map((t) => TYPE_LABEL[t] ?? t).join(", "), clear: { types: [] } });
  if (f.brand) chips.push({ key: "brand", label: brandName(f.brand), clear: { brand: null } });
  if (f.area) chips.push({ key: "area", label: "In map area", clear: { area: null } });
  return chips;
}
