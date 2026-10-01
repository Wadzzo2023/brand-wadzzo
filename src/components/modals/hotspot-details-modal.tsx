"use client";

import { CalendarClock, Hexagon, Loader2, MapPin, Pause, Pencil, Play, Repeat, Timer, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Layer, Source, type MapRef } from "react-map-gl/mapbox";

import { BaseMap } from "~/components/map-kit/base-map";
import { featureCenter, toMapboxFeature, type StoredFeature } from "~/components/map-kit/geo";
import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { cn } from "~/lib/utils";
import { ErrorState } from "~/ui/error-state";
import { api } from "~/utils/api";

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  hotspotId: string | null;
};

const fmt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const every = (days: number) => (days === 1 ? "Every day" : days === 7 ? "Every week" : `Every ${days} days`);

/** A hotspot at a glance: its area, schedule, how it's doing, and pause / resume / delete. */
export default function HotspotDetailModal({ isOpen, setIsOpen, hotspotId }: Props) {
  const utils = api.useUtils();
  const hotspot = api.maps.pin.getHotspot.useQuery({ hotspotId: hotspotId ?? "" }, { enabled: !!hotspotId && isOpen });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());

  const close = (open: boolean) => {
    if (!open) setConfirmDelete(false);
    setIsOpen(open);
  };
  const refresh = () => {
    void utils.maps.pin.getHotspot.invalidate({ hotspotId: hotspotId ?? "" });
    void utils.maps.pin.myHotspots.invalidate();
  };
  const pause = api.maps.pin.pauseHotspotSchedule.useMutation({
    onSuccess: () => {
      toast.success("Hotspot paused — no new drops until you resume");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const resume = api.maps.pin.resumeHotspotSchedule.useMutation({
    onSuccess: () => {
      toast.success("Hotspot resumed");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.maps.pin.deleteHotspotCascade.useMutation({
    onSuccess: () => {
      toast.success("Hotspot deleted");
      void utils.maps.pin.myHotspots.invalidate();
      void utils.maps.pin.getMyPins.invalidate();
      close(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const h = hotspot.data;
  const stats = useMemo(() => {
    const groups = h?.locationGroups ?? [];
    const collected = groups.reduce((n, g) => n + g.locations.reduce((m, l) => m + l.consumers.length, 0), 0);
    const live = groups.filter((g) => new Date(g.startDate).getTime() <= now && new Date(g.endDate).getTime() >= now).length;
    return { drops: groups.length, live, collected };
  }, [h, now]);
  const title = h?.locationGroups?.[0]?.title ?? "Hotspot";
  const busy = pause.isPending || resume.isPending;
  const ended = h ? new Date(h.hotspotEndDate).getTime() < now : false;

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        {hotspot.isLoading ? (
          <div className="flex h-72 items-center justify-center">
            <DialogTitle className="sr-only">Loading hotspot</DialogTitle>
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : !h ? (
          <div className="p-6">
            <DialogTitle className="sr-only">Hotspot</DialogTitle>
            <ErrorState message={hotspot.error?.message ?? "This hotspot couldn't be loaded."} onRetry={() => void hotspot.refetch()} />
          </div>
        ) : (
          <>
            {h.geoJson && <AreaMap feature={h.geoJson as unknown as StoredFeature} />}
            <div className="space-y-5 p-5">
              <DialogHeader className="space-y-1 text-left">
                <div className="flex items-start justify-between gap-3 pr-6">
                  <DialogTitle className="font-hud text-lg leading-snug">{title}</DialogTitle>
                  <StatusBadge active={h.isActive} ended={ended} />
                </div>
                <DialogDescription className="flex items-center gap-1.5">
                  <Hexagon className="size-3.5" />
                  <span className="capitalize">{h.shape.toLowerCase()}</span> hotspot · {h.autoCollect ? "auto collect" : "manual collect"}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 divide-x rounded-lg border text-center">
                <Stat icon={MapPin} label="Drops" value={stats.drops} />
                <Stat icon={CalendarClock} label="Live now" value={stats.live} />
                <Stat icon={Users} label="Collected" value={stats.collected} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Row label="Starts" value={fmt(h.hotspotStartDate)} />
                <Row label="Ends" value={fmt(h.hotspotEndDate)} />
                <Row icon={Repeat} label="New pin" value={every(h.dropEveryDays)} />
                <Row icon={Timer} label="Each pin lasts" value={h.pinDurationDays === 1 ? "1 day" : `${h.pinDurationDays} days`} />
                <Row
                  label="Next drop"
                  value={ended ? "Finished" : !h.isActive ? "Paused" : h.nextRunTime ? fmt(h.nextRunTime) : "Not scheduled yet"}
                  className="col-span-2"
                />
              </dl>

              {confirmDelete ? (
                <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm">
                    Delete this hotspot? Its schedule stops and all {stats.drops} drop{stats.drops === 1 ? "" : "s"} are hidden from fans. This can&apos;t be undone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
                      Keep it
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => hotspotId && remove.mutate({ hotspotId })} disabled={remove.isPending}>
                      {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete hotspot
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/pins/hotspots/${hotspotId}/edit`} onClick={() => close(false)}>
                      <Pencil className="size-3.5" /> Edit
                    </Link>
                  </Button>
                  {h.isActive ? (
                    <Button variant="outline" size="sm" className="flex-1" disabled={busy || ended} onClick={() => hotspotId && pause.mutate({ hotspotId })}>
                      {pause.isPending ? <Loader2 className="animate-spin" /> : <Pause />} Pause drops
                    </Button>
                  ) : (
                    <Button size="sm" className="flex-1" disabled={busy || ended} onClick={() => hotspotId && resume.mutate({ hotspotId })}>
                      {resume.isPending ? <Loader2 className="animate-spin" /> : <Play />} Resume drops
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ active, ended }: { active: boolean; ended: boolean }) {
  const [label, tone] = ended
    ? ["Ended", "bg-muted text-muted-foreground"]
    : active
      ? ["Active", "bg-primary/10 text-primary"]
      : ["Paused", "bg-warning/10 text-warning"];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-hud text-[11px] font-semibold uppercase tracking-wide", tone)}>
      <span className={cn("size-1.5 rounded-full bg-current", active && !ended && "animate-pulse")} />
      {label}
    </span>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: number }) {
  return (
    <div className="px-2 py-3">
      <p className="font-hud text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" /> {label}
      </p>
    </div>
  );
}

function Row({ label, value, icon: Icon, className }: { label: string; value: string; icon?: typeof MapPin; className?: string }) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

/** The hotspot's area on a small static map. */
function AreaMap({ feature }: { feature: StoredFeature }) {
  const map = useRef<MapRef>(null);
  const shape = useMemo(() => toMapboxFeature(feature), [feature]);
  if (!shape) return null;
  const c = featureCenter(feature);
  const ring = shape.geometry.coordinates[0]!;
  const fit = () => {
    // The dialog animates in: measure the real size before framing.
    map.current?.resize();
    const lngs = ring.map((p) => p[0]!);
    const lats = ring.map((p) => p[1]!);
    map.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 28, duration: 0, maxZoom: 17 },
    );
  };
  return (
    <div className="h-40 overflow-hidden rounded-t-xl border-b">
      <BaseMap ref={map} initialViewState={{ latitude: c.lat, longitude: c.lng, zoom: 14 }} onLoad={() => requestAnimationFrame(() => setTimeout(fit, 220))} interactive={false} controls={false}>
        <Source id="hotspot-detail" type="geojson" data={shape}>
          <Layer id="hotspot-detail-fill" type="fill" paint={{ "fill-color": "#22c55e", "fill-opacity": 0.2 }} />
          <Layer id="hotspot-detail-line" type="line" paint={{ "line-color": "#16a34a", "line-width": 2 }} />
        </Source>
      </BaseMap>
    </div>
  );
}
