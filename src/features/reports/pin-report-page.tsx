"use client";

import { format, formatDistanceToNow } from "date-fns";
import { CalendarDays, ChevronLeft, Copy, Download, Link2, MapPin, Pencil, ScanLine, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Marker } from "react-map-gl/mapbox";

import { BaseMap } from "~/components/map-kit/base-map";
import { Button } from "~/components/shadcn/ui/button";
import { DataTable, type Column } from "~/ui/data-table";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody } from "~/ui/page-header";
import { Person } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatCard } from "~/ui/stat-card";
import { StatusPill } from "~/ui/status-pill";
import { SearchInput } from "~/ui/toolbar";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

import { CollectionsChart, downloadCsv, pinStatus } from "./report-kit";

type Report = RouterOutputs["maps"]["report"]["pin"];
type Consumer = Report["consumers"][number];

/** One pin's report: where its locations are, how it's been collected, and by whom. Brand (own pins) and admin. */
export default function PinReportPage() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const admin = (usePathname() ?? "").startsWith("/admin");
  const back = admin ? { href: "/admin/reports", label: "Collection reports" } : { href: "/reports", label: "Reports" };
  const report = api.maps.report.pin.useQuery(id, { retry: false, refetchOnWindowFocus: false });

  return (
    <PageBody wide>
      <Link href={back.href} className="label-caps mb-4 inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3.5" /> {back.label}
      </Link>
      {report.isPending ? (
        <ReportSkeleton />
      ) : report.isError ? (
        /not found/i.test(report.error.message) ? (
          <EmptyState icon={MapPin} title="Pin not found" description="It may have been deleted." />
        ) : (
          <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
        )
      ) : (
        <Body r={report.data} admin={admin} />
      )}
    </PageBody>
  );
}

