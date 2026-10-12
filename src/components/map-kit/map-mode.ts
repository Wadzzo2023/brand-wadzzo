import { useSyncExternalStore } from "react";

/**
 * The portal's 2D / 3D map choice, shared by every map and kept per device.
 * "2d" (the default) is a flat Mapbox Light / Dark map; "3d" is the Wadzzo 3D
 * style (Mapbox Standard with 3D buildings), tilted.
 */
export type MapMode = "2d" | "3d";

export const MAP_MODE_STORAGE_KEY = "wadzzo-brand-map-mode";

export const MAP_STYLE_3D = {
  // "Wadzzo 3D Light/Dark" (Mapbox Standard + Wadzzo colour theme) — see
  // wadzzoAR/docs/map-style.md.
  light: "mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw",
  dark: "mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu",
} as const;

export const MAP_STYLE_2D = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
} as const;

export function mapStyleFor(mode: MapMode, theme: "light" | "dark") {
  return (mode === "3d" ? MAP_STYLE_3D : MAP_STYLE_2D)[theme];
}

const listeners = new Set<() => void>();
/** Holds the choice when localStorage is unavailable, so the toggle still works for the session. */
let memoryMode: MapMode | null = null;

export function readMapMode(): MapMode {
  if (memoryMode) return memoryMode;
  try {
    return window.localStorage.getItem(MAP_MODE_STORAGE_KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MAP_MODE_STORAGE_KEY) {
      memoryMode = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setMapMode(mode: MapMode) {
  memoryMode = mode;
  try {
    window.localStorage.setItem(MAP_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  listeners.forEach((l) => l());
}

/** "2d" on the server and until hydrated. */
export function useMapMode(): MapMode {
  return useSyncExternalStore<MapMode>(subscribe, readMapMode, () => "2d");
}

const noSubscribe = () => () => undefined;

/** False while rendering on the server and during hydration, true afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
