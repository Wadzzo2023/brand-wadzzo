import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DrawShape, StoredFeature } from "~/components/map-kit/geo";

/**
 * The area just drawn on the Pins map, handed to /pins/hotspots/new. Kept in
 * sessionStorage so a refresh of the form doesn't lose the drawing; cleared
 * once the hotspot is created or the brand cancels.
 */
export const useHotspotDraft = create<{
  feature: StoredFeature | null;
  shape: DrawShape;
  set: (feature: StoredFeature, shape: DrawShape) => void;
  clear: () => void;
}>()(
  persist(
    (set) => ({
      feature: null,
      shape: "polygon",
      set: (feature, shape) => set({ feature, shape }),
      clear: () => set({ feature: null }),
    }),
    { name: "wadzzo.hotspot-draft", storage: createJSONStorage(() => sessionStorage), partialize: (s) => ({ feature: s.feature, shape: s.shape }) },
  ),
);
