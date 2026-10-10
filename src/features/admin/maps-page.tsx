"use client";

import { PinType } from "@prisma/client";
import { Hexagon, Loader2, MapPinOff, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/mapbox";

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
import { Switch } from "~/components/shadcn/ui/switch";
import { useSelectCreatorStore, type SelectedCreator } from "~/components/store/creator-selection-store";
import { AgentChat } from "~/features/agent/agent-chat";
import { AgentMapLayer } from "~/features/agent/agent-map";
import { useCopyCutModalStore } from "~/store/copy-cut-modal-store";
import { useHotspotDraft } from "~/store/hotspot-draft";
import { useMapInteractionStore, useNearbyPinsStore } from "~/store/map-stores";
import { api } from "~/utils/api";
import { getPinIcon } from "~/utils/map-helpers";

import { BrandPicker } from "./brand-picker";

/**
 * Admin › All maps: any brand's pins and hotspots on the map. Pick a brand,
 * then drop a pin (click the map), draw a hotspot, or open a pin to manage it
 * — the same tools a brand has on its own Map, on the brand's behalf.
 * The chosen brand is kept in the URL (?brand=…) so links and Back keep it.
 */
export default function AdminMapsPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/maps";
  const search = useSearchParams();
  const map = useRef<MapRef>(null);
  const [mapReady, setMapReady] = useState(false);

  const [showExpired, setShowExpired] = useState(false);
  const [drawing, setDrawing] = useState(() => search?.get("draw") === "1");
  const [drawShape] = useState<DrawShape>(() => {
    const s = search?.get("shape");
    return s === "polygon" || s === "rectangle" || s === "circle" ? s : "polygon";
  });
  const [hotspotId, setHotspotId] = useState<string | null>(null);

  const { setPosition, openPinDetailModal, isPinCopied, isPinCut, setIsAutoCollect } = useMapInteractionStore();
  const openCopyCut = useCopyCutModalStore((s) => s.setIsOpen);
  const setDraft = useHotspotDraft((s) => s.set);
  const { adminPins, setAdminPins, clearAdminPins, filterNearbyPins } = useNearbyPinsStore();
  const { data: stored, setData: setStored } = useSelectCreatorStore();

  // ── Which brand: ?brand= → last picked → first brand ────────────────────
  const brands = api.fan.creator.getCreators.useQuery(undefined, { refetchOnWindowFocus: false });
  const urlBrand = search?.get("brand");
  const brand = brands.data?.find((b) => b.id === urlBrand) ?? (stored && brands.data?.find((b) => b.id === stored.id)) ?? brands.data?.[0];

  const pickBrand = (b: SelectedCreator) => {
    setStored(b);
    router.replace(`${pathname}?brand=${encodeURIComponent(b.id)}`, { scroll: false });
  };
  useEffect(() => {
    if (brand && stored?.id !== brand.id) setStored(brand);
  }, [brand, stored?.id, setStored]);

  // "Redraw" links open straight into drawing; drop the flag from the URL.
  useEffect(() => {
    if (search?.get("draw") !== "1") return;
    router.replace(brand ? `${pathname}?brand=${encodeURIComponent(brand.id)}` : pathname, { scroll: false });
  }, [search, router, pathname, brand]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const pins = api.maps.pin.getCreatorPins.useQuery({ creator_id: brand?.id ?? "", showExpired }, { enabled: Boolean(brand), refetchOnWindowFocus: false });
  const hotspots = api.maps.pin.getCreatorHotspots.useQuery({ creatorId: brand?.id ?? "" }, { enabled: Boolean(brand), refetchOnWindowFocus: false });

  useEffect(() => {
    setAdminPins(pins.data ?? []);
  }, [pins.data, setAdminPins]);
  useEffect(() => clearAdminPins, [clearAdminPins]);

  const refreshInView = useCallback(() => {
    const b = map.current?.getBounds();
    if (b) filterNearbyPins({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }, "admin");
  }, [filterNearbyPins]);
  useEffect(refreshInView, [adminPins, refreshInView]);

  // Frame the brand's pins + hotspots once per brand, as soon as both the map and the data are ready.
  const framed = useRef<string | null>(null);
  useEffect(() => {
    if (!mapReady || !brand || framed.current === brand.id || !pins.data || !hotspots.data || !map.current) return;
    framed.current = brand.id;
    const points = [
      ...pins.data.map((p) => [p.longitude, p.latitude] as const),
      ...hotspots.data.flatMap(
        (h) => toMapboxFeature(h.geoJson as Parameters<typeof toMapboxFeature>[0])?.geometry.coordinates[0]?.map(([lng, lat]) => [lng!, lat!] as const) ?? [],
      ),
    ];
    if (!points.length) return;
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    map.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 90, bottom: 60, left: 60, right: 360 }, maxZoom: 15, duration: 700 },
    );
  }, [mapReady, brand, pins.data, hotspots.data]);

  const flyTo = (c: { lat: number; lng: number }, zoom = 15) => map.current?.flyTo({ center: [c.lng, c.lat], zoom, duration: 700 });
  const brandQuery = brand ? `creatorId=${encodeURIComponent(brand.id)}` : "";

  const onMapClick = (lat: number, lng: number) => {
    if (drawing) return;
    if (isPinCopied || isPinCut) {
      setPosition({ lat, lng });
      openCopyCut(true);
      return;
    }
    router.push(`/admin/pins/new?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}${brandQuery && `&${brandQuery}`}`);
  };

  const onDrawn = useCallback(
    (feature: StoredFeature, shape: DrawShape) => {
      setDraft(feature, shape);
      setDrawing(false);
      router.push(`/admin/pins/hotspots/new${brandQuery && `?${brandQuery}`}`);
    },
    [router, brandQuery, setDraft],
  );

  const loading = Boolean(brand) && (pins.isPending || hotspots.isPending);
  const nothing = Boolean(brand) && !loading && !pins.data?.length && !hotspots.data?.length;

  return (
    <div className="relative h-[calc(100dvh-3.5rem-4rem-var(--safe-bottom))] w-full overflow-hidden lg:h-dvh">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        initialViewState={WORLD_VIEW}
        onLoad={() => {
          setMapReady(true);
          refreshInView();
        }}
        onMoveEnd={refreshInView}
        onClick={(e) => {
          const m = map.current;
          if (!drawing && m?.getLayer("hotspot-fill") && m.queryRenderedFeatures(e.point, { layers: ["hotspot-fill"] }).length) return;
          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }}
        cursor={drawing ? "crosshair" : isPinCopied || isPinCut ? "copy" : "pointer"}
      >
        {hotspots.data && <HotspotLayer hotspots={hotspots.data} onSelect={drawing ? undefined : setHotspotId} />}
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
        {!drawing && <AgentMapLayer />}
        {drawing && <DrawTool initialShape={drawShape} onDone={onDrawn} onCancel={() => setDrawing(false)} />}
      </BaseMap>

      {/* Toolbar — same order as the brand's Map: context, search, filter … actions. */}
      {!drawing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
          <BrandPicker className="pointer-events-auto w-56 sm:w-64" brands={brands.data} value={brand} onChange={pickBrand} loading={brands.isPending} />
          <PlaceSearch className="pointer-events-auto w-full sm:w-72" onSelect={(p) => flyTo(p, 14)} />
          <label className="pointer-events-auto flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-card/95 px-3 text-xs font-medium shadow-sm backdrop-blur-sm">
            <Switch checked={showExpired} onCheckedChange={setShowExpired} aria-label="Show expired pins" />
            Show expired
          </label>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            <Button variant="outline" className="bg-card/95 shadow-sm backdrop-blur-sm" onClick={() => setDrawing(true)} disabled={!brand}>
              <Hexagon /> <span className="hidden sm:inline">Draw hotspot</span>
            </Button>
            <Button className="shadow-sm" onClick={() => router.push(`/admin/pins/new${brandQuery && `?${brandQuery}`}`)} disabled={!brand}>
              <Plus /> <span className="hidden sm:inline">New pin</span>
            </Button>
          </div>
        </div>
      )}

      {/* Status line under the toolbar: loading, nothing yet, or paste mode. */}
      {!drawing && (loading || nothing || isPinCopied || isPinCut) && (
        <div className="pointer-events-none absolute top-[7.5rem] left-1/2 z-10 -translate-x-1/2 sm:top-16">
          {isPinCopied || isPinCut ? (
            <span className="rounded-full bg-primary px-4 py-1.5 font-hud text-xs font-semibold text-primary-foreground shadow-lg">Click the map to {isPinCut ? "move" : "paste"} the pin</span>
          ) : loading ? (
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/95 px-3.5 py-1.5 text-xs shadow-md backdrop-blur-sm">
              <Loader2 className="size-3.5 animate-spin text-primary" /> Loading {brand?.name}&rsquo;s pins…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/95 px-3.5 py-1.5 text-xs shadow-md backdrop-blur-sm">
              <MapPinOff className="size-3.5 text-muted-foreground" />
              {brand?.name} has no {showExpired ? "expired" : "live"} pins — click the map to drop one.
            </span>
          )}
        </div>
      )}

      {!drawing && <NearbyLocationsPanel className="absolute top-20 right-4 z-10" onSelectPlace={(c) => flyTo(c)} />}
      {!drawing && <PinLegend className="absolute bottom-8 left-14 z-10 hidden sm:block" />}

      <PinDetailAndActionsModal />
      <CopyCutPinModal />
      <HotspotDetailModal isOpen={Boolean(hotspotId)} setIsOpen={(o: boolean) => !o && setHotspotId(null)} hotspotId={hotspotId} />
      {brand && <AgentChat key={brand.id} creatorId={brand.id} />}
    </div>
  );
}
