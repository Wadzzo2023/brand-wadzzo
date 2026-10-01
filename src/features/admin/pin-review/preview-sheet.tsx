"use client";

import { format, formatDistanceToNow } from "date-fns";
import { Check as CheckIcon, ChevronDown, ChevronUp, Link2, MapPin, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Marker } from "react-map-gl/mapbox";

import { BaseMap } from "~/components/map-kit/base-map";
import { Button } from "~/components/shadcn/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "~/components/shadcn/ui/sheet";
import { ErrorState } from "~/ui/error-state";
import { Person } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { api } from "~/utils/api";

import { Locations } from "./locations";
import { TYPE_LABEL, plural, type View } from "./model";

const PRIVACY: Record<string, string> = {
  PUBLIC: "Everyone",
  PRIVATE: "Followers only",
  TIER: "Members of a tier",
  FOR_SALE: "For sale",
  NOT_FOR_SALE: "Not for sale",
  DRAFT: "Draft",
};

export type PreviewActions = {
  approve: (id: string) => void;
  reject: (id: string) => void;
  unapprove: (id: string) => void;
  remove: (id: string, title: string) => void;
};

/** Pin review's side drawer: everything about one pin, and the decision buttons. */
export function PreviewSheet({
  id,
  onClose,
  view,
  busy,
  actions,
  position,
  onStep,
}: {
  id: string | null;
  onClose: () => void;
  view: View;
  busy: boolean;
  actions: PreviewActions;
  position: { index: number; total: number } | null;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        {id && <Body id={id} view={view} busy={busy} actions={actions} position={position} onStep={onStep} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  id,
  view,
  busy,
  actions,
  position,
  onStep,
}: {
  id: string;
  view: View;
  busy: boolean;
  actions: PreviewActions;
  position: { index: number; total: number } | null;
  onStep: (dir: 1 | -1) => void;
}) {
  const q = api.maps.pin.getReviewGroup.useQuery(id, { refetchOnWindowFocus: false });
  const g = q.data;

  return (
    <>
      {/* Header: where we are in the list + stepping, clear of the sheet's close button. */}
      <div className="flex items-center gap-1 border-b py-2 pr-12 pl-4">
        <span className="text-xs text-muted-foreground tabular-nums">{position ? `${position.index + 1} of ${position.total}` : "Pin"}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onStep(-1)} disabled={!position || position.index === 0} aria-label="Previous pin" title="Previous (K)">
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onStep(1)} disabled={!position || position.index >= position.total - 1} aria-label="Next pin" title="Next (J)">
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
        ) : g ? (
          <>
            {g.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.image} alt="" className="aspect-[16/9] w-full bg-muted object-cover" />
            ) : (
              <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted text-muted-foreground">
                <MapPin className="size-8" />
              </div>
            )}

            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {g.approved === null ? (
                    <StatusPill tone="warning">In review</StatusPill>
                  ) : g.approved ? (
                    <StatusPill tone="success">Approved</StatusPill>
                  ) : (
                    <StatusPill tone="danger">Rejected</StatusPill>
                  )}
                  <StatusPill tone="neutral">{TYPE_LABEL[g.type] ?? g.type}</StatusPill>
                  {g.locationGroupTags.map((t) => (
                    <StatusPill key={t.tag.label} tone="neutral">
                      #{t.tag.label}
                    </StatusPill>
                  ))}
                </div>
                <SheetTitle className="mt-2 font-hud text-xl">{g.title}</SheetTitle>
                <SheetDescription asChild>
                  <div className="mt-2">
                    <Link href={`/admin/creators/${g.creator.id}`} className="inline-block rounded-md hover:opacity-80">
                      <Person name={g.creator.name} image={g.creator.profileUrl} size="sm" sub={`Submitted ${formatDistanceToNow(new Date(g.createdAt), { addSuffix: true })}`} />
                    </Link>
                  </div>
                </SheetDescription>
              </div>

              {g.description && <p className="text-sm whitespace-pre-line">{g.description}</p>}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 text-sm">
                <Item label="Starts">{format(new Date(g.startDate), "MMM d, yyyy · p")}</Item>
                <Item label="Ends">{format(new Date(g.endDate), "MMM d, yyyy · p")}</Item>
                <Item label="Collection limit">{g.limit > 0 ? `${g.remaining.toLocaleString()} of ${g.limit.toLocaleString()} left` : "No limit"}</Item>
                <Item label="Who can collect">{PRIVACY[g.privacy] ?? g.privacy}</Item>
                <Item label="Locations">{plural(g.locations.length, "location")}</Item>
                <Item label="Collected">{g.locations.reduce((n, l) => n + l._count.consumers, 0).toLocaleString()}</Item>
                {g.asset && (
                  <Item label="Reward" wide>
                    <span className="inline-flex items-center gap-2">
                      {g.asset.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.asset.thumbnail} alt="" className="size-5 rounded object-cover" />
                      )}
                      {g.asset.name} <span className="font-mono text-xs text-muted-foreground">{g.asset.code}</span>
                    </span>
                  </Item>
                )}
                {g.link && (
                  <Item label="Link" wide>
                    <a href={g.link} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline">
                      <Link2 className="size-3.5 shrink-0" /> <span className="truncate">{g.link}</span>
                    </a>
                  </Item>
                )}
              </dl>

              {g.locations.length > 0 && (
                <div className="h-64 overflow-hidden rounded-xl border">
                  <BaseMap
                    key={g.id}
                    initialViewState={
                      g.locations.length === 1
                        ? { latitude: g.locations[0]!.latitude, longitude: g.locations[0]!.longitude, zoom: 15 }
                        : {
                            bounds: [
                              Math.min(...g.locations.map((l) => l.longitude)),
                              Math.min(...g.locations.map((l) => l.latitude)),
                              Math.max(...g.locations.map((l) => l.longitude)),
                              Math.max(...g.locations.map((l) => l.latitude)),
                            ],
                            fitBoundsOptions: { padding: 48, maxZoom: 16 },
                          }
                    }
                  >
                    {g.locations.map((l, i) => (
                      <Marker key={l.id} latitude={l.latitude} longitude={l.longitude} anchor="center">
                        <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-primary text-[10px] font-semibold text-primary-foreground shadow-md tabular-nums">
                          {i + 1}
                        </span>
                      </Marker>
                    ))}
                  </BaseMap>
                </div>
              )}

              <div>
                <h3 className="label-caps mb-2">Locations</h3>
                <Locations groupId={g.id} title={g.title} variant="plain" />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Decision bar: secondary actions left, the decision right — same order as the list rows. */}
      {g && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/pins/${g.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => actions.remove(g.id, g.title)}>
            <Trash2 /> Delete
          </Button>
          <div className="ml-auto flex gap-2">
            {view === "pending" ? (
              <>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => actions.reject(g.id)}>
                  <X /> Reject <Kbd>R</Kbd>
                </Button>
                <Button size="sm" disabled={busy} onClick={() => actions.approve(g.id)}>
                  <CheckIcon /> Approve <Kbd inverted>A</Kbd>
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => actions.unapprove(g.id)}>
                <RotateCcw /> Move back to review
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}

export function Kbd({ children, inverted }: { children: ReactNode; inverted?: boolean }) {
  return (
    <kbd
      className={
        inverted
          ? "ml-0.5 hidden rounded border border-primary-foreground/30 px-1 font-mono text-[10px] leading-4 opacity-80 sm:inline"
          : "ml-0.5 hidden rounded border px-1 font-mono text-[10px] leading-4 text-muted-foreground sm:inline"
      }
    >
      {children}
    </kbd>
  );
}

function BodySkeleton() {
  return (
    <>
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="space-y-4 p-5">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </>
  );
}

