"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "next-themes";
import { forwardRef, useEffect, type ReactNode } from "react";
import MapGL, { NavigationControl, useMap, type MapProps, type MapRef } from "react-map-gl/mapbox";

import { env } from "~/env";
import { cn } from "~/lib/utils";

/** Same styles as the fan apps, following the portal's light/dark theme. */
export const MAP_STYLE = {
  // "Wadzzo 3D Light/Dark" (Mapbox Standard + Wadzzo colour theme) — see
  // wadzzoAR/docs/map-style.md.
  light: "mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw",
  dark: "mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu",
} as const;

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

/**
 * The portal's one map: Mapbox, themed, with the same token everywhere.
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
  return (
    <div className={cn("relative size-full", className)}>
      <MapGL
        ref={ref}
        mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_API}
        mapStyle={resolvedTheme === "dark" ? MAP_STYLE.dark : MAP_STYLE.light}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1.5}
        maxZoom={20}
        {...props}
      >
        <FollowContainerSize />
        {controls && <NavigationControl position={controlsPosition} showCompass={false} />}
        {children}
      </MapGL>
    </div>
  );
});
