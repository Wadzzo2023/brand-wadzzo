"use client";

import { Copy, Pencil, Trash2, Zap } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { PinQRButton } from "~/components/pins/qr";
import { Button } from "~/components/shadcn/ui/button";
import { env } from "~/env";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { Check } from "~/ui/data-table";
import { ErrorState } from "~/ui/error-state";
import { Skeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { api, type RouterOutputs } from "~/utils/api";

import { plural } from "./model";

export type Loc = RouterOutputs["maps"]["pin"]["getReviewLocations"][number];
const coords = (l: Loc) => `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`;
/** Mapbox static images take up to ~100 markers in a URL; labels go 1–99. */
const MAP_MARKERS = 99;

/**
 * A pin's locations, each editable or deletable (one by one or ticked).
 * "inline" sits under a row with a numbered static map; "plain" is just the
 * list, for the preview drawer (which has its own map).
 */
export function Locations({ groupId, title, variant = "inline" }: { groupId: string; title: string; variant?: "inline" | "plain" }) {
  const inline = variant === "inline";
  const locs = api.maps.pin.getReviewLocations.useQuery(groupId, { refetchOnWindowFocus: false });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; title: string; description: string } | null>(null);

  const utils = api.useUtils();
  const removeOne = api.maps.pin.deleteLocation.useMutation();
  const removeMany = api.maps.pin.bulkDeleteLocations.useMutation();
  const busy = removeOne.isPending || removeMany.isPending;

  const rows = locs.data ?? [];
  const ids = rows.map((l) => l.id);
  const pickedIds = ids.filter((id) => picked.has(id));
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const run = async () => {
    if (!confirm) return;
    const { ids: del } = confirm;
    try {
      if (del.length === 1) await removeOne.mutateAsync({ locationId: del[0]!, locationGroupId: groupId });
      else await removeMany.mutateAsync({ locationIds: del, locationGroupId: groupId });
      toast.success(del.length === 1 ? "Location deleted" : `${del.length} locations deleted`);
      setConfirm(null);
      setPicked((s) => new Set([...s].filter((id) => !del.includes(id))));
      void utils.maps.pin.getReviewLocations.invalidate(groupId);
      void utils.maps.pin.getReviewGroup.invalidate(groupId);
      void utils.maps.pin.getAdminLocationGroups.invalidate();
      void utils.maps.pin.getApprovedLocationGroups.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  const askDelete = (del: Loc[]) =>
    setConfirm({
      ids: del.map((l) => l.id),
      title: del.length === 1 ? "Delete this location?" : `Delete ${plural(del.length, "location")}?`,
      description:
        (del.length === 1 ? `The location at ${coords(del[0]!)} comes off the map` : "They come off the map") +
        ` — “${title}” keeps its other locations.` +
        (del.length === ids.length ? " This removes every location; consider deleting the pin instead." : ""),
    });

  return (
    <div className={cn(inline && "border-t bg-muted/30 px-3 py-3 sm:px-4 sm:pl-[4.25rem]")}>
      {locs.isPending ? (
        <div className={cn("grid gap-3", inline && "lg:grid-cols-[minmax(0,360px)_1fr]")}>
          {inline && <Skeleton className="aspect-[8/5] rounded-lg" />}
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      ) : locs.isError ? (
        <ErrorState message={locs.error.message} onRetry={() => void locs.refetch()} />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">This pin has no locations left.</p>
      ) : (
        <div className={cn("grid gap-3", inline && "lg:grid-cols-[minmax(0,360px)_1fr]")}>
          {inline && <StaticMap locs={rows} />}
          <div className="min-w-0">
            <div className="mb-2 flex min-h-8 items-center gap-2 px-1">
              <Check
                checked={pickedIds.length === ids.length}
                indeterminate={pickedIds.length > 0 && pickedIds.length < ids.length}
                onChange={(on) => setPicked(on ? new Set(ids) : new Set())}
                label="Select all locations"
              />
              <span className="text-xs text-muted-foreground">{pickedIds.length ? `${pickedIds.length} of ${plural(ids.length, "location")} selected` : plural(ids.length, "location")}</span>
              {pickedIds.length > 0 && (
                <Button size="sm" variant="outline" className="ml-auto h-7 text-destructive hover:text-destructive" disabled={busy} onClick={() => askDelete(rows.filter((l) => picked.has(l.id)))}>
                  <Trash2 /> Delete {pickedIds.length}
                </Button>
              )}
            </div>
            <ol className={cn("space-y-1", inline && "max-h-80 overflow-y-auto pr-1")}>
              {rows.map((l, i) => (
                <li key={l.id} className={cn("flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5", picked.has(l.id) && "border-primary/50")}>
                  <Check checked={picked.has(l.id)} onChange={(on) => toggle(l.id, on)} label={`Select location ${i + 1}`} />
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">{i + 1}</span>
                  <button
                    type="button"
                    title="Copy coordinates"
                    onClick={() => void navigator.clipboard.writeText(coords(l)).then(() => toast.success("Coordinates copied"))}
                    className="group/c inline-flex min-w-0 items-center gap-1 truncate font-mono text-xs hover:text-foreground"
                  >
                    <span className="truncate">{coords(l)}</span>
                    <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/c:opacity-60" />
                  </button>
                  {l.autoCollect && (
                    <StatusPill tone="primary" icon={Zap} className="hidden shrink-0 sm:inline-flex">
                      Auto-collect
                    </StatusPill>
                  )}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{l._count.consumers.toLocaleString()} collected</span>
                  <PinQRButton
                    target={{
                      locationId: l.id,
                      locationGroupId: groupId,
                      title,
                      pinCount: ids.length,
                    }}
                  />
                  <Button variant="ghost" size="icon-sm" asChild>
                    <Link href={`/pins/${l.id}/edit`} aria-label={`Edit location ${i + 1}`} title="Edit location">
                      <Pencil />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} aria-label={`Delete location ${i + 1}`} title="Delete location" onClick={() => askDelete([l])}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && !busy && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void run()}
      />
    </div>
  );
}

const MAP_W = 640;
const MAP_H = 400;
const MAP_PAD = 56;
/** Street level is close enough — locations a few metres apart shouldn't zoom to the max. */
const MAX_ZOOM = 16;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const unMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

/** Center and zoom that fit every location inside the image, with padding. */
function fitView(locs: Loc[]) {
  const lngs = locs.map((l) => l.longitude);
  const ys = locs.map((l) => mercY(l.latitude));
  const [minX, maxX, minY, maxY] = [Math.min(...lngs), Math.max(...lngs), Math.min(...ys), Math.max(...ys)];
  const zx = Math.log2(((MAP_W - 2 * MAP_PAD) / 256) * (360 / Math.max(maxX - minX, 1e-9)));
  const zy = Math.log2(((MAP_H - 2 * MAP_PAD) / 256) * ((2 * Math.PI) / Math.max(maxY - minY, 1e-12)));
  const zoom = Math.max(1, Math.min(MAX_ZOOM, zx, zy));
  return { lng: (minX + maxX) / 2, lat: unMercY((minY + maxY) / 2), zoom: Math.floor(zoom * 100) / 100 };
}

/** A Mapbox static image with the locations numbered like the list next to it. */
function StaticMap({ locs }: { locs: Loc[] }) {
  const { resolvedTheme } = useTheme();
  const style = resolvedTheme === "dark" ? "dark-v11" : "light-v11";
  const shown = locs.slice(0, MAP_MARKERS);
  const markers = shown.map((l, i) => `pin-s-${i + 1}+16a34a(${l.longitude.toFixed(6)},${l.latitude.toFixed(6)})`).join(",");
  const v = fitView(shown);
  const src = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${markers}/${v.lng.toFixed(6)},${v.lat.toFixed(6)},${v.zoom}/${MAP_W}x${MAP_H}@2x?logo=false&attribution=false&access_token=${env.NEXT_PUBLIC_MAPBOX_API}`;
  return (
    <div className="relative self-center overflow-hidden rounded-lg border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`Map of ${plural(locs.length, "location")}`} loading="lazy" width={MAP_W} height={MAP_H} className="block aspect-[8/5] h-auto w-full" />
      {locs.length > MAP_MARKERS && <span className="absolute bottom-1.5 left-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">First {MAP_MARKERS} shown</span>}
      <span className="absolute right-1.5 bottom-1 text-[9px] text-muted-foreground/80">© Mapbox © OpenStreetMap</span>
    </div>
  );
}

