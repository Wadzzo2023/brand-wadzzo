"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowDownUp,
  Check as CheckIcon,
  CheckCircle2,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  ExternalLink,
  Eye,
  Keyboard,
  MapPin,
  Pencil,
  Plus,
  Radar,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast, { type Toast } from "react-hot-toast";

import { PinQRDownloadAllButton, pinQRBulkActions, useDropQRs } from "~/components/pins/qr";
import { Button } from "~/components/shadcn/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { PlatformFilter } from "~/features/admin/platform-filter";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { Check, RowMenu, type RowAction } from "~/ui/data-table";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Avatar } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { FilterChips, SearchInput } from "~/ui/toolbar";
import { api } from "~/utils/api";

import { AreaDialog } from "./pin-review/area-dialog";
import { ActiveFilters, FilterButton } from "./pin-review/filter-panel";
import { Locations } from "./pin-review/locations";
import { NO_FILTERS, SORTS, TYPE_LABEL, activeChips, matches, plural, sortGroups, type Filters, type Group, type Sort, type View } from "./pin-review/model";
import { PreviewSheet } from "./pin-review/preview-sheet";
import { ShortcutsDialog, useReviewShortcuts } from "./pin-review/shortcuts";

type Brand = { id: string; name: string; image: string | null; groups: Group[]; oldest: Date };
type Confirm = { kind: "reject" | "delete"; ids: string[]; title: string };

/** Rows shown per brand (or in the flat list) before "Show more". */
const PAGE = 8;
const FLAT = "__all";

/**
 * Admin › Pin review: brands' new pins wait here until an admin approves them
 * (fans don't see them before). Filter, sort, select in bulk, preview, and
 * review from the keyboard; every decision can be undone.
 *
 * Every row has the same layout: expand arrow · checkbox · content ·
 * Reject / Approve · "…" menu.
 */
