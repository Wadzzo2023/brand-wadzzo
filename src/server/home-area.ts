/**
 * Home areas: where a brand operates, so the map agent searches there by
 * default. Each platform can set a default (e.g. Clinton County); a brand may
 * draw its own instead. Stored like a hotspot area — a polygon Feature in the
 * map kit's [lat, lng] format (src/components/map-kit/geo.ts).
 */
import { z } from "zod";

import type { StoredFeature } from "~/components/map-kit/geo";
import type { Db } from "~/server/db";

export type HomeArea = { name: string; source: "brand" | "platform"; feature: StoredFeature };

const point = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
/** A ring point; a plain array to match GeoJSON's Position type. */
const ringPoint = z
  .array(z.number())
  .length(2)
  .refine(([lat, lng]) => Math.abs(lat!) <= 90 && Math.abs(lng!) <= 180, "Point out of range");

/** A drawn area: one closed ring of 4–2000 [lat, lng] points. */
export const HomeAreaFeature = z.object({
  type: z.literal("Feature"),
  properties: z.object({ center: point.optional(), radiusMetres: z.number().positive().optional() }).nullable(),
  geometry: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(ringPoint).min(4).max(2000)).length(1),
  }),
});

export const HomeAreaInput = z.object({
  name: z.string().trim().min(2, "Name the area, e.g. “Clinton County, IA”").max(80),
  feature: HomeAreaFeature,
});

function asFeature(value: unknown): StoredFeature | null {
  const r = HomeAreaFeature.safeParse(value);
  return r.success ? r.data : null;
}

/** The brand's own area, else its platform's default, else null. */
export async function getHomeArea(db: Db, creatorId: string): Promise<HomeArea | null> {
  const brand = await db.creator.findUnique({
    where: { id: creatorId },
    select: { homeArea: true, homeAreaName: true, platform: { select: { name: true, homeArea: true, homeAreaName: true } } },
  });
  if (!brand) return null;
  const own = asFeature(brand.homeArea);
  if (own) return { name: brand.homeAreaName ?? "Home area", source: "brand", feature: own };
  const platform = asFeature(brand.platform.homeArea);
  if (platform) return { name: brand.platform.homeAreaName ?? brand.platform.name, source: "platform", feature: platform };
  return null;
}

/** Both layers, for the settings screen. */
export async function getHomeAreaLayers(db: Db, creatorId: string) {
  const brand = await db.creator.findUnique({
    where: { id: creatorId },
    select: { homeArea: true, homeAreaName: true, platform: { select: { name: true, homeArea: true, homeAreaName: true } } },
  });
  if (!brand) return null;
  const own = asFeature(brand.homeArea);
  const platform = asFeature(brand.platform.homeArea);
  return {
    own: own ? { name: brand.homeAreaName ?? "Home area", feature: own } : null,
    platform: platform ? { name: brand.platform.homeAreaName ?? brand.platform.name, feature: platform } : null,
    platformName: brand.platform.name,
  };
}

export function readHomeArea(feature: unknown, name: string | null, fallbackName: string) {
  const f = asFeature(feature);
  return f ? { name: name ?? fallbackName, feature: f } : null;
}
