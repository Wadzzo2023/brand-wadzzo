"use client";

import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/mapbox";
import { create } from "zustand";

import { toMapboxArea, type AreaFeature } from "~/components/map-kit/geo";
import { cn } from "~/lib/utils";

export type AgentMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  kind: "place" | "event" | "pin";
  /** Shown faded (e.g. a place the brand already pinned). */
  muted?: boolean;
};

/**
 * What the map agent puts on the map: the results of the card the person is
 * looking at, the item they clicked, and the brand's home area outline.
 */
export const useAgentMap = create<{
  markers: AgentMarker[];
  /** Which card the markers came from (re-showing the same card doesn't refit). */
  sourceId: string | null;
  focus: { id: string; lat: number; lng: number; at: number } | null;
  homeArea: AreaFeature | null;
  show: (sourceId: string, markers: AgentMarker[]) => void;
  clear: () => void;
  focusOn: (m: { id: string; lat: number; lng: number }) => void;
  setHomeArea: (f: AreaFeature | null) => void;
}>()((set) => ({
  markers: [],
  sourceId: null,
  focus: null,
  homeArea: null,
  show: (sourceId, markers) => set({ sourceId, markers }),
  clear: () => set({ sourceId: null, markers: [], focus: null }),
  focusOn: (m) => set({ focus: { ...m, at: Date.now() } }),
  setHomeArea: (homeArea) => set({ homeArea }),
}));

const KIND = {
  place: { icon: MapPin, ring: "border-info", fill: "bg-info" },
  event: { icon: CalendarDays, ring: "border-warning", fill: "bg-warning" },
  pin: { icon: Sparkles, ring: "border-primary", fill: "bg-primary" },
} as const;

/** Render inside a BaseMap: the home area outline and the agent's result markers. */
export function AgentMapLayer() {
  const { current: map } = useMap();
  const { markers, sourceId, focus, homeArea } = useAgentMap();

  const area = useMemo(() => {
    const f = toMapboxArea(homeArea);
    return f ? { type: "FeatureCollection" as const, features: [f] } : null;
  }, [homeArea]);

  // Frame new results.
  useEffect(() => {
    if (!map || markers.length === 0) return;
    const lngs = markers.map((m) => m.lng);
    const lats = markers.map((m) => m.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      // Leave room for the chat window on wide screens.
      { padding: { top: 90, bottom: 60, left: 60, right: window.innerWidth >= 1024 ? 480 : 60 }, maxZoom: 15, duration: 900 },
    );
    // Only when a different card's results arrive, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sourceId]);

  useEffect(() => {
    if (map && focus) map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 16), duration: 700 });
  }, [map, focus]);

  return (
    <>
      {area && (
        <Source id="agent-home-area" type="geojson" data={area}>
          <Layer id="agent-home-area-fill" type="fill" paint={{ "fill-color": "#6366f1", "fill-opacity": 0.04 }} />
          <Layer id="agent-home-area-line" type="line" paint={{ "line-color": "#6366f1", "line-width": 1.5, "line-opacity": 0.6, "line-dasharray": [2, 2] }} />
        </Source>
      )}
      {markers.map((m) => {
        const k = KIND[m.kind];
        const focused = focus?.id === m.id;
        return (
          <Marker key={`${m.kind}-${m.id}`} latitude={m.lat} longitude={m.lng} anchor="bottom" style={{ zIndex: focused ? 2 : 1 }}>
            <span title={m.title} className={cn("flex flex-col items-center transition-transform", m.muted && "opacity-50", focused && "scale-125")}>
              <span className={cn("flex size-7 items-center justify-center rounded-full border-2 bg-card shadow-md", k.ring)}>
                <k.icon className="size-3.5 text-foreground" />
              </span>
              <span className={cn("-mt-0.5 size-2 rotate-45 rounded-[1px]", k.fill)} aria-hidden />
            </span>
          </Marker>
        );
      })}
    </>
  );
}
