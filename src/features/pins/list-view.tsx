"use client";

import { format } from "date-fns";
import { Calendar, ChevronDown, Landmark, Map as MapIcon, MapPin, MoreHorizontal, Pause, Pencil, Play, Plus, Radar, Search, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/shadcn/ui/dropdown-menu";
import { Input } from "~/components/shadcn/ui/input";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { api, type RouterOutputs } from "~/utils/api";

type Kind = "general" | "landmark" | "event" | "hotspot";
type Group = RouterOutputs["maps"]["pin"]["getLocationGroups"]["groups"][number];
type Hotspot = RouterOutputs["maps"]["pin"]["getHotspots"]["hotspots"][number];
type Confirm = { title: string; description: string; confirmLabel?: string; run: () => Promise<unknown> };

const KINDS: { id: Kind; label: string; icon: typeof MapIcon; hint: string }[] = [
  { id: "general", label: "General", icon: MapIcon, hint: "Everyday drops" },
  { id: "landmark", label: "Landmark", icon: Landmark, hint: "Places that stay" },
  { id: "event", label: "Event", icon: Calendar, hint: "Tied to a date" },
  { id: "hotspot", label: "Hotspot", icon: Zap, hint: "Areas that keep dropping" },
];

const fmt = (d: Date | string) => format(new Date(d), "MMM d, yyyy");
const coords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Where a drop is in time: not started, live, or over. */
function timing(start: Date | string, end: Date | string, now: number) {
  if (now < new Date(start).getTime()) return { label: "Scheduled", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  if (now > new Date(end).getTime()) return { label: "Ended", tone: "bg-muted text-muted-foreground" };
  return { label: "Live", tone: "bg-primary/10 text-primary" };
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{children}</span>;
}

/**
 * Pin management: every pin group and hotspot as a list — search, review
 * status, per-pin collection counts, and bulk delete. Editing a group opens
 * its own page; a hotspot opens on the map.
 */
export default function PinManagementPage() {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname() ?? "";
  const kindParam = search?.get("type") as Kind | null;
  const kind: Kind = kindParam && KINDS.some((k) => k.id === kindParam) ? kindParam : "general";
  const setKind = (k: Kind) => router.replace(k === "general" ? pathname : `${pathname}?type=${k}`, { scroll: false });

  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 350);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const summary = api.maps.pin.getSummary.useQuery();

  const ask = (c: Confirm) => setConfirm(c);
  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Drops"
        title="Pin management"
        description="Every pin and hotspot you've dropped — check review status and collections, edit, or clean up."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/pins/hotspots/new">
                <Radar /> New hotspot
              </Link>
            </Button>
            <Button asChild>
              <Link href="/pins/new">
                <Plus /> New pin
              </Link>
            </Button>
          </>
        }
      />

      <div role="tablist" aria-label="Pin type" className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              "rounded-xl border bg-card p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              kind === k.id ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <k.icon className="size-3.5" /> {k.label}
            </span>
            <span className="mt-1 block font-hud text-2xl font-semibold tabular-nums">
              {summary.data ? summary.data[k.id].toLocaleString() : <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-muted align-middle" />}
            </span>
            <span className="text-[11px] text-faint">{k.hint}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "hotspot" ? "Search hotspots by drop title" : "Search by title"}
          className="pl-9"
          aria-label="Search"
        />
      </div>

      <div className="mt-4">
        {kind === "hotspot" ? (
          <HotspotList key={`h-${debounced}`} search={debounced} now={now} ask={ask} />
        ) : (
          <GroupList key={`${kind}-${debounced}`} kind={kind} search={debounced} now={now} ask={ask} />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && !busy && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel ?? "Delete"}
        busy={busy}
        onConfirm={() => void runConfirm()}
      />
    </PageBody>
  );
}

// ── Pin groups (general / landmark / event) ────────────────────────────────