export default function AdminPinsPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const view: View = params?.get("view") === "approved" ? "approved" : "pending";

  const [platformId, setPlatformId] = useState<string>();
  const scope = platformId ? { platformId } : undefined;
  const pending = api.maps.pin.getAdminLocationGroups.useQuery(scope, { refetchOnWindowFocus: false });
  const approved = api.maps.pin.getApprovedLocationGroups.useQuery(scope, { enabled: view === "approved", refetchOnWindowFocus: false });
  const list = view === "pending" ? pending : approved;

  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const onSearch = useCallback((q: string) => setQuery(q.trim().toLowerCase()), []);
  const [sort, setSort] = useState<Sort>("newest");
  const [byBrand, setByBrand] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const patchFilters = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openBrands, setOpenBrands] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);

  const setView = (v: View) => {
    router.replace(v === "pending" ? pathname : `${pathname}?view=approved`, { scroll: false });
    setSelected(new Set());
    setFocusId(null);
    setPreviewOpen(false);
  };

  // ── Data: filter → sort → group ───────────────────────────────────────────
  const area = api.maps.pin.reviewGroupsInArea.useQuery(filters.area ?? { north: 0, south: 0, east: 0, west: 0 }, {
    enabled: Boolean(filters.area),
    refetchOnWindowFocus: false,
  });
  const areaIds = useMemo(() => (filters.area && area.data ? new Set(area.data) : null), [filters.area, area.data]);

  const rows = useMemo(() => {
    const hit = (list.data ?? []).filter((g) => {
      if (query && !g.title.toLowerCase().includes(query) && !g.creator.name.toLowerCase().includes(query) && !g.description?.toLowerCase().includes(query)) return false;
      return matches(g, filters, now, areaIds);
    });
    return sortGroups(hit, sort);
  }, [list.data, query, filters, now, areaIds, sort]);

  // Brands in the order their best-ranked pin appears under the chosen sort.
  const brands = useMemo(() => {
    const map = new Map<string, Brand>();
    for (const g of rows) {
      const b = map.get(g.creator.id) ?? { id: g.creator.id, name: g.creator.name, image: g.creator.profileUrl, groups: [], oldest: new Date(g.createdAt) };
      b.groups.push(g);
      if (new Date(g.createdAt) < b.oldest) b.oldest = new Date(g.createdAt);
      map.set(b.id, b);
    }
    return [...map.values()];
  }, [rows]);

  const allBrands = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const g of list.data ?? []) {
      const b = m.get(g.creator.id) ?? { id: g.creator.id, name: g.creator.name, count: 0 };
      b.count++;
      m.set(b.id, b);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [list.data]);
  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of list.data ?? []) m.set(g.type, (m.get(g.type) ?? 0) + 1);
    return [...m.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }, [list.data]);
  const points = useMemo(() => (list.data ?? []).map((g) => ({ lat: g.latitude, lng: g.longitude })), [list.data]);

  const hasFilters = activeChips(filters, () => "").length > 0;
  const filtering = Boolean(query) || hasFilters;
  const defaultOpen = brands.length <= 3 || filtering;
  const isOpen = (id: string) => openBrands[id] ?? defaultOpen;
  const allOpen = brands.length > 0 && brands.every((b) => isOpen(b.id));
  const shownOf = (key: string) => shown[key] ?? PAGE;

  /** Every matching pin in display order (keyboard + preview stepping walk this). */
  const ordered = useMemo(() => (byBrand ? brands.flatMap((b) => b.groups) : rows), [byBrand, brands, rows]);
  const visibleIds = useMemo(() => new Set(rows.map((g) => g.id)), [rows]);
  const selectedIds = [...selected].filter((id) => visibleIds.has(id));
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  // ── Mutations with undo ───────────────────────────────────────────────────
  const utils = api.useUtils();
  const refresh = () => {
    void utils.maps.pin.getAdminLocationGroups.invalidate();
    void utils.maps.pin.getApprovedLocationGroups.invalidate();
    void utils.maps.pin.getReviewGroup.invalidate();
  };
  const decide = api.maps.pin.approveLocationGroups.useMutation({ onSettled: refresh });
  const del = api.maps.pin.deleteLocationGroupForAdmin.useMutation({ onSettled: refresh });
  const restore = api.maps.pin.restoreLocationGroupsForAdmin.useMutation({ onSettled: refresh });
  const busy = decide.isPending || del.isPending || restore.isPending;

  const undoable = (message: string, undo: () => Promise<unknown>) =>
    toast(
      (t: Toast) => (
        <span className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-success" />
          {message}
          <button
            type="button"
            className="ml-1 rounded px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/10"
            onClick={() => {
              toast.dismiss(t.id);
              undo().then(
                () => toast.success("Undone"),
                (e: Error) => toast.error(e.message),
              );
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 7000 },
    );

  /** Keep the keyboard focus on the row after the ones that are about to leave the list. */
  const focusAfter = (ids: string[]) => {
    if (!focusId || !ids.includes(focusId)) return;
    const i = ordered.findIndex((g) => g.id === focusId);
    const next = ordered.slice(i + 1).find((g) => !ids.includes(g.id)) ?? ordered.slice(0, i).reverse().find((g) => !ids.includes(g.id));
    setFocusId(next?.id ?? null);
    if (!next) setPreviewOpen(false);
  };

  const setDecision = (ids: string[], value: boolean | null, message: string, undoTo: boolean | null) => {
    focusAfter(ids);
    decide.mutate(
      { locationGroupIds: ids, approved: value },
      {
        onSuccess: () => {
          setMany(ids, false);
          undoable(message, () => decide.mutateAsync({ locationGroupIds: ids, approved: undoTo }));
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  const approve = (ids: string[]) => setDecision(ids, true, ids.length === 1 ? "Approved — it's live for fans" : `${ids.length} pins approved`, null);
  const reject = (ids: string[]) => setDecision(ids, false, ids.length === 1 ? "Pin rejected" : `${ids.length} pins rejected`, null);
  const unapprove = (ids: string[]) => setDecision(ids, null, ids.length === 1 ? "Moved back to review" : `${ids.length} pins moved back to review`, true);

  /** One pin is rejected straight away (undo covers mistakes); many ask first. */
  const askReject = (ids: string[]) => (ids.length === 1 ? reject(ids) : setConfirm({ kind: "reject", ids, title: `Reject ${plural(ids.length, "pin")}?` }));
  const askDelete = (ids: string[], name: string) => setConfirm({ kind: "delete", ids, title: `Delete ${ids.length === 1 ? `“${name}”` : plural(ids.length, "pin")}?` });

  const runConfirm = () => {
    if (!confirm) return;
    const { kind, ids } = confirm;
    if (kind === "reject") {
      setConfirm(null);
      return reject(ids);
    }
    focusAfter(ids);
    del.mutate(
      { ids },
      {
        onSuccess: (r) => {
          setConfirm(null);
          setMany(ids, false);
          undoable(r.count === 1 ? "Pin deleted" : `${r.count} pins deleted`, () => restore.mutateAsync({ ids }));
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  // ── Focus, preview, keyboard ──────────────────────────────────────────────
  /** Move the focus, opening its brand and paging it into view if needed. */
  const focus = (id: string) => {
    setFocusId(id);
    const g = ordered.find((x) => x.id === id);
    if (!g) return;
    const key = byBrand ? g.creator.id : FLAT;
    if (byBrand && !isOpen(key)) setOpenBrands((o) => ({ ...o, [key]: true }));
    const inGroup = byBrand ? (brands.find((b) => b.id === key)?.groups ?? []) : rows;
    const idx = inGroup.findIndex((x) => x.id === id);
    if (idx >= shownOf(key)) setShown((s) => ({ ...s, [key]: idx + PAGE }));
  };
  const step = (dir: 1 | -1) => {
    if (!ordered.length) return;
    const i = focusId ? ordered.findIndex((g) => g.id === focusId) : -1;
    const next = i === -1 ? (dir === 1 ? 0 : ordered.length - 1) : Math.min(ordered.length - 1, Math.max(0, i + dir));
    focus(ordered[next]!.id);
  };

  useEffect(() => {
    if (!focusId) return;
    const raf = requestAnimationFrame(() => document.querySelector(`[data-pin-row="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(raf);
  }, [focusId, shown, openBrands]);

  const toggleExpanded = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const focused = focusId ? ordered.find((g) => g.id === focusId) : undefined;

  useReviewShortcuts(
    {
      next: () => step(1),
      prev: () => step(-1),
      open: () => focused && setPreviewOpen((o) => !o),
      select: () => focused && setMany([focused.id], !selected.has(focused.id)),
      approve: () => {
        if (view !== "pending" || busy) return;
        if (selectedIds.length) approve(selectedIds);
        else if (focused) approve([focused.id]);
      },
      reject: () => {
        if (view !== "pending" || busy) return;
        if (selectedIds.length) askReject(selectedIds);
        else if (focused) reject([focused.id]);
      },
      edit: () => focused && router.push(`/pins/${focused.id}/edit`),
      locations: () => focused && toggleExpanded(focused.id),
      escape: () => !previewOpen && setSelected(new Set()),
      help: () => setHelpOpen(true),
    },
    Boolean(confirm) || helpOpen || areaOpen,
  );

  const openPreview = (id: string) => {
    setFocusId(id);
    setPreviewOpen(true);
  };

  const rowProps = (g: Group, showBrand: boolean) => ({
    g,
    view,
    showBrand,
    now,
    on: selected.has(g.id),
    focused: focusId === g.id,
    expanded: expanded.has(g.id),
    busy,
    onSelect: (on: boolean) => setMany([g.id], on),
    onToggle: () => toggleExpanded(g.id),
    onOpen: () => openPreview(g.id),
    onApprove: () => approve([g.id]),
    onReject: () => reject([g.id]),
    onUnapprove: () => unapprove([g.id]),
    onDelete: () => askDelete([g.id], g.title),
  });

  const total = list.data?.length ?? 0;
  const loading = list.isPending || (Boolean(filters.area) && area.isPending);

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Pin review"
        description="New pins from brands wait here — fans only see them once you approve."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/pins/hotspots/new">
                <Radar /> New hotspot
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/pins/new">
                <Plus /> New pin
              </Link>
            </Button>
          </>
        }
      />

      {/* Row 1: which list + search. Row 2: how to narrow and arrange it. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterChips
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "pending", label: "Waiting for review", icon: Clock, count: pending.data?.length },
            { value: "approved", label: "Approved & live", icon: CheckCircle2, count: approved.data?.length },
          ]}
        />
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
          <SearchInput onSearch={onSearch} placeholder="Search pin or brand" />
          <PlatformFilter value={platformId} onChange={setPlatformId} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilterButton filters={filters} onChange={patchFilters} brands={allBrands} types={types} onPickArea={() => setAreaOpen(true)} />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-auto gap-2" aria-label="Sort">
            <ArrowDownUp className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm">
          <Switch checked={byBrand} onCheckedChange={setByBrand} aria-label="Group by brand" />
          Group by brand
        </label>
        <div className="ml-auto flex items-center gap-1">
          {byBrand && brands.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setOpenBrands(Object.fromEntries(brands.map((b) => [b.id, !allOpen])))}>
              {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
              <span className="hidden sm:inline">{allOpen ? "Collapse all" : "Expand all"}</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
            <Keyboard /> <span className="hidden sm:inline">Shortcuts</span>
          </Button>
        </div>
      </div>

      <ActiveFilters filters={filters} onChange={patchFilters} brandName={(id) => allBrands.find((b) => b.id === id)?.name ?? "Brand"} />

      {/* Results + selection. Sticky so bulk actions stay in reach while scrolling. */}
      {list.data && rows.length > 0 && (
        <div
          className={cn(
            "sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 transition-colors sm:px-4",
            selectedIds.length ? "bg-card/95 shadow-md backdrop-blur" : "border-transparent bg-transparent",
          )}
        >
          <Check
            checked={allSelected}
            indeterminate={selectedIds.length > 0 && !allSelected}
            onChange={(on) => setMany(rows.map((g) => g.id), on)}
            label={`Select all ${rows.length} matching pins`}
          />
          {selectedIds.length ? (
            <>
              <span className="text-sm font-medium tabular-nums">{selectedIds.length} selected</span>
              {!allSelected && (
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => setMany(rows.map((g) => g.id), true)}>
                  Select all {rows.length} matching
                </button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => askDelete(selectedIds, "")}>
                  <Trash2 /> Delete
                </Button>
                {view === "pending" ? (
                  <>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => askReject(selectedIds)}>
                      <X /> Reject {selectedIds.length}
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => approve(selectedIds)}>
                      <CheckIcon /> Approve {selectedIds.length}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => unapprove(selectedIds)}>
                    <RotateCcw /> Move back to review
                  </Button>
                )}
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {filtering ? `${plural(rows.length, "pin")} of ${total.toLocaleString()} match` : plural(rows.length, "pin")}
              {byBrand && ` · ${plural(brands.length, "brand")}`}
              <span className="hidden md:inline"> — tick pins, a brand, or this box for everything shown.</span>
            </span>
          )}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {loading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filtering ? MapPin : view === "pending" ? CheckCircle2 : MapPin}
            title={filtering ? "No pins match" : view === "pending" ? "All caught up" : "No live pins"}
            description={filtering ? "Try a wider date range, another brand, or clear the filters." : view === "pending" ? "New pins from brands show up here for review." : undefined}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => setFilters(NO_FILTERS)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : byBrand ? (
          brands.map((b) => {
            const ids = b.groups.map((g) => g.id);
            const picked = ids.filter((id) => selected.has(id)).length;
            const open = isOpen(b.id);
            const limit = shownOf(b.id);
            const toggle = () => setOpenBrands((o) => ({ ...o, [b.id]: !open }));
            return (
              <section key={b.id} className={cn("overflow-hidden rounded-xl border bg-card", picked > 0 && "ring-1 ring-primary/40")}>
                <header className="flex items-center gap-2 py-2.5 pr-2 pl-1.5 sm:gap-3 sm:pr-3">
                  <ExpandButton open={open} onClick={toggle} label={`${open ? "Collapse" : "Expand"} ${b.name}`} />
                  <Check checked={picked === ids.length} indeterminate={picked > 0 && picked < ids.length} onChange={(on) => setMany(ids, on)} label={`Select all pins from ${b.name}`} />
                  <button type="button" onClick={toggle} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar src={b.image} name={b.name} className="size-9" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{b.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {plural(ids.length, "pin")}
                        {picked > 0 && ` · ${picked} selected`}
                        {view === "pending" && ` · oldest ${formatDistanceToNow(b.oldest, { addSuffix: true })}`}
                      </span>
                    </span>
                  </button>
                  <Decision
                    view={view}
                    busy={busy}
                    count={ids.length}
                    onReject={() => askReject(ids)}
                    onApprove={() => approve(ids)}
                    onUnapprove={() => unapprove(ids)}
                  />
                  <RowMenu
                    items={[
                      { label: "View brand", icon: ExternalLink, href: `/admin/creators/${b.id}` },
                      { label: "Show only this brand", icon: Eye, onSelect: () => patchFilters({ brand: b.id }) },
                      { label: `Delete all ${ids.length}`, icon: Trash2, destructive: true, separator: true, disabled: busy, onSelect: () => askDelete(ids, b.groups[0]!.title) },
                    ]}
                  />
                </header>
                {open && (
                  <>
                    <ul className="divide-y border-t">
                      {b.groups.slice(0, limit).map((g) => (
                        <PinRow key={g.id} {...rowProps(g, false)} />
                      ))}
                    </ul>
                    <ShowMore left={ids.length - limit} onClick={() => setShown((s) => ({ ...s, [b.id]: limit + PAGE * 3 }))} />
                  </>
                )}
              </section>
            );
          })
        ) : (
          <section className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y">
              {rows.slice(0, shownOf(FLAT)).map((g) => (
                <PinRow key={g.id} {...rowProps(g, true)} />
              ))}
            </ul>
            <ShowMore left={rows.length - shownOf(FLAT)} onClick={() => setShown((s) => ({ ...s, [FLAT]: shownOf(FLAT) + PAGE * 4 }))} />
          </section>
        )}
      </div>

      <PreviewSheet
        id={previewOpen ? focusId : null}
        onClose={() => setPreviewOpen(false)}
        view={view}
        busy={busy}
        position={focused ? { index: ordered.indexOf(focused), total: ordered.length } : null}
        onStep={step}
        actions={{
          approve: (id) => approve([id]),
          reject: (id) => reject([id]),
          unapprove: (id) => unapprove([id]),
          remove: (id, title) => askDelete([id], title),
        }}
      />
      <AreaDialog open={areaOpen} onOpenChange={setAreaOpen} area={filters.area} points={points} onApply={(a) => patchFilters({ area: a })} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && !busy && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={
          confirm?.kind === "reject"
            ? "The brand sees them as rejected and fans never see them. You can undo this right after."
            : "They're taken off the map and out of every list, for fans and the brand. You can undo this right after."
        }
        confirmLabel={confirm?.kind === "reject" ? "Reject" : "Delete"}
        busy={busy}
        onConfirm={runConfirm}
      />
    </PageBody>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ExpandButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" onClick={onClick} aria-expanded={open} aria-label={label}>
      <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
    </Button>
  );
}

/** The decision buttons — always Reject then Approve (or Move back, on the approved list). */
function Decision({
  view,
  busy,
  count,
  onReject,
  onApprove,
  onUnapprove,
}: {
  view: View;
  busy: boolean;
  /** Set on a brand header: the buttons act on all its pins. */
  count?: number;
  onReject: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
}) {
  const all = count !== undefined;
  const h = all ? "h-8" : "h-7 px-2 text-xs";
  if (view === "approved")
    return (
      <Button variant="ghost" size="sm" className={cn(h, "shrink-0 text-muted-foreground")} disabled={busy} onClick={onUnapprove} title="Move back to review">
        <RotateCcw /> <span className="hidden sm:inline">{all ? "Move all back" : "Move back"}</span>
      </Button>
    );
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        className={cn(h, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
        disabled={busy}
        onClick={onReject}
        aria-label={all ? `Reject all ${count}` : "Reject"}
      >
        <X /> <span className="hidden sm:inline">{all ? "Reject all" : "Reject"}</span>
      </Button>
      <Button
        size="sm"
        variant={all ? "default" : "secondary"}
        className={cn(h, !all && "bg-success/12 text-success hover:bg-success/20")}
        disabled={busy}
        onClick={onApprove}
        aria-label={all ? `Approve all ${count}` : "Approve"}
      >
        <CheckIcon /> <span className="hidden sm:inline">{all ? "Approve all" : "Approve"}</span>
      </Button>
    </div>
  );
}

function PinRow({
  g,
  view,
  showBrand,
  now,
  on,
  focused,
  expanded,
  busy,
  onSelect,
  onToggle,
  onOpen,
  onApprove,
  onReject,
  onUnapprove,
  onDelete,
}: {
  g: Group;
  view: View;
  showBrand: boolean;
  now: number;
  on: boolean;
  focused: boolean;
  expanded: boolean;
  busy: boolean;
  onSelect: (on: boolean) => void;
  onToggle: () => void;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onUnapprove: () => void;
  onDelete: () => void;
}) {
  const start = new Date(g.startDate);
  const end = new Date(g.endDate);
  const count = g._count.locations;

  // Bulk QR work for this drop. One hook per row, so the spinner on the download
  // button and the disabled state on both menu items always agree.
  const bulkQR = useDropQRs({ locationGroupId: g.id });

  const menu: RowAction[] = [
    { label: "Preview", icon: Eye, onSelect: onOpen },
    { label: "Edit pin", icon: Pencil, href: `/pins/${g.id}/edit` },
    { label: expanded ? "Hide locations" : "Show locations", icon: MapPin, onSelect: onToggle },
    // A drop with no live locations has no code to hand out, so no entry point.
    ...(count > 0 ? pinQRBulkActions(bulkQR, count) : []),
    ...(showBrand ? [{ label: "View brand", icon: ExternalLink, href: `/admin/creators/${g.creator.id}` }] : []),
    { label: "Delete pin", icon: Trash2, destructive: true, separator: true, disabled: busy, onSelect: onDelete },
  ];

  return (
    <li data-pin-row={g.id} className={cn("relative scroll-mt-20 transition-colors", on ? "bg-primary/5" : !expanded && "hover:bg-muted/40")}>
      {focused && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
      <div className="flex items-center gap-2 py-2 pr-2 pl-1.5 sm:gap-3 sm:pr-3">
        <ExpandButton open={expanded} onClick={onToggle} label={`${expanded ? "Hide" : "Show"} ${plural(count, "location")}`} />
        <Check checked={on} onChange={onSelect} label={`Select ${g.title}`} />
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Preview">
          {g.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.image} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg border object-cover" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <MapPin className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{g.title}</span>
              <StatusPill tone="neutral" className="hidden shrink-0 sm:inline-flex">
                {TYPE_LABEL[g.type] ?? g.type}
              </StatusPill>
            </span>
            <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
              {showBrand && (
                <>
                  <span className="font-medium text-foreground/80">{g.creator.name}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span>{plural(count, "location")}</span>
              <span aria-hidden>·</span>
              <span title={`${format(start, "PPp")} → ${format(end, "PPp")}`}>{start.getTime() > now ? `Starts ${format(start, "MMM d")}` : `Until ${format(end, "MMM d, yyyy")}`}</span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
              <span className="hidden sm:inline" title={format(new Date(g.createdAt), "PPp")}>
                Submitted {formatDistanceToNow(new Date(g.createdAt), { addSuffix: true })}
              </span>
            </span>
          </span>
        </button>
        <Decision view={view} busy={busy} onReject={onReject} onApprove={onApprove} onUnapprove={onUnapprove} />
        {count > 0 && <PinQRDownloadAllButton locationGroupId={g.id} title={g.title} count={count} />}
        <RowMenu items={menu} />
      </div>
      {expanded && <Locations groupId={g.id} title={g.title} />}
    </li>
  );
}

function ShowMore({ left, onClick }: { left: number; onClick: () => void }) {
  if (left <= 0) return null;
  return (
    <div className="border-t px-4 py-2 text-center">
      <Button variant="ghost" size="sm" onClick={onClick}>
        Show more <span className="text-muted-foreground">· {left} left</span>
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      {[5, 0, 0, 0].map((rows, i) => (
        <div key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-6 rounded" />
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", i % 2 ? "w-28" : "w-40")} />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="hidden h-8 w-24 rounded-md sm:block" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          {rows > 0 && (
            <div className="divide-y border-t">
              {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="size-6 rounded" />
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="size-11 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className={cn("h-3.5", r % 2 ? "w-36" : "w-52")} />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="hidden h-7 w-20 rounded-md sm:block" />
                  <Skeleton className="h-7 w-24 rounded-md" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
