"use client";

import { Loader2, MapPinned, Pencil, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";

import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";
import { toMapboxFeature, type StoredFeature } from "~/components/map-kit/geo";
import { PlaceSearch } from "~/components/map-kit/place-search";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";

export type Area = { name: string; feature: StoredFeature };

function fit(map: MapRef | null, features: (StoredFeature | null | undefined)[]) {
  const ring = features.flatMap((f) => toMapboxFeature(f)?.geometry.coordinates[0] ?? []);
  if (!map || ring.length === 0) return;
  const lngs = ring.map((p) => p[0]!);
  const lats = ring.map((p) => p[1]!);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 40, duration: 0 },
  );
}

/**
 * Draw and name a home area. Shows the saved area (solid) and, when given, the
 * area used if this one is removed (dashed) — e.g. the platform default under
 * a brand's own.
 */
export function HomeAreaEditor({
  current,
  fallback,
  saving,
  onSave,
  removeLabel,
}: {
  current: Area | null;
  fallback?: Area | null;
  saving: boolean;
  onSave: (area: Area | null) => void;
  /** Label for removing the saved area (omit to hide). */
  removeLabel?: string;
}) {
  const map = useRef<MapRef>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<StoredFeature | null>(null);
  const [name, setName] = useState(current?.name ?? "");

  const layers = useMemo(() => {
    const shown = draft ?? current?.feature;
    return {
      solid: toMapboxFeature(shown),
      dashed: fallback && !draft ? toMapboxFeature(fallback.feature) : null,
    };
  }, [draft, current, fallback]);

  const onLoad = useCallback(() => fit(map.current, [current?.feature, fallback?.feature]), [current, fallback]);

  return (
    <div className="space-y-3">
      <div className="relative h-[420px] overflow-hidden rounded-xl border">
        <BaseMap ref={map} initialViewState={WORLD_VIEW} onLoad={onLoad} cursor={drawing ? "crosshair" : "grab"}>
          {layers.dashed && (
            <Source id="home-fallback" type="geojson" data={layers.dashed}>
              <Layer id="home-fallback-line" type="line" paint={{ "line-color": "#64748b", "line-width": 1.5, "line-dasharray": [2, 2] }} />
            </Source>
          )}
          {layers.solid && !drawing && (
            <Source id="home-area" type="geojson" data={layers.solid}>
              <Layer id="home-area-fill" type="fill" paint={{ "fill-color": "#6366f1", "fill-opacity": 0.12 }} />
              <Layer id="home-area-line" type="line" paint={{ "line-color": "#6366f1", "line-width": 2 }} />
            </Source>
          )}
          {drawing && (
            <DrawTool
              onDone={(f) => {
                setDraft(f);
                setDrawing(false);
              }}
              onCancel={() => setDrawing(false)}
            />
          )}
        </BaseMap>
        {!drawing && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
            <PlaceSearch className="pointer-events-auto w-full sm:w-72" onSelect={(p) => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 10, duration: 700 })} />
            <Button className="pointer-events-auto ml-auto shadow-sm" variant={current || draft ? "outline" : "default"} onClick={() => setDrawing(true)}>
              <Pencil /> {current || draft ? "Redraw" : "Draw the area"}
            </Button>
          </div>
        )}
      </div>

      {(draft ?? current) && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clinton County, IA" maxLength={80} />
          </label>
          <Button
            disabled={saving || name.trim().length < 2 || (!draft && name.trim() === current?.name)}
            onClick={() => {
              const feature = draft ?? current?.feature;
              if (feature) onSave({ name: name.trim(), feature });
              setDraft(null);
            }}
          >
            {saving ? <Loader2 className="animate-spin" /> : <MapPinned />} Save area
          </Button>
          {draft && (
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              Discard drawing
            </Button>
          )}
          {current && !draft && removeLabel && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onSave(null)} disabled={saving}>
              <Trash2 /> {removeLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
