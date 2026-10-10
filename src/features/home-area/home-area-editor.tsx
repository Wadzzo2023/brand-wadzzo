"use client";

import { Loader2, MapPinned, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";

import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";
import { areaBounds, toMapboxArea, type AreaFeature } from "~/components/map-kit/geo";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";

import { AreaSearch } from "./area-search";

export type Area = { name: string; feature: AreaFeature };

function fit(map: MapRef | null, features: (AreaFeature | null | undefined)[], duration = 0) {
  const bounds = areaBounds(features);
  // Room at the top for the search box.
  if (map && bounds) map.fitBounds(bounds, { padding: { top: 80, bottom: 30, left: 30, right: 30 }, duration });
}

/**
 * Set and name a home area: find a place's real outline by name (a county,
 * city, state or country), or draw one. Shows the saved area (solid) and, when
 * given, the area used if this one is removed (dashed) — e.g. the platform
 * default under a brand's own.
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
  const [draft, setDraft] = useState<AreaFeature | null>(null);
  const [name, setName] = useState(current?.name ?? "");

  const layers = useMemo(() => {
    const shown = draft ?? current?.feature;
    return {
      solid: toMapboxArea(shown),
      dashed: fallback && !draft ? toMapboxArea(fallback.feature) : null,
    };
  }, [draft, current, fallback]);

  const onLoad = useCallback(() => fit(map.current, [current?.feature, fallback?.feature]), [current, fallback]);
  // Show a newly found or drawn area in full.
  useEffect(() => fit(map.current, [draft], 700), [draft]);

  return (
    <div className="space-y-3">
      <div className="relative h-[480px] overflow-hidden rounded-xl border">
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
              title="Draw your home area"
              minZoom={0}
              warnAboveMetres={Infinity}
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
            <AreaSearch
              className="pointer-events-auto w-full sm:w-96"
              onPick={(a) => {
                setDraft(a.feature);
                setName(a.name);
              }}
            />
            <Button className="pointer-events-auto ml-auto shadow-sm" variant="outline" onClick={() => setDrawing(true)}>
              <Pencil /> {current || draft ? "Draw instead" : "Or draw it"}
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
              Discard
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
