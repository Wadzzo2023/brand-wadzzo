/**
 * Geometry for the portal's maps.
 *
 * Storage format (unchanged from the Google-Maps era, so existing hotspots keep
 * working): polygons are GeoJSON Features whose ring points are **[lat, lng]**
 * (not GeoJSON's usual [lng, lat]); circles are a 36-point polygon plus
 * `properties: { center: [lat, lng], radiusMetres }`. Mapbox draws [lng, lat],
 * so `toMapbox*` converts at the edge and nothing else needs to know.
 */
import type { Feature, Polygon } from "geojson";

export type LatLng = { lat: number; lng: number };
export type DrawShape = "polygon" | "rectangle" | "circle";

export type StoredFeature = Feature<Polygon, { center?: [number, number]; radiusMetres?: number } | null>;

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
