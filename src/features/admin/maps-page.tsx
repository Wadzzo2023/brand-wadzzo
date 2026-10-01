"use client";

import { PinType } from "@prisma/client";
import { Hexagon, Plus, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/mapbox";

import AgentChat from "~/components/agent/AgentChat";
import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";
import { type DrawShape, type StoredFeature } from "~/components/map-kit/geo";
import { HotspotLayer } from "~/components/map-kit/hotspot-layer";
import { PinMarker } from "~/components/map-kit/pin-marker";
import { PlaceSearch } from "~/components/map-kit/place-search";
import { NearbyLocationsPanel } from "~/components/map/nearby-locations-panel";
import CopyCutPinModal from "~/components/modals/copy-cut-pin-modal";
import HotspotDetailModal from "~/components/modals/hotspot-details-modal";
import PinDetailAndActionsModal from "~/components/modals/pin-detail-modal";
import { Button } from "~/components/shadcn/ui/button";
import { Label } from "~/components/shadcn/ui/label";
import { Skeleton } from "~/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { useCopyCutModalStore } from "~/store/copy-cut-modal-store";
import { useHotspotDraft } from "~/store/hotspot-draft";
import { useSelectCreatorStore } from "~/components/store/creator-selection-store";
import { useMapInteractionStore, useNearbyPinsStore } from "~/store/map-stores";
import { getPinIcon } from "~/utils/map-helpers";
import { api } from "~/utils/api";

/**
 * Admin › Maps (Mapbox).
 * Allows admins to select any creator, inspect all pins & hotspots,
 * draw new hotspots, drop pins, and manage geolocation with modern Mapbox HUD styling.
 */
export default function AdminMapsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const map = useRef<MapRef>(null);

  const [showExpired, setShowExpired] = useState(false);
  const [drawing, setDrawing] = useState(() => search?.get("draw") === "1");
  const [drawShape, setDrawShape] = useState<DrawShape>(() => {
    const s = search?.get("shape");
    return s === "polygon" || s === "rectangle" || s === "circle" ? s : "polygon";
  });
  const [hotspotId, setHotspotId] = useState<string | null>(null);

  // Clear query params if draw mode was activated from URL
  useEffect(() => {
    if (search?.get("draw") === "1") {
      router.replace("/admin/maps", { scroll: false });
    }
  }, [search, router]);

  const {
    setPosition,
    openPinDetailModal,
    isPinCopied,
    isPinCut,
    setIsAutoCollect,
  } = useMapInteractionStore();

  const openCopyCut = useCopyCutModalStore((s) => s.setIsOpen);
  const setDraft = useHotspotDraft((s) => s.set);
  const { adminPins, setAdminPins, clearAdminPins, filterNearbyPins } = useNearbyPinsStore();
  const { data: selectedCreator, setData: setSelectedCreator } = useSelectCreatorStore();

  // Queries
  const creatorsQuery = api.fan.creator.getCreators.useQuery();
  const pinsQuery = api.maps.pin.getCreatorPins.useQuery(
    {
      creator_id: selectedCreator?.id ?? "",
      showExpired,
    },
    {
      enabled: Boolean(selectedCreator?.id),
    },
  );

  const hotspotsQuery = api.maps.pin.getCreatorHotspots.useQuery(
    {
      creatorId: selectedCreator?.id ?? "",
    },
    {
      enabled: Boolean(selectedCreator?.id),
    },
  );

  // Auto-select first creator if none is selected
  useEffect(() => {
    if (!selectedCreator && creatorsQuery.data && creatorsQuery.data.length > 0) {
      const first = creatorsQuery.data[0];
      if (first) setSelectedCreator(first);
    }
  }, [selectedCreator, creatorsQuery.data, setSelectedCreator]);

  // Sync pins to nearby store
  useEffect(() => {
    if (pinsQuery.isLoading) {
      setAdminPins([]);
      return;
    }
    if (pinsQuery.data) {
      setAdminPins(pinsQuery.data);
    } else {
      setAdminPins([]);
    }
  }, [pinsQuery.data, pinsQuery.isLoading, setAdminPins]);

  useEffect(() => {
    return () => {
      clearAdminPins();
    };
  }, [clearAdminPins]);

  const refreshInView = useCallback(() => {
    const b = map.current?.getBounds();
    if (b) {
      filterNearbyPins(
        { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
        "admin",
      );
    }
  }, [filterNearbyPins]);

  useEffect(refreshInView, [adminPins, refreshInView]);

  // Center on pins when creator changes
  const lastFittedCreator = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCreator || lastFittedCreator.current === selectedCreator.id || !map.current) return;

    if (pinsQuery.data && pinsQuery.data.length > 0) {
      lastFittedCreator.current = selectedCreator.id;
      const points = pinsQuery.data.map((p) => [p.longitude, p.latitude] as const);
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      map.current.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 100, maxZoom: 15, duration: 800 },
      );
    }
  }, [selectedCreator, pinsQuery.data]);

  const flyTo = (c: { lat: number; lng: number }, zoom = 15) => {
    map.current?.flyTo({ center: [c.lng, c.lat], zoom, duration: 700 });
  };

  const onMapClick = (lat: number, lng: number) => {
    if (drawing) return;

    if (isPinCopied || isPinCut) {
      setPosition({ lat, lng });
      openCopyCut(true);
      return;
    }

    const creatorParam = selectedCreator ? `&creatorId=${selectedCreator.id}` : "";
    router.push(`/admin/pins/new?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}${creatorParam}`);
  };

  const handleManualPinClick = () => {
    const creatorParam = selectedCreator ? `?creatorId=${selectedCreator.id}` : "";
    router.push(`/admin/pins/new${creatorParam}`);
  };

  const handleStartDraw = (shape: DrawShape = "polygon") => {
    setDrawShape(shape);
    setDrawing(true);
  };

  const onDrawn = useCallback(
    (feature: StoredFeature, shape: DrawShape) => {
      setDraft(feature, shape);
      setDrawing(false);
      const creatorParam = selectedCreator ? `?creatorId=${selectedCreator.id}` : "";
      router.push(`/admin/pins/hotspots/new${creatorParam}`);
    },
    [router, selectedCreator, setDraft],
  );

  return (
    <div className="relative h-[calc(100dvh-3.5rem-4rem-var(--safe-bottom))] w-full overflow-hidden lg:h-dvh">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        initialViewState={WORLD_VIEW}
        onClick={(e) => {
          const m = map.current;
          if (
            !drawing &&
            m?.getLayer("hotspot-fill") &&
            m.queryRenderedFeatures(e.point, { layers: ["hotspot-fill"] }).length
          ) {
            return;
          }
          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }}
        onMoveEnd={refreshInView}
        onLoad={refreshInView}
        cursor={drawing ? "crosshair" : isPinCopied || isPinCut ? "copy" : "pointer"}
      >
        {hotspotsQuery.data && (
          <HotspotLayer
            hotspots={hotspotsQuery.data}
            onSelect={drawing ? undefined : setHotspotId}
          />
        )}

        {!drawing &&
          adminPins.map((pin) => {
            const g = pin.locationGroup;
            return (
              <PinMarker
                key={pin.id}
                lat={pin.latitude}
                lng={pin.longitude}
                image={g?.image ?? g?.creator?.profileUrl}
                icon={getPinIcon(g?.type ?? PinType.OTHER)}
                count={pin._count.consumers}
                label={g?.title ?? "Pin"}
                state={{
                  expired: g?.endDate ? new Date(g.endDate) < new Date() : false,
                  empty: g?.remaining !== undefined && g.remaining <= 0,
                  approved: g?.approved === true,
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

        {drawing && (
          <DrawTool
            initialShape={drawShape}
            onDone={onDrawn}
            onCancel={() => setDrawing(false)}
          />
        )}
      </BaseMap>

      {/* Floating HUD Toolbar */}
      {!drawing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
          {/* Creator Selector */}
          <div className="pointer-events-auto w-56 sm:w-64">
            {creatorsQuery.isLoading ? (
              <Skeleton className="h-10 w-full rounded-md border bg-card/95 shadow-sm backdrop-blur-sm" />
            ) : (
              <Select
                value={selectedCreator?.id}
                onValueChange={(val) => {
                  const found = creatorsQuery.data?.find((c) => c.id === val);
                  if (found) setSelectedCreator(found);
                }}
              >
                <SelectTrigger className="h-10 border bg-card/95 font-hud text-xs shadow-sm backdrop-blur-sm">
                  <div className="flex items-center gap-2 truncate">
                    <UserRound className="size-4 shrink-0 text-primary" />
                    <SelectValue placeholder="Select a brand..." />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {creatorsQuery.data?.map((creator) => (
                    <SelectItem key={creator.id} value={creator.id} className="text-xs">
                      {creator.name || creator.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <PlaceSearch className="pointer-events-auto w-full sm:w-72" onSelect={(p) => flyTo(p, 14)} />

          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-lg border bg-card/95 px-3 shadow-sm backdrop-blur-sm">
            <Switch id="show-expired" checked={showExpired} onCheckedChange={setShowExpired} />
            <Label htmlFor="show-expired" className="text-xs font-medium">
              Show expired
            </Label>
          </div>

          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              className="shadow-sm"
              onClick={() => handleStartDraw("polygon")}
            >
              <Hexagon className="size-4" />
              <span className="hidden sm:inline">Draw hotspot</span>
            </Button>
            <Button className="shadow-sm" onClick={handleManualPinClick}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Create Pin</span>
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

      {/* In-view pins list */}
      {!drawing && (
        <NearbyLocationsPanel
          className="absolute right-4 top-20 z-10"
          onSelectPlace={(c) => flyTo(c)}
        />
      )}

      {/* Modals & Agent */}
      <PinDetailAndActionsModal />
      <CopyCutPinModal />
      <HotspotDetailModal
        isOpen={Boolean(hotspotId)}
        setIsOpen={(o: boolean) => !o && setHotspotId(null)}
        hotspotId={hotspotId}
      />
      {selectedCreator && <AgentChat creatorId={selectedCreator.id} />}
    </div>
  );
}
