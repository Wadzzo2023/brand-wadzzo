"use client";

import MapView from "./map-view";

/** Map: your pins and hotspots on the map. Pin management is its own page (/pins/manage). */
export default function PinsPage() {
  return (
    <div className="relative h-[calc(100dvh-3.5rem-4rem-var(--safe-bottom))] lg:h-dvh">
      <MapView />
    </div>
  );
}
