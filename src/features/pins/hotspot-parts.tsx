"use client";

import { useMemo, useRef } from "react";
import { Layer, Source, type MapRef } from "react-map-gl/mapbox";

import { BaseMap } from "~/components/map-kit/base-map";
import { featureCenter, haversineMetres, toMapboxFeature, type StoredFeature } from "~/components/map-kit/geo";

/** Shared by the new and edit hotspot pages. */

export const toInput = (d?: Date) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const DROP_EVERY = [
  [1, "Every day"],
  [2, "Every 2 days"],
  [3, "Every 3 days"],
  [5, "Every 5 days"],
  [7, "Every week"],
  [14, "Every 2 weeks"],
  [30, "Every month"],
] as const;
export const LIFETIME = [
  [1, "1 day"],
  [2, "2 days"],
  [3, "3 days"],
  [5, "5 days"],
  [7, "1 week"],
  [14, "2 weeks"],
  [30, "1 month"],
] as const;

/** The drawn area on a small, non-interactive map, framed to fit. */
export function AreaPreview({ feature }: { feature: StoredFeature }) {
  const map = useRef<MapRef>(null);
  const shape = useMemo(() => toMapboxFeature(feature), [feature]);
  const c = featureCenter(feature);

  const fit = () => {
    const ring = shape?.geometry.coordinates[0];
    if (!ring || !map.current) return;
    const lngs = ring.map((p) => p[0]!);
    const lats = ring.map((p) => p[1]!);
    map.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 32, duration: 0, maxZoom: 17 },
    );
  };

  return (
    <div className="h-56 overflow-hidden rounded-xl border">
      <BaseMap ref={map} initialViewState={{ latitude: c.lat, longitude: c.lng, zoom: 14 }} onLoad={fit} interactive={false} controls={false}>
        {shape && (
          <Source id="hotspot-preview" type="geojson" data={shape}>
            <Layer id="hotspot-preview-fill" type="fill" paint={{ "fill-color": "#22c55e", "fill-opacity": 0.2 }} />
            <Layer id="hotspot-preview-line" type="line" paint={{ "line-color": "#16a34a", "line-width": 2 }} />
          </Source>
        )}
      </BaseMap>
    </div>
  );
}

export function AreaSize({ feature, shape }: { feature: StoredFeature; shape: "circle" | "rectangle" | "polygon" }) {
  const r = feature.properties?.radiusMetres;
  if (shape === "circle" && r) return <>Circle · {r >= 1000 ? `${(r / 1000).toFixed(2)} km` : `${Math.round(r)} m`} radius</>;
  // Rough extent: the ring's widest span.
  const ring = feature.geometry.coordinates[0] ?? [];
  let max = 0;
  for (const a of ring) for (const b of ring) max = Math.max(max, haversineMetres({ lat: a[0]!, lng: a[1]! }, { lat: b[0]!, lng: b[1]! }));
  const label = shape === "rectangle" ? "Rectangle" : "Polygon";
  return (
    <>
      {label} · about {max >= 1000 ? `${(max / 1000).toFixed(2)} km` : `${Math.round(max)} m`} across
    </>
  );
}
