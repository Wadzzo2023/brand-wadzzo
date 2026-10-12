"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "next-themes";
import type { IControl } from "mapbox-gl";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import MapGL, { NavigationControl, useControl, useMap, type MapProps, type MapRef } from "react-map-gl/mapbox";

import { env } from "~/env";
import { cn } from "~/lib/utils";

import { mapStyleFor, readMapMode, setMapMode, useIsClient, useMapMode, type MapMode } from "./map-mode";

export { MAP_STYLE_2D, MAP_STYLE_3D } from "./map-mode";

export const WORLD_VIEW = { latitude: 22.55, longitude: 0, zoom: 2.4 };

/**
 * Mapbox only resizes its canvas with the window. Keep it filling its box when
 * the box itself changes size (layout settling, panels opening), or part of the
 * map stays blank.
 */
function FollowContainerSize() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [current]);
  return null;
}

/** Tilts the map for 3D and lays it flat for 2D when the mode is switched. */
function ApplyMapMode({ mode }: { mode: MapMode }) {
  const { current } = useMap();
  const first = useRef(true);
  useEffect(() => {
    // The first run is the initial mode, which the map was created with.
    if (first.current) {
      first.current = false;
      return;
    }
    current?.easeTo({ pitch: mode === "3d" ? 45 : 0, duration: 500 });
  }, [current, mode]);
  return null;
}

/** A small "2D / 3D" button in the map's corner, next to the zoom buttons. */
class MapModeControl implements IControl {
  private el?: HTMLDivElement;
  private button?: HTMLButtonElement;

  onAdd() {
    const el = document.createElement("div");
    el.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.style.fontSize = "11px";
    button.style.fontWeight = "700";
    button.addEventListener("click", () => setMapMode(readMapMode() === "3d" ? "2d" : "3d"));
    el.appendChild(button);
    this.el = el;
    this.button = button;
    return el;
  }

  onRemove() {
    this.el?.remove();
  }

  /** Shows the mode a click switches to, the way map apps do. */
  show(mode: MapMode) {
    if (!this.button) return;
    const next = mode === "3d" ? "2D" : "3D";
    this.button.textContent = next;
    this.button.title = `Switch to the ${next} map`;
    this.button.setAttribute("aria-label", `Switch to the ${next} map`);
  }
}

function MapModeToggle({ mode, position }: { mode: MapMode; position: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) {
  const control = useControl<MapModeControl>(() => new MapModeControl(), { position });
  useEffect(() => control.show(mode), [control, mode]);
  return null;
}

/**
 * The portal's one map: Mapbox, themed, with the same token everywhere.
 * Flat 2D (day / night) by default; a corner button switches every map to the
 * 3D city style and back.
 * Children are react-map-gl layers/markers/controls.
 */
export const BaseMap = forwardRef<
  MapRef,
  Omit<MapProps, "mapboxAccessToken" | "mapStyle"> & {
    children?: ReactNode;
    className?: string;
    controls?: boolean;
    controlsPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  }
>(function BaseMap({ children, className, controls = true, controlsPosition = "bottom-right", ...props }, ref) {
  const { resolvedTheme } = useTheme();
  const mode = useMapMode();
  // Wait for the browser so the map is created with the real theme and mode;
  // swapping the style while it loads breaks Mapbox Standard.
  const mounted = useIsClient();
  if (!mounted || !resolvedTheme) return <div className={cn("relative size-full", className)} />;

  const is3d = mode === "3d";
  const { initialViewState, maxPitch, ...rest } = props;
  return (
    <div className={cn("relative size-full", className)}>
      <MapGL
        ref={ref}
        mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_API}
        mapStyle={mapStyleFor(mode, resolvedTheme === "dark" ? "dark" : "light")}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1.5}
        maxZoom={20}
        initialViewState={initialViewState && !is3d ? { ...initialViewState, pitch: 0 } : initialViewState}
        maxPitch={is3d ? maxPitch : 0}
        {...rest}
      >
        <FollowContainerSize />
        <ApplyMapMode mode={mode} />
        {controls && <NavigationControl position={controlsPosition} showCompass={false} />}
        {controls && <MapModeToggle mode={mode} position={controlsPosition} />}
        {children}
      </MapGL>
    </div>
  );
});
