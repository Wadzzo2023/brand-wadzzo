"use client";

import { PinType } from "@prisma/client";
import { Hexagon, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MapRef } from "react-map-gl/mapbox";

import AgentChat from "~/components/agent/AgentChat";
import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";
import { toMapboxFeature, type DrawShape, type StoredFeature } from "~/components/map-kit/geo";
import { HotspotLayer } from "~/components/map-kit/hotspot-layer";
import { PinLegend, PinMarker } from "~/components/map-kit/pin-marker";
import { PlaceSearch } from "~/components/map-kit/place-search";
import { NearbyLocationsPanel } from "~/components/map/nearby-locations-panel";
import CopyCutPinModal from "~/components/modals/copy-cut-pin-modal";
import HotspotDetailModal from "~/components/modals/hotspot-details-modal";
import PinDetailAndActionsModal from "~/components/modals/pin-detail-modal";
import { Button } from "~/components/shadcn/ui/button";
import { Label } from "~/components/shadcn/ui/label";
import { Switch } from "~/components/shadcn/ui/switch";
import { useCopyCutModalStore } from "~/store/copy-cut-modal-store";
import { useHotspotDraft } from "~/store/hotspot-draft";
import { useMapInteractionStore, useNearbyPinsStore } from "~/store/map-stores";
import { getPinIcon } from "~/utils/map-helpers";
import { api } from "~/utils/api";

/**
 * Pins › Map (Mapbox). Your pins and hotspot areas; click the map to start a
 * pin there, draw an area to start a hotspot. Copied/cut pins paste where you
 * click. Pins in view are listed on the right (desktop).
 */
