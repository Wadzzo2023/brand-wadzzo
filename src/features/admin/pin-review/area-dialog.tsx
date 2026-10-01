"use client";

import { MapIcon } from "lucide-react";
import { useMemo, useRef } from "react";
import { Layer, Source, type MapRef } from "react-map-gl/mapbox";

import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { PlaceSearch } from "~/components/map-kit/place-search";
import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";

import type { Area } from "./model";

/**
 * Pick the area to filter by: pan and zoom until the map shows it, then "Use
 * this area". Dots show where the current pins are, to help find them.
 */
export function AreaDialog({
  open,
  onOpenChange,
  area,
  points,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: Area | null;
  points: { lat: number; lng: number }[];
  onApply: (area: Area) => void;
}) {
  const map = useRef<MapRef>(null);

  const dots = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } })),
    }),
    [points],
  );

  // Start on the chosen area, else on where the pins are.
  const initial = area
    ? { bounds: [area.west, area.south, area.east, area.north] as [number, number, number, number], fitBoundsOptions: { padding: 0 } }
    : points.length
      ? {
          bounds: [
            Math.min(...points.map((p) => p.lng)),
            Math.min(...points.map((p) => p.lat)),
            Math.max(...points.map((p) => p.lng)),
            Math.max(...points.map((p) => p.lat)),
          ] as [number, number, number, number],
          fitBoundsOptions: { padding: 48, maxZoom: 12 },
        }
      : WORLD_VIEW;

  const apply = () => {
    const b = map.current?.getBounds();
    if (!b) return;
    onApply({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-hud">
            <MapIcon className="size-5 text-primary" /> Filter by area
          </DialogTitle>
          <DialogDescription>Move and zoom the map until it shows the area — pins with a location inside it are kept.</DialogDescription>
        </DialogHeader>
        <div className="relative h-[min(60vh,480px)] overflow-hidden rounded-lg border">
          {open && (
            <BaseMap ref={map} initialViewState={initial} projection="mercator">
              <Source id="review-dots" type="geojson" data={dots}>
                <Layer
                  id="review-dots"
                  type="circle"
                  paint={{ "circle-radius": 5, "circle-color": "#16a34a", "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff", "circle-opacity": 0.85 }}
                />
              </Source>
            </BaseMap>
          )}
          <div className="absolute top-2 left-2 w-[min(100%-1rem,320px)]">
            <PlaceSearch onSelect={(p) => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 12, duration: 800 })} placeholder="Jump to a place" />
          </div>
          {/* The whole view is the area — a frame makes that clear. */}
          <div className="pointer-events-none absolute inset-3 rounded-md border-2 border-dashed border-primary/60" aria-hidden />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Use this area</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
