"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check as CheckIcon,
  ChevronDown,
  ChevronUp,
  Coins,
  ExternalLink,
  GitMerge,
  ImageIcon,
  Pencil,
  RotateCcw,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Marker } from "react-map-gl/mapbox";

import { BaseMap } from "~/components/map-kit/base-map";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/shadcn/ui/sheet";
import { cn } from "~/lib/utils";
import { ErrorState } from "~/ui/error-state";
import { Person } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { api } from "~/utils/api";

import { mapsLink, plural, REJECT_LABEL, type MuralDetail } from "./model";

export type MuralActions = {
  approve: (id: string) => void;
  reject: (id: string) => void;
  moveBack: (id: string) => void;
};

/**
 * Mural review's side drawer. Everything an admin needs to decide: every
 * scan's three keyframes (any can become the public cover), where each scan
 * happened, the first finders and their flags, possible duplicates nearby
 * with a one-click merge, and the decision bar.
 */
export function MuralPreviewSheet({
  id,
  onClose,
  busy,
  actions,
  position,
  onStep,
}: {
  id: string | null;
  onClose: () => void;
  busy: boolean;
  actions: MuralActions;
  position: { index: number; total: number } | null;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Keyed so edit state never carries over to the next mural. */}
        {id && <Body key={id} id={id} busy={busy} actions={actions} position={position} onStep={onStep} />}
      </SheetContent>
    </Sheet>
  );
}

function statusPill(m: Pick<MuralDetail, "status" | "rejectReason">) {
  switch (m.status) {
    case "DISCOVERED":
      return <StatusPill tone="info">Gathering finders</StatusPill>;
    case "PENDING":
      return <StatusPill tone="warning">Waiting for review</StatusPill>;
    case "APPROVED":
      return <StatusPill tone="success" dot>Approved · on maps</StatusPill>;
    case "REJECTED":
      return <StatusPill tone="danger">Rejected · {m.rejectReason ? REJECT_LABEL[m.rejectReason] : ""}</StatusPill>;
  }
}