export default function MapView({ toolbarEnd }: { toolbarEnd?: ReactNode }) {
  const router = useRouter();
  const map = useRef<MapRef>(null);
  const [showExpired, setShowExpired] = useState(false);
  const search = useSearchParams();
  const [drawing, setDrawing] = useState(false);
  const [drawShape, setDrawShape] = useState<DrawShape>("polygon");

  // /pins?draw=1[&shape=circle] opens straight into drawing (from "Redraw"):
  // switch modes during render, then drop the flag from the URL.
  const drawParam = search?.get("draw") === "1" ? (search.get("shape") ?? "") : null;
  const [seenDraw, setSeenDraw] = useState<string | null>(null);
  if (drawParam !== seenDraw) {
    setSeenDraw(drawParam);
    if (drawParam !== null) {
      if (drawParam === "polygon" || drawParam === "rectangle" || drawParam === "circle") setDrawShape(drawParam);
      setDrawing(true);
    }
  }
  useEffect(() => {
    if (search?.get("draw") === "1") router.replace("/pins", { scroll: false });
  }, [search, router]);
  const [hotspotId, setHotspotId] = useState<string | null>(null);

  const { setPosition, openPinDetailModal, isPinCopied, isPinCut, setIsAutoCollect } = useMapInteractionStore();
  const { myPins, setMyPins, filterNearbyPins } = useNearbyPinsStore();
  const openCopyCut = useCopyCutModalStore((s) => s.setIsOpen);
  const setDraft = useHotspotDraft((s) => s.set);

  const pins = api.maps.pin.getMyPins.useQuery({ showExpired });
  const hotspots = api.maps.pin.myHotspots.useQuery();

  // /pins?hotspot=<id> opens that hotspot and frames its area.
  const linkedHotspot = search?.get("hotspot");
  useEffect(() => {
    if (!linkedHotspot || !hotspots.data) return;
    const h = hotspots.data.find((x) => x.id === linkedHotspot);
    const ring = h && toMapboxFeature(h.geoJson as Parameters<typeof toMapboxFeature>[0])?.geometry.coordinates[0];
    if (ring?.length) {
      const lngs = ring.map((p) => p[0]!);
      const lats = ring.map((p) => p[1]!);
      map.current?.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 120, maxZoom: 17, duration: 0 },
      );
    }
  }, [linkedHotspot, hotspots.data]);
  // …and opens its details once the hotspots have loaded.
  const [seenLink, setSeenLink] = useState<string | null>(null);
  if (linkedHotspot && hotspots.data && seenLink !== linkedHotspot) {
    setSeenLink(linkedHotspot);
    if (hotspots.data.some((x) => x.id === linkedHotspot)) setHotspotId(linkedHotspot);
  }
  useEffect(() => {
    if (pins.data) setMyPins(pins.data);
  }, [pins.data, setMyPins]);

  const refreshInView = useCallback(() => {
    const b = map.current?.getBounds();
    if (b) filterNearbyPins({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }, "my");
  }, [filterNearbyPins]);
  useEffect(refreshInView, [myPins, refreshInView]);

  // Start near the brand's pins, else near the browser's location.
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || !pins.data || !hotspots.data || !map.current) return;
    centred.current = true;
    if (search?.get("hotspot")) return; // the deep link frames its own area
    // Every pin plus every hotspot corner.
    const points = [
      ...pins.data.map((p) => [p.longitude, p.latitude] as const),
      ...hotspots.data.flatMap((h) => toMapboxFeature(h.geoJson as Parameters<typeof toMapboxFeature>[0])?.geometry.coordinates[0]?.map(([lng, lat]) => [lng!, lat!] as const) ?? []),
    ];
    if (points.length) {
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      map.current.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 80, maxZoom: 15, duration: 0 },
      );
    } else {
      navigator.geolocation?.getCurrentPosition((pos) =>
        map.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12, duration: 800 }),
      );
    }
  }, [pins.data, hotspots.data, search]);

  const flyTo = (c: { lat: number; lng: number }, zoom = 15) => map.current?.flyTo({ center: [c.lng, c.lat], zoom, duration: 700 });

  const onMapClick = (lat: number, lng: number) => {
    if (drawing) return;
    if (isPinCopied || isPinCut) {
      setPosition({ lat, lng });
      openCopyCut(true);
      return;
    }
    router.push(`/pins/new?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);
  };

  const onDrawn = useCallback(
    (feature: StoredFeature, shape: DrawShape) => {
      setDraft(feature, shape);
      setDrawing(false);
      router.push("/pins/hotspots/new");
    },
    [router, setDraft],
  );

  return (
    <div className="relative size-full">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        initialViewState={WORLD_VIEW}
        onClick={(e) => {
          // A click on a hotspot area opens that hotspot (HotspotLayer handles
          // it) — it must not also start a new pin underneath.
          const m = map.current;
          if (!drawing && m?.getLayer("hotspot-fill") && m.queryRenderedFeatures(e.point, { layers: ["hotspot-fill"] }).length) return;
          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }}
        onMoveEnd={refreshInView}
        onLoad={refreshInView}
        cursor={drawing ? "crosshair" : isPinCopied || isPinCut ? "copy" : "pointer"}
      >
        {hotspots.data && <HotspotLayer hotspots={hotspots.data} onSelect={drawing ? undefined : setHotspotId} />}
        {!drawing &&
          myPins.map((pin) => {
            const g = pin.locationGroup;
            return (
              <PinMarker
                key={pin.id}
                lat={pin.latitude}
                lng={pin.longitude}
                image={g?.image ?? g?.creator.profileUrl}
                icon={getPinIcon(g?.type ?? PinType.OTHER)}
                count={pin._count.consumers}
                label={g?.title ?? "Pin"}
                state={{
                  expired: g?.endDate ? new Date(g.endDate) < new Date() : false,
                  empty: g ? g.limit > 0 && g.remaining <= 0 : false, // limit 0 = no limit
                  approved: g?.approved === true,
                  rejected: g?.approved === false,
                  hidden: pin.hidden === true,
                  autoCollect: pin.autoCollect === true,
                }}
                onClick={() => {
                  openPinDetailModal(pin);
                  setIsAutoCollect(pin.autoCollect);
                }}
              />
            );
          })}
        {drawing && <DrawTool initialShape={drawShape} onDone={onDrawn} onCancel={() => setDrawing(false)} />}
      </BaseMap>

      {/* Toolbar */}
      {!drawing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
          <PlaceSearch className="pointer-events-auto w-full sm:w-80" onSelect={(p) => flyTo(p, 14)} />
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-lg border bg-card px-3 shadow-sm">
            <Switch id="show-expired" checked={showExpired} onCheckedChange={setShowExpired} />
            <Label htmlFor="show-expired" className="text-xs font-medium">
              Show expired
            </Label>
          </div>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            {toolbarEnd}
            <Button variant="outline" className="shadow-sm" onClick={() => setDrawing(true)}>
              <Hexagon /> <span className="hidden sm:inline">Draw hotspot</span>
            </Button>
            <Button className="hidden shadow-sm sm:inline-flex" onClick={() => router.push("/pins/new")}>
              <Plus /> New pin
            </Button>
          </div>
        </div>
      )}

      {/* Paste mode banner */}
      {(isPinCopied || isPinCut) && !drawing && (
        <div className="absolute left-1/2 top-28 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 font-hud text-xs font-semibold text-primary-foreground shadow-lg sm:top-20">
          Click the map to {isPinCut ? "move" : "paste"} the pin
        </div>
      )}

      {!drawing && <NearbyLocationsPanel className="absolute right-4 top-20 z-10" onSelectPlace={(c) => flyTo(c)} />}
      {!drawing && <PinLegend className="absolute bottom-8 left-14 z-10 hidden sm:block" />}

      <PinDetailAndActionsModal />
      <CopyCutPinModal />
      <HotspotDetailModal isOpen={Boolean(hotspotId)} setIsOpen={(o: boolean) => !o && setHotspotId(null)} hotspotId={hotspotId} />
      <AgentChat />
    </div>
  );
}