function Body({ r, admin }: { r: Report; admin: boolean }) {
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const onSearch = useCallback((q: string) => setQuery(q.trim().toLowerCase()), []);
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);

  const status = pinStatus(r, now);
  const index = useMemo(() => new Map(r.locations.map((l, i) => [l.id, i + 1])), [r.locations]);
  const collectors = new Set(r.consumers.map((c) => c.user.id)).size;
  const redeemed = r.consumers.filter((c) => c.isRedeemed).length;
  const total = r.locations.reduce((n, l) => n + l._count.consumers, 0);

  const rows = useMemo(
    () =>
      r.consumers.filter(
        (c) =>
          (!selectedLoc || c.locationId === selectedLoc) &&
          (!query || [c.user.name, c.email, c.user.id].some((v) => v?.toLowerCase().includes(query))),
      ),
    [r.consumers, selectedLoc, query],
  );

  const exportCsv = () =>
    downloadCsv(
      `${r.title.replace(/[^\w-]+/g, "-").toLowerCase()}-collectors.csv`,
      r.consumers.map((c) => {
        const loc = r.locations.find((l) => l.id === c.locationId);
        return {
          Collector: c.user.name ?? "",
          Email: c.email ?? "",
          Wallet: c.user.id,
          Location: index.get(c.locationId) ?? "",
          Latitude: loc?.latitude ?? "",
          Longitude: loc?.longitude ?? "",
          "Collected at": new Date(c.createdAt).toISOString(),
          Redeemed: c.isRedeemed ? "yes" : "no",
        };
      }),
    );

  const columns: Column<Consumer>[] = [
    {
      id: "who",
      header: "Collector",
      skeleton: "person",
      cell: (c) => <Person name={c.user.name} image={c.user.image} id={c.user.id} sub={c.email ?? <span className="font-mono">{addrShort(c.user.id, 5)}</span>} />,
    },
    {
      id: "where",
      header: "Location",
      skeleton: "short",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">{index.get(c.locationId) ?? "?"}</span>
        </span>
      ),
    },
    {
      id: "when",
      header: "Collected",
      skeleton: "short",
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground" title={format(new Date(c.createdAt), "PPpp")}>
          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      id: "redeemed",
      header: "Reward",
      skeleton: "pill",
      cell: (c) =>
        c.isRedeemed ? (
          <StatusPill tone="success" icon={Ticket}>
            Redeemed{c.redeemedAt ? ` ${format(new Date(c.redeemedAt), "MMM d")}` : ""}
          </StatusPill>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "wallet",
      header: "Wallet",
      skeleton: "mono",
      cell: (c) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(c.user.id).then(() => toast.success("Wallet copied"));
          }}
          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {addrShort(c.user.id, 5)} <Copy className="size-3" />
        </button>
      ),
    },
  ];

  const bounds =
    r.locations.length > 1
      ? ([
          Math.min(...r.locations.map((l) => l.longitude)),
          Math.min(...r.locations.map((l) => l.latitude)),
          Math.max(...r.locations.map((l) => l.longitude)),
          Math.max(...r.locations.map((l) => l.latitude)),
        ] as [number, number, number, number])
      : null;

  return (
    <>
      {/* Header: what the pin is, at a glance. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {r.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image} alt="" className="aspect-video w-full rounded-xl border object-cover sm:size-28 sm:aspect-square" />
        ) : (
          <span className="hidden size-28 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground sm:flex">
            <MapPin className="size-8" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-hud text-2xl font-semibold sm:text-3xl">{r.title}</h1>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          {admin && (
            <Link href={`/admin/creators/${r.creator.id}`} className="mt-1 inline-block hover:opacity-80">
              <Person name={r.creator.name} image={r.creator.profileUrl} size="sm" />
            </Link>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {format(new Date(r.startDate), "MMM d, yyyy")} → {format(new Date(r.endDate), "MMM d, yyyy")}
            </span>
            {r.link && (
              <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex max-w-xs items-center gap-1 truncate text-primary hover:underline">
                <Link2 className="size-3.5 shrink-0" /> <span className="truncate">{r.link}</span>
              </a>
            )}
          </p>
          {r.description && <p className="mt-2 line-clamp-2 max-w-3xl text-sm">{r.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" asChild>
            <Link href={`/pins/${r.id}/edit`}>
              <Pencil /> Edit pin
            </Link>
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!r.consumers.length}>
            <Download /> Export CSV
          </Button>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Collections" icon={ScanLine} value={total.toLocaleString()} hint={r.consumers[0] ? `Last ${formatDistanceToNow(new Date(r.consumers[0].createdAt), { addSuffix: true })}` : "None yet"} />
        <StatCard label="Collectors" icon={Users} value={collectors.toLocaleString()} hint={total > collectors ? `${(total / Math.max(1, collectors)).toFixed(1)} each on average` : undefined} />
        <StatCard label="Collections left" icon={MapPin} value={r.limit > 0 ? `${r.remaining.toLocaleString()} / ${r.limit.toLocaleString()}` : "No limit"} hint={`${r.locations.length} location${r.locations.length === 1 ? "" : "s"}`} />
        <StatCard label="Redeemed" icon={Ticket} value={redeemed.toLocaleString()} hint={total ? `${Math.round((redeemed / total) * 100)}% of collections` : undefined} />
      </dl>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h2 className="label-caps">Locations</h2>
            {selectedLoc && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedLoc(null)}>
                Show all collectors
              </button>
            )}
          </div>
          {r.locations.length ? (
            <div className="h-60">
              <BaseMap
                initialViewState={bounds ? { bounds, fitBoundsOptions: { padding: 48, maxZoom: 16 } } : { latitude: r.locations[0]!.latitude, longitude: r.locations[0]!.longitude, zoom: 14 }}
                controlsPosition="top-right"
              >
                {r.locations.map((l, i) => (
                  <Marker key={l.id} latitude={l.latitude} longitude={l.longitude} anchor="center" onClick={(e) => (e.originalEvent.stopPropagation(), setSelectedLoc(selectedLoc === l.id ? null : l.id))}>
                    <button
                      type="button"
                      title={`Location ${i + 1} · ${l._count.consumers} collected`}
                      className={
                        selectedLoc === l.id
                          ? "flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-foreground px-1.5 text-[11px] font-semibold text-background shadow-md"
                          : "flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground shadow-md"
                      }
                    >
                      {i + 1}
                    </button>
                  </Marker>
                ))}
              </BaseMap>
            </div>
          ) : (
            <p className="mx-4 mb-4 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">No locations left.</p>
          )}
          {r.locations.length > 1 && (
            <ul className="flex gap-1.5 overflow-x-auto border-t px-4 py-2.5">
              {r.locations.map((l, i) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedLoc(selectedLoc === l.id ? null : l.id)}
                    className={
                      selectedLoc === l.id
                        ? "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs whitespace-nowrap"
                        : "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
                    }
                  >
                    <span className="font-semibold">{i + 1}</span> {l._count.consumers.toLocaleString()} collected
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <CollectionsChart daily={r.daily} from={new Date(r.startDate).getTime() < now ? new Date(r.startDate) : undefined} />
      </div>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-hud text-lg font-semibold">Collectors</h2>
            <p className="text-sm text-muted-foreground">
              {selectedLoc ? `Who collected location ${index.get(selectedLoc)}.` : "Everyone who collected this pin, newest first."}
              {r.consumers.length >= 1000 && " Showing the latest 1,000 — the CSV has them all."}
            </p>
          </div>
          <div className="sm:ml-auto">
            <SearchInput onSearch={onSearch} placeholder="Search name, email or wallet" />
          </div>
        </div>
        <DataTable
          className="mt-3"
          label="Collectors"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          empty={{
            icon: Users,
            title: query || selectedLoc ? "No collectors match" : "Not collected yet",
            description: query || selectedLoc ? "Try another search or show all locations." : "Fans who collect this pin show up here.",
          }}
        />
      </section>
    </>
  );
}

function ReportSkeleton() {
  return (
    <>
      <div className="flex gap-4">
        <Skeleton className="hidden size-28 rounded-xl sm:block" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-xl" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[236px] rounded-xl" />
      </div>
      <Skeleton className="mt-8 h-64 rounded-xl" />
    </>
  );
}

