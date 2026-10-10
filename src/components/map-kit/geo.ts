/**
 * Geometry for the portal's maps.
 *
 * Storage format (unchanged from the Google-Maps era, so existing hotspots keep
 * working): polygons are GeoJSON Features whose ring points are **[lat, lng]**
 * (not GeoJSON's usual [lng, lat]); circles are a 36-point polygon plus
 * `properties: { center: [lat, lng], radiusMetres }`. Mapbox draws [lng, lat],
 * so `toMapbox*` converts at the edge and nothing else needs to know.
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type LatLng = { lat: number; lng: number };
export type DrawShape = "polygon" | "rectangle" | "circle";

export type StoredFeature = Feature<Polygon, { center?: [number, number]; radiusMetres?: number } | null>;
/** A drawn shape, or a looked-up place that may come in several parts (a country with islands). */
export type AreaFeature = StoredFeature | Feature<MultiPolygon, null | Record<string, never>>;

const EARTH_R = 6_371_000;

export function haversineMetres(a: LatLng, b: LatLng) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const closeRing = (pts: [number, number][]) => [...pts, [...pts[0]!] as [number, number]];

/** Polygon from vertices (stored order: [lat, lng]). */
export function polygonFeature(points: LatLng[]): StoredFeature {
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closeRing(points.map((p) => [p.lat, p.lng]))] } };
}

/** Axis-aligned rectangle from two opposite corners. */
export function rectangleFeature(a: LatLng, b: LatLng): StoredFeature {
  return polygonFeature([a, { lat: a.lat, lng: b.lng }, b, { lat: b.lat, lng: a.lng }]);
}

/** Circle as a 36-point polygon + its centre and radius (same maths as before). */
export function circleFeature(center: LatLng, edge: LatLng): StoredFeature {
  const radiusMetres = haversineMetres(center, edge);
  const dLat = (radiusMetres / EARTH_R) * (180 / Math.PI);
  const dLng = dLat / Math.cos((center.lat * Math.PI) / 180);
  const pts: [number, number][] = [];
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * 2 * Math.PI;
    pts.push([center.lat + dLat * Math.sin(t), center.lng + dLng * Math.cos(t)]);
  }
  return {
    type: "Feature",
    properties: { center: [center.lat, center.lng], radiusMetres },
    geometry: { type: "Polygon", coordinates: [closeRing(pts)] },
  };
}

/** Circle of `radiusMetres` around `center` (same stored format as a drawn circle). */
export function circleAround(center: LatLng, radiusMetres: number): StoredFeature {
  const dLng = ((radiusMetres / EARTH_R) * (180 / Math.PI)) / Math.cos((center.lat * Math.PI) / 180);
  return circleFeature(center, { lat: center.lat, lng: center.lng + dLng });
}

/** Stored [lat, lng] ring → Mapbox [lng, lat] Feature for drawing. */
export function toMapboxFeature(f: { geometry?: { coordinates?: number[][][] } } | null | undefined, properties: Record<string, unknown> = {}) {
  const ring = f?.geometry?.coordinates?.[0];
  if (!ring?.length) return null;
  return {
    type: "Feature" as const,
    properties,
    geometry: { type: "Polygon" as const, coordinates: [ring.map(([lat, lng]) => [lng!, lat!])] },
  };
}

/** Outer rings of a stored area, one per part, still [lat, lng]. */
export function areaRings(f: { geometry?: { type?: string; coordinates?: unknown } } | null | undefined): number[][][] {
  const g = f?.geometry;
  if (g?.type === "MultiPolygon") return ((g.coordinates as number[][][][] | undefined) ?? []).map((p) => p[0] ?? []).filter((r) => r.length);
  const ring = (g?.coordinates as number[][][] | undefined)?.[0];
  return ring?.length ? [ring] : [];
}

/** A stored area (one or several parts) → Mapbox [lng, lat] MultiPolygon for drawing. */
export function toMapboxArea(f: Parameters<typeof areaRings>[0], properties: Record<string, unknown> = {}) {
  const rings = areaRings(f);
  if (!rings.length) return null;
  return {
    type: "Feature" as const,
    properties,
    geometry: { type: "MultiPolygon" as const, coordinates: rings.map((r) => [r.map(([lat, lng]) => [lng!, lat!])]) },
  };
}

/**
 * [[west, south], [east, north]] to fit a map to these areas. When the parts
 * straddle the 180° line (Alaska's islands), fits the biggest part instead.
 */
export function areaBounds(features: Parameters<typeof areaRings>[0][]): [[number, number], [number, number]] | null {
  const boxOf = (pts: number[][]) => {
    const lats = pts.map((p) => p[0]!);
    const lngs = pts.map((p) => p[1]!);
    return { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lngs), e: Math.max(...lngs) };
  };
  const rings = features.flatMap((f) => areaRings(f));
  if (!rings.length) return null;
  let b = boxOf(rings.flat());
  if (b.e - b.w > 180) {
    const biggest = rings.map(boxOf).sort((x, y) => (y.n - y.s) * (y.e - y.w) - (x.n - x.s) * (x.e - x.w))[0]!;
    b = biggest;
  }
  return [
    [b.w, b.s],
    [b.e, b.n],
  ];
}

/** Centre of a stored feature (circle centre, else the ring's average). */
export function featureCenter(f: StoredFeature): LatLng {
  const c = f.properties?.center;
  if (c) return { lat: c[0], lng: c[1] };
  const ring = f.geometry.coordinates[0]!.slice(0, -1);
  return {
    lat: ring.reduce((s, p) => s + p[0]!, 0) / ring.length,
    lng: ring.reduce((s, p) => s + p[1]!, 0) / ring.length,
  };
}

/** "23.81, 90.41" (or with a space) → coordinates, if it looks like a pair. */
export function parseCoordinates(text: string): LatLng | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
