"use client";

import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";

import { Input } from "~/components/shadcn/ui/input";
import { Label } from "~/components/shadcn/ui/label";
import { cn } from "~/lib/utils";

import { BaseMap, WORLD_VIEW } from "./base-map";
import { circleFeature, toMapboxFeature, type LatLng } from "./geo";
import { PlaceSearch, type Place } from "./place-search";

/**
 * Pick one location for a form: click the map, drag the marker, search a
 * place, use your current location, or type coordinates. Optionally shows the
 * collection radius around it.
 */
export function MapPicker({
  value,
  onChange,
  radiusMetres,
  className,
  mapClassName,
  showInputs = true,
  onPlace,
}: {
  value: LatLng | null;
  onChange: (v: LatLng) => void;
  radiusMetres?: number;
  className?: string;
  mapClassName?: string;
  showInputs?: boolean;
  /** Also called with the name/address when a search result is picked. */
  onPlace?: (place: Place) => void;
}) {
  const map = useRef<MapRef>(null);
  const [locating, setLocating] = useState(false);
  const [draft, setDraft] = useState({ lat: value?.lat.toString() ?? "", lng: value?.lng.toString() ?? "" });

  useEffect(() => setDraft({ lat: value?.lat.toFixed(6) ?? "", lng: value?.lng.toFixed(6) ?? "" }), [value?.lat, value?.lng]);

  const fly = (v: LatLng, zoom = 15) => map.current?.flyTo({ center: [v.lng, v.lat], zoom: Math.max(zoom, map.current.getZoom()), duration: 700 });
  const set = (v: LatLng, flyTo = false) => {
    onChange(v);
    if (flyTo) fly(v);
  };

  const radius = useMemo(() => {
    if (!value || !radiusMetres || radiusMetres <= 0) return null;
    const R = 6_371_000;
    const dLat = (radiusMetres / R) * (180 / Math.PI);
    return toMapboxFeature(circleFeature(value, { lat: value.lat + dLat, lng: value.lng }));
  }, [value, radiusMetres]);

  const commitDraft = () => {
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && draft.lat !== "" && draft.lng !== "") set({ lat, lng }, true);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("relative h-72 overflow-hidden rounded-xl border", mapClassName)}>
        <BaseMap
          ref={map}
          initialViewState={value ? { latitude: value.lat, longitude: value.lng, zoom: 15 } : WORLD_VIEW}
          onClick={(e) => set({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
          cursor="crosshair"
        >
          {radius && (
            <Source id="picker-radius" type="geojson" data={radius}>
              <Layer id="picker-radius-fill" type="fill" paint={{ "fill-color": "#22c55e", "fill-opacity": 0.12 }} />
              <Layer id="picker-radius-line" type="line" paint={{ "line-color": "#16a34a", "line-width": 1.5 }} />
            </Source>
          )}
          {value && (
            <Marker latitude={value.lat} longitude={value.lng} anchor="bottom" draggable onDragEnd={(e) => set({ lat: e.lngLat.lat, lng: e.lngLat.lng })}>
              <MapPin className="size-9 fill-primary text-primary-foreground drop-shadow-md" strokeWidth={1.5} />
            </Marker>
          )}
        </BaseMap>
        <div className="absolute inset-x-3 top-3 z-10 flex gap-2">
          <PlaceSearch className="flex-1" onSelect={(p) => (set(p, true), onPlace?.(p))} proximity={value ?? undefined} />
          <button
            type="button"
            onClick={() => {
              if (!navigator.geolocation) return;
              setLocating(true);
              navigator.geolocation.getCurrentPosition(
                (pos) => (set({ lat: pos.coords.latitude, lng: pos.coords.longitude }, true), setLocating(false)),
                () => setLocating(false),
                { enableHighAccuracy: true, timeout: 10_000 },
              );
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card shadow-sm hover:bg-accent"
            aria-label="Use my current location"
            title="Use my current location"
          >
            <LocateFixed className={cn("size-4", locating && "animate-pulse text-primary")} />
          </button>
        </div>
        {!value && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <span className="rounded-full bg-card/95 px-3 py-1 text-xs font-medium shadow">Click the map to place it</span>
          </div>
        )}
      </div>
      {showInputs && (
        <div className="grid grid-cols-2 gap-3">
          {(["lat", "lng"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`picker-${k}`} className="text-xs text-muted-foreground">
                {k === "lat" ? "Latitude" : "Longitude"}
              </Label>
              <Input
                id={`picker-${k}`}
                inputMode="decimal"
                value={draft[k]}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                onBlur={commitDraft}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commitDraft())}
                placeholder={k === "lat" ? "23.8103" : "90.4125"}
                className="font-mono text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
