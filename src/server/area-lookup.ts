/**
 * Finding a place's real outline for a home area ("Clinton County, Iowa",
 * "Bangladesh", "USA") from OpenStreetMap's Nominatim. Its usage policy allows
 * about one request a second with an identifying User-Agent, so requests are
 * queued one at a time and answers cached. Outlines come back as the map kit's
 * stored format: [lat, lng] rings, one per part, simplified to a size that's
 * quick to draw and check.
 */
import { TRPCError } from "@trpc/server";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = { "User-Agent": "Wadzzo brand portal (home area lookup)", "Accept-Language": "en" };
const GAP_MS = 1100;
const MAX_QUEUE = 20;
/** Most points kept across all parts, and most parts (a country's islands). */
const MAX_POINTS = 5000;
const MAX_PARTS = 100;

export type AreaMatch = { id: string; name: string; label: string; kind: string; spanDeg: number };
export type AreaOutline = { type: "Feature"; properties: null; geometry: { type: "MultiPolygon"; coordinates: number[][][][] } };

// ── Polite access: one request at a time, cached ───────────────────────────

let last = Promise.resolve();
let queued = 0;
const cache = new Map<string, unknown>();

async function nominatim<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  if (queued >= MAX_QUEUE) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Area search is busy. Try again in a moment." });
  queued++;
  const turn = last.then(() => new Promise<void>((r) => setTimeout(r, GAP_MS)));
  last = turn;
  try {
    await turn;
    const res = await fetch(`${NOMINATIM}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = (await res.json()) as T;
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(path, data);
    return data;
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    console.error("[area-lookup]", e);
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Couldn't reach the map service. Try again." });
  } finally {
    queued--;
  }
}

// ── Search ──────────────────────────────────────────────────────────────────

type SearchHit = { osm_type: string; osm_id: number; name?: string; display_name: string; addresstype?: string; type?: string; boundingbox?: string[] };

/** Places with an outline (countries, states, counties, cities…) matching `query`. */
export async function findAreas(query: string): Promise<AreaMatch[]> {
  const q = new URLSearchParams({ q: query, format: "jsonv2", limit: "8" });
  const hits = await nominatim<SearchHit[]>(`/search?${q.toString()}`);
  return hits
    .filter((h) => h.osm_type === "relation" || h.osm_type === "way")
    .map((h) => {
      const [s, n, w, e] = (h.boundingbox ?? []).map(Number);
      return {
        id: `${h.osm_type === "relation" ? "R" : "W"}${h.osm_id}`,
        name: h.name ?? h.display_name.split(",")[0]!,
        label: h.display_name,
        kind: (h.addresstype ?? h.type ?? "area").replace(/_/g, " "),
        spanDeg: s !== undefined && n !== undefined && w !== undefined && e !== undefined ? Math.max(n - s, e - w) : 1,
      };
    });
}

// ── Outline ─────────────────────────────────────────────────────────────────

type Geometry = { type: string; coordinates: unknown };

/** The outline of a place from findAreas, every part kept (holes dropped). */
export async function areaOutline(id: string, spanDeg: number): Promise<AreaOutline> {
  // Ask for detail in proportion to the place's size: ~1/3000 of its width.
  const threshold = Math.min(0.05, Math.max(0.0002, spanDeg / 3000)).toFixed(4);
  const q = new URLSearchParams({ osm_ids: id, format: "jsonv2", polygon_geojson: "1", polygon_threshold: threshold });
  const [hit] = await nominatim<{ geojson?: Geometry }[]>(`/lookup?${q.toString()}`);
  const rings = outerRings(hit?.geojson);
  if (!rings.length) throw new TRPCError({ code: "NOT_FOUND", message: "That place has no outline on the map. Try another match, or draw it." });
  return { type: "Feature", properties: null, geometry: { type: "MultiPolygon", coordinates: fit(rings).map((r) => [r]) } };
}

/** GeoJSON [lng, lat] outer rings → [lat, lng] rings. */
function outerRings(g: Geometry | undefined): number[][][] {
  const polygons =
    g?.type === "Polygon" ? [g.coordinates as number[][][]] : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];
  return polygons.map((p) => (p[0] ?? []).map(([lng, lat]) => [round(lat!), round(lng!)])).filter((r) => r.length >= 4);
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** Ring area in square degrees (for ranking parts). */
function ringArea(r: number[][]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![1]! + r[i]![1]!) * (r[j]![0]! - r[i]![0]!);
  return Math.abs(a / 2);
}

/** Keeps the biggest parts, then simplifies until everything fits in MAX_POINTS. */
function fit(rings: number[][][]): number[][][] {
  let parts = rings.sort((a, b) => ringArea(b) - ringArea(a)).slice(0, MAX_PARTS);
  const count = () => parts.reduce((n, r) => n + r.length, 0);
  let tolerance = 0.0001;
  while (count() > MAX_POINTS && tolerance < 1) {
    parts = parts.map((r) => simplify(r, tolerance)).filter((r) => r.length >= 4);
    tolerance *= 2;
  }
  return parts;
}

/** Douglas–Peucker on a closed ring; keeps it closed. */
function simplify(ring: number[][], tolerance: number): number[][] {
  if (ring.length <= 8) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(ring[i]!, ring[a]!, ring[b]!);
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

function distanceToSegment(p: number[], a: number[], b: number[]) {
  const [px, py, ax, ay, bx, by] = [p[0]!, p[1]!, a[0]!, a[1]!, b[0]!, b[1]!];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