function GroupList({ kind, search, now, ask }: { kind: Exclude<Kind, "hotspot">; search: string; now: number; ask: (c: Confirm) => void }) {
  const utils = api.useUtils();
  const list = api.maps.pin.getLocationGroups.useInfiniteQuery(
    { type: kind, search: search || undefined, limit: 20 },
    { getNextPageParam: (l) => l.nextCursor },
  );
  const groups = list.data?.pages.flatMap((p) => p.groups) ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const refresh = () => {
    void utils.maps.pin.getLocationGroups.invalidate();
    void utils.maps.pin.getSummary.invalidate();
    void utils.maps.pin.getMyPins.invalidate();
  };

  const bulk = api.maps.pin.bulkDeleteLocationGroups.useMutation();
  const allSelected = groups.length > 0 && groups.every((g) => selected.has(g.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  if (list.isPending) return <ListSkeleton />;
  if (list.isError) return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;
  if (!groups.length)
    return search ? (
      <EmptyState icon={Search} title="No matches" description={`Nothing called “${search}”.`} />
    ) : (
      <EmptyState
        icon={MapPin}
        title={`No ${kind} pins yet`}
        description="Drop a pin on the map and it shows up here."
        action={
          <Button asChild>
            <Link href="/pins/new">
              <Plus /> New pin
            </Link>
          </Button>
        }
      />
    );

  return (
    <>
      <SelectionBar
        count={selected.size}
        allSelected={allSelected}
        onSelectAll={(on) => setSelected(on ? new Set(groups.map((g) => g.id)) : new Set())}
        label="groups"
        onDelete={() =>
          ask({
            title: `Delete ${plural(selected.size, "group")}?`,
            description: "Their pins and collection history are removed. This can't be undone.",
            run: async () => {
              await bulk.mutateAsync({ ids: [...selected] });
              toast.success(`${plural(selected.size, "group")} deleted`);
              setSelected(new Set());
              refresh();
            },
          })
        }
      />
      <ul className="mt-3 space-y-2">
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} now={now} selected={selected.has(g.id)} onSelect={(on) => toggle(g.id, on)} ask={ask} onChanged={refresh} />
        ))}
      </ul>
      <LoadMore query={list} />
    </>
  );
}

