"use client";

import { useEffect, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";

import { toMapboxFeature } from "./geo";

export type HotspotShape = { id: string; geoJson: unknown; isActive: boolean; autoCollect: boolean };

/**
 * Saved hotspot areas: green fill, border colour by collection mode (green
 * auto / blue manual), faded when paused. Clicking one reports its id.
 */
export function HotspotLayer({ hotspots, onSelect }: { hotspots: HotspotShape[]; onSelect?: (id: string) => void }) {
  const { current: map } = useMap();
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: hotspots.flatMap((h) => {
        const f = toMapboxFeature(h.geoJson as Parameters<typeof toMapboxFeature>[0], { id: h.id, active: h.isActive, auto: h.autoCollect });
        return f ? [f] : [];
      }),
    }),
    [hotspots],
  );

  useEffect(() => {
    if (!map || !onSelect) return;
    const click = (e: mapboxgl.MapLayerMouseEvent) => {
      const id = (e.features?.[0] as { properties?: { id?: string } } | undefined)?.properties?.id;
      if (id) onSelect(id);
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");
    map.on("click", "hotspot-fill", click);
    map.on("mouseenter", "hotspot-fill", enter);
    map.on("mouseleave", "hotspot-fill", leave);
    return () => {
      map.off("click", "hotspot-fill", click);
      map.off("mouseenter", "hotspot-fill", enter);
      map.off("mouseleave", "hotspot-fill", leave);
    };
  }, [map, onSelect]);

  return (
    <Source id="hotspots" type="geojson" data={data}>
      <Layer id="hotspot-fill" type="fill" paint={{ "fill-color": "#22c55e", "fill-opacity": ["case", ["get", "active"], 0.2, 0.06] }} />
      <Layer
        id="hotspot-line"
        type="line"
        paint={{
          "line-color": ["case", ["get", "auto"], "#22c55e", "#3b82f6"],
          "line-width": 2,
          "line-opacity": ["case", ["get", "active"], 0.9, 0.4],
        }}
      />
    </Source>
  );
}
