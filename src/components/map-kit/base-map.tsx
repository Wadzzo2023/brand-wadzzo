"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "next-themes";
import { forwardRef, type ReactNode } from "react";
import MapGL, { NavigationControl, type MapProps, type MapRef } from "react-map-gl/mapbox";

import { env } from "~/env";
import { cn } from "~/lib/utils";

/** Same styles as the fan apps, following the portal's light/dark theme. */
export const MAP_STYLE = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
} as const;

export const WORLD_VIEW = { latitude: 22.55, longitude: 0, zoom: 2.4 };

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
        {controls && <NavigationControl position={controlsPosition} showCompass={false} />}
        {children}
      </MapGL>
    </div>
  );
});