function GroupRow({
  group: g,
  now,
  selected,
  onSelect,
  ask,
  onChanged,
}: {
  group: Group;
  now: number;
  selected: boolean;
  onSelect: (on: boolean) => void;
  ask: (c: Confirm) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const remove = api.maps.pin.deleteLocationGroup.useMutation();
  const removePin = api.maps.pin.deleteLocation.useMutation();
  const removePins = api.maps.pin.bulkDeleteLocations.useMutation();

  const t = timing(g.startDate, g.endDate, now);
  const review = g.approved === false ? { label: "Rejected", tone: "bg-destructive/10 text-destructive" } : g.approved == null ? { label: "In review", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" } : null;
  const collected = g.locations.reduce((n, l) => n + l._count.consumers, 0);
  const editHref = g.locations[0] ? `/pins/${g.locations[0].id}/edit` : null;

  return (
    <li className={cn("overflow-hidden rounded-xl border bg-card", selected && "border-primary/60")}>
      <div className="flex items-center gap-3 p-3">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${g.title}`} className="size-4 shrink-0 accent-primary" />
        {g.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.image} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-faint">
            <MapPin className="size-5" />
          </span>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{g.title}</span>
            <Pill tone={t.tone}>{t.label}</Pill>
            {review && <Pill tone={review.tone}>{review.label}</Pill>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {fmt(g.startDate)} → {fmt(g.endDate)} · {plural(g.locations.length, "pin")} · {collected.toLocaleString()} collected
          </span>
        </button>
        {editHref && (
          <Button variant="ghost" size="icon-sm" asChild className="hidden sm:inline-flex">
            <Link href={editHref} aria-label={`Edit ${g.title}`}>
              <Pencil />
            </Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {editHref && (
              <DropdownMenuItem asChild>
                <Link href={editHref}>
                  <Pencil /> Edit
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                ask({
                  title: `Delete “${g.title}”?`,
                  description: `Its ${plural(g.locations.length, "pin")} and collection history are removed. This can't be undone.`,
                  run: async () => {
                    await remove.mutateAsync({ id: g.id });
                    toast.success("Group deleted");
                    onChanged();
                  },
                })
              }
            >
              <Trash2 /> Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide pins" : "Show pins"}>
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="border-t bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={g.locations.length > 0 && g.locations.every((l) => picked.has(l.id))}
                onChange={(e) => setPicked(e.target.checked ? new Set(g.locations.map((l) => l.id)) : new Set())}
              />
              {plural(g.locations.length, "pin")}
            </label>
            {picked.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-destructive hover:text-destructive"
                onClick={() =>
                  ask({
                    title: `Delete ${plural(picked.size, "pin")}?`,
                    description: "Fans can no longer collect them. This can't be undone.",
                    run: async () => {
                      await removePins.mutateAsync({ locationIds: [...picked], locationGroupId: g.id });
                      toast.success(`${plural(picked.size, "pin")} deleted`);
                      setPicked(new Set());
                      onChanged();
                    },
                  })
                }
              >
                <Trash2 /> Delete {picked.size}
              </Button>
            )}
          </div>
          {g.locations.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No pins in this group.</p>
          ) : (
            <ul className="space-y-1">
              {g.locations.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={picked.has(l.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(l.id);
                        else n.delete(l.id);
                        return n;
                      })
                    }
                    aria-label={`Select pin at ${coords(l.latitude, l.longitude)}`}
                  />
                  <span className={cn("size-2 shrink-0 rounded-full", l.autoCollect ? "bg-primary" : "bg-muted-foreground/50")} title={l.autoCollect ? "Auto-collect" : "Collected by hand"} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{coords(l.latitude, l.longitude)}</span>
                  {l.hidden && <Pill tone="bg-muted text-muted-foreground">Hidden</Pill>}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{l._count.consumers.toLocaleString()} collected</span>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <Link href={`/pins/${l.id}/edit`} aria-label="Edit pin">
                      <Pencil />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete pin"
                    onClick={() =>
                      ask({
                        title: "Delete this pin?",
                        description: `The pin at ${coords(l.latitude, l.longitude)} is removed. This can't be undone.`,
                        run: async () => {
                          await removePin.mutateAsync({ locationId: l.id, locationGroupId: g.id });
                          toast.success("Pin deleted");
                          onChanged();
                        },
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ── Hotspots ──────────────────────────────────────────────────────────────

function HotspotList({ search, now, ask }: { search: string; now: number; ask: (c: Confirm) => void }) {
  const list = api.maps.pin.getHotspots.useInfiniteQuery({ search: search || undefined, limit: 20 }, { getNextPageParam: (l) => l.nextCursor });
  const hotspots = list.data?.pages.flatMap((p) => p.hotspots) ?? [];

  if (list.isPending) return <ListSkeleton />;
  if (list.isError) return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;
  if (!hotspots.length)
    return search ? (
      <EmptyState icon={Search} title="No matches" description={`No hotspot drops called “${search}”.`} />
    ) : (
      <EmptyState
        icon={Radar}
        title="No hotspots yet"
        description="Draw an area on the map and it keeps dropping pins on a schedule."
        action={
          <Button asChild>
            <Link href="/pins/hotspots/new">
              <Radar /> New hotspot
            </Link>
          </Button>
        }
      />
    );

  return (
    <>
      <ul className="space-y-2">
        {hotspots.map((h) => (
          <HotspotRow key={h.id} hotspot={h} now={now} ask={ask} />
        ))}
      </ul>
      <LoadMore query={list} />
    </>
  );
}

function HotspotRow({ hotspot: h, now, ask }: { hotspot: Hotspot; now: number; ask: (c: Confirm) => void }) {
  const utils = api.useUtils();
  const refresh = () => {
    void utils.maps.pin.getHotspots.invalidate();
    void utils.maps.pin.getSummary.invalidate();
    void utils.maps.pin.myHotspots.invalidate();
  };
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggleActive = api.maps.pin.toggleHotspotActive.useMutation({
    onSuccess: () => (toast.success(h.isActive ? "Hotspot paused" : "Hotspot resumed"), refresh()),
    onError: (e) => toast.error(e.message),
  });
  const removeDrop = api.maps.pin.deleteHotspotDropGroup.useMutation();
  const removeDrops = api.maps.pin.bulkDeleteHotspotDropGroups.useMutation();
  const removeHotspot = api.maps.pin.deleteHotspotCascade.useMutation();

  const title = h.locationGroups[h.locationGroups.length - 1]?.title ?? h.locationGroups[0]?.title ?? "Untitled hotspot";
  const ended = now > new Date(h.hotspotEndDate).getTime();
  const notStarted = now < new Date(h.hotspotStartDate).getTime();
  const state = ended
    ? { label: "Ended", tone: "bg-muted text-muted-foreground" }
    : !h.isActive
      ? { label: "Paused", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
      : notStarted
        ? { label: "Starts " + fmt(h.hotspotStartDate), tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
        : { label: "Active", tone: "bg-primary/10 text-primary" };
  const collected = h.locationGroups.reduce((n, g) => n + g.locations.reduce((m, l) => m + l._count.consumers, 0), 0);

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radar className="size-5" />
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{title}</span>
            <Pill tone={state.tone}>{state.label}</Pill>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            Every {plural(h.dropEveryDays, "day")} · pins last {plural(h.pinDurationDays, "day")} · until {fmt(h.hotspotEndDate)} · {plural(h.locationGroups.length, "drop")} ·{" "}
            {collected.toLocaleString()} collected
          </span>
        </button>
        {!ended && (
          <Button variant="outline" size="sm" className="hidden sm:inline-flex" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate({ id: h.id })}>
            {toggleActive.isPending ? <Spinner className="size-4" /> : h.isActive ? <Pause /> : <Play />}
            {h.isActive ? "Pause" : "Resume"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/pins?hotspot=${h.id}`}>
                <MapIcon /> View on map
              </Link>
            </DropdownMenuItem>
            {!ended && (
              <DropdownMenuItem className="sm:hidden" onClick={() => toggleActive.mutate({ id: h.id })}>
                {h.isActive ? <Pause /> : <Play />} {h.isActive ? "Pause" : "Resume"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                ask({
                  title: `Delete “${title}”?`,
                  description: `The hotspot stops dropping, and its ${plural(h.locationGroups.length, "drop")} and their pins are removed. This can't be undone.`,
                  confirmLabel: "Delete hotspot",
                  run: async () => {
                    await removeHotspot.mutateAsync({ hotspotId: h.id });
                    toast.success("Hotspot deleted");
                    refresh();
                  },
                })
              }
            >
              <Trash2 /> Delete hotspot
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide drops" : "Show drops"}>
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="border-t bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{plural(h.locationGroups.length, "drop")}, newest first</span>
            {picked.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-destructive hover:text-destructive"
                onClick={() =>
                  ask({
                    title: `Delete ${plural(picked.size, "drop")}?`,
                    description: "Their pins are removed. The hotspot keeps dropping on schedule.",
                    run: async () => {
                      await removeDrops.mutateAsync({ locationGroupIds: [...picked], hotspotId: h.id });
                      toast.success(`${plural(picked.size, "drop")} deleted`);
                      setPicked(new Set());
                      refresh();
                    },
                  })
                }
              >
                <Trash2 /> Delete {picked.size}
              </Button>
            )}
          </div>
          {h.locationGroups.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No drops yet — the first one comes on schedule.</p>
          ) : (
            <ul className="space-y-1">
              {h.locationGroups.map((g) => {
                const t = g.hidden ? { label: "Scheduled", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" } : timing(g.startDate, g.endDate, now);
                const got = g.locations.reduce((n, l) => n + l._count.consumers, 0);
                return (
                  <li key={g.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={picked.has(g.id)}
                      onChange={(e) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(g.id);
                          else n.delete(g.id);
                          return n;
                        })
                      }
                      aria-label={`Select drop from ${fmt(g.startDate)}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {fmt(g.startDate)} → {fmt(g.endDate)}
                      <span className="text-muted-foreground"> · {plural(g.locations.length, "pin")} · {got.toLocaleString()} collected</span>
                    </span>
                    <Pill tone={t.tone}>{t.label}</Pill>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label="Delete drop"
                      onClick={() =>
                        ask({
                          title: "Delete this drop?",
                          description: "Its pins are removed. The hotspot keeps dropping on schedule.",
                          run: async () => {
                            await removeDrop.mutateAsync({ locationGroupId: g.id, hotspotId: h.id });
                            toast.success("Drop deleted");
                            refresh();
                          },
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function SelectionBar({
  count,
  allSelected,
  onSelectAll,
  onDelete,
  label,
}: {
  count: number;
  allSelected: boolean;
  onSelectAll: (on: boolean) => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 px-3 text-sm">
      <label className="flex items-center gap-2 text-muted-foreground">
        <input type="checkbox" className="size-4 accent-primary" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked)} />
        {count > 0 ? `${count} selected` : `Select all ${label}`}
      </label>
      {count > 0 && (
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 /> Delete {count}
        </Button>
      )}
    </div>
  );
}

function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!query.hasNextPage) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
        {query.isFetchingNextPage && <Spinner className="size-4" />}
        {query.isFetchingNextPage ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[70px] rounded-xl" />
      ))}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