function Body({
  id,
  busy,
  actions,
  position,
  onStep,
}: {
  id: string;
  busy: boolean;
  actions: MuralActions;
  position: { index: number; total: number } | null;
  onStep: (dir: 1 | -1) => void;
}) {
  const utils = api.useUtils();
  const q = api.admin.murals.byId.useQuery({ id }, { refetchOnWindowFocus: false });
  const m = q.data;

  const refresh = () => {
    void utils.admin.murals.byId.invalidate({ id });
    void utils.admin.murals.list.invalidate();
    void utils.admin.murals.counts.invalidate();
  };
  const edit = api.admin.murals.edit.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const merge = api.admin.murals.merge.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Merged — scans and coins moved to this mural");
    },
    onError: (e) => toast.error(e.message),
  });

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const startEditing = () => {
    if (!m) return;
    setTitle(m.title ?? "");
    setArtist(m.artist ?? "");
    setEditing(true);
  };

  const saveNames = () =>
    edit.mutate(
      { id, title, artist },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Saved");
        },
      },
    );

  return (
    <>
      <div className="flex items-center gap-1 border-b py-2 pr-12 pl-4">
        <span className="text-xs text-muted-foreground tabular-nums">{position ? `${position.index + 1} of ${position.total}` : "Mural"}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onStep(-1)} disabled={!position || position.index === 0} aria-label="Previous mural">
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onStep(1)} disabled={!position || position.index >= position.total - 1} aria-label="Next mural">
            <ChevronDown />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isPending ? (
          <BodySkeleton />
        ) : q.isError ? (
          <div className="p-4">
            <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          </div>
        ) : m ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.coverUrl} alt="" className="aspect-[4/3] w-full bg-muted object-cover" />

            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {statusPill(m)}
                  {m.mergedIntoId && <StatusPill tone="neutral">Merged away</StatusPill>}
                </div>

                {editing ? (
                  <div className="mt-3 space-y-2">
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={m.autoTitle} maxLength={80} aria-label="Title" />
                    <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist (optional)" maxLength={80} aria-label="Artist" />
                    <p className="text-xs text-muted-foreground">Leave the title empty to go back to “{m.autoTitle}”.</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveNames} disabled={edit.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <SheetTitle className="mt-2 flex items-start gap-2 font-hud text-xl">
                      <span className="min-w-0">{m.title ?? m.autoTitle}</span>
                      <Button variant="ghost" size="icon-sm" className="-mt-0.5" onClick={startEditing} aria-label="Edit name">
                        <Pencil />
                      </Button>
                    </SheetTitle>
                    <SheetDescription asChild>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {m.artist ? `by ${m.artist}` : m.title ? "Artist unknown" : "Not named yet — this is the auto title."}
                      </div>
                    </SheetDescription>
                  </>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
                <Item label="Finders">{plural(m.distinctScanners, "person", "people")}</Item>
                <Item label="Scans">{m.scanCount.toLocaleString()}</Item>
                <Item label="Coins paid">
                  <span className="inline-flex items-center gap-1">
                    <Coins className="size-3.5 text-muted-foreground" />
                    {m.coinsPaid.toLocaleString()}
                  </span>
                </Item>
                <Item label="Discovered">{formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</Item>
                <Item label="By">{m.discoverer.name ?? "Someone"}</Item>
                <Item label="Where">
                  <a href={mapsLink(m.latitude, m.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Open map <ExternalLink className="size-3" />
                  </a>
                </Item>
              </dl>

              <div className="h-56 overflow-hidden rounded-xl border">
                <BaseMap key={m.id} initialViewState={{ latitude: m.latitude, longitude: m.longitude, zoom: 17 }}>
                  <Marker latitude={m.latitude} longitude={m.longitude} anchor="center">
                    <span className="flex size-7 items-center justify-center rounded-md border-2 border-white bg-primary text-primary-foreground shadow-md">
                      <ImageIcon className="size-3.5" />
                    </span>
                  </Marker>
                  {m.scans.map((s) => (
                    <Marker key={s.id} latitude={s.latitude} longitude={s.longitude} anchor="center">
                      <span title={`${s.user.name ?? "Scan"} · ±${Math.round(s.accuracyM)} m`} className="block size-2.5 rounded-full border border-white bg-foreground/70" />
                    </Marker>
                  ))}
                </BaseMap>
              </div>

              {m.duplicates.length > 0 && (
                <div>
                  <h3 className="label-caps mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 text-warning" /> Possible duplicates within 50 m
                  </h3>
                  <ul className="space-y-2">
                    {m.duplicates.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 rounded-xl border p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.coverUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{d.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {d.distanceM} m away · {plural(d.scanCount, "scan")} · {d.status.toLowerCase()}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={merge.isPending}
                          onClick={() => merge.mutate({ fromId: d.id, intoId: m.id })}
                          title="Move that record's scans and coins into this one"
                        >
                          <GitMerge /> Merge into this
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="label-caps mb-2">Scans · tap a photo to make it the public cover</h3>
                <ul className="space-y-3">
                  {m.scans.map((s) => (
                    <li key={s.id} className={cn("rounded-xl border p-3", s.borderline && "border-warning/60")}>
                      <div className="flex items-center gap-2">
                        <Person
                          name={s.user.name}
                          image={s.user.image}
                          size="sm"
                          sub={`${formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })} · ±${Math.round(s.accuracyM)} m`}
                        />
                        <div className="ml-auto flex flex-wrap justify-end gap-1">
                          {s.discoveryRank && (
                            <StatusPill tone="primary" icon={Sparkles}>
                              #{s.discoveryRank}
                            </StatusPill>
                          )}
                          {s.newAccount && <StatusPill tone="warning">New account</StatusPill>}
                          {s.borderline && <StatusPill tone="warning">Check photos</StatusPill>}
                          <StatusPill tone="neutral" icon={Smartphone}>
                            {s.platform}
                          </StatusPill>
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        {s.keyframes.map((url, i) => {
                          const isCover = url === m.coverUrl;
                          return (
                            <button
                              key={url}
                              type="button"
                              disabled={isCover || edit.isPending}
                              onClick={() => edit.mutate({ id: m.id, title: m.title, artist: m.artist, coverUrl: url }, { onSuccess: () => toast.success("Cover updated") })}
                              className={cn(
                                "group relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted",
                                isCover ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary/50",
                              )}
                              aria-label={isCover ? "Current cover" : `Use ${["left", "centre", "right"][i]} photo as cover`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                              {isCover && (
                                <span className="absolute right-1 bottom-1 rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">Cover</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {s.vision.labels && s.vision.labels.length > 0 && (
                        <p className="mt-2 truncate text-xs text-muted-foreground" title={s.vision.labels.map((l) => l.description).join(", ")}>
                          Vision: {s.vision.labels.slice(0, 5).map((l) => `${l.description} ${Math.round(l.score * 100)}%`).join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {m && !m.mergedIntoId && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3">
          <div className="ml-auto flex gap-2">
            {m.status === "PENDING" || m.status === "DISCOVERED" ? (
              <>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => actions.reject(m.id)}>
                  <X /> Reject
                </Button>
                <Button size="sm" disabled={busy} onClick={() => actions.approve(m.id)}>
                  <CheckIcon /> Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => actions.moveBack(m.id)}>
                <RotateCcw /> Move back to review
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}

function BodySkeleton() {
  return (
    <>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </>
  );
}
