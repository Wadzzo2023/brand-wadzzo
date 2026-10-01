"use client";

import { formatDistanceToNow } from "date-fns";
import { Download, ExternalLink, Loader2, MapPin, ScanLine, Ticket, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { cn } from "~/lib/utils";
import { DataTable, type Column } from "~/ui/data-table";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Person } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatCard } from "~/ui/stat-card";
import { StatusPill } from "~/ui/status-pill";
import { SearchInput } from "~/ui/toolbar";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

import { CollectionsChart, Delta, PeriodPicker, downloadCsv, periodLabel, periodRange, pinStatus, type Period } from "./report-kit";

type Summary = RouterOutputs["maps"]["report"]["summary"];
type PinRow = Summary["pins"][number];

/**
 * Collection report. "brand" = the signed-in brand's own pins (Reports);
 * "admin" = any brand or all of them (Admin › Collection reports).
 */
export function CollectionReport({ scope }: { scope: "brand" | "admin" }) {
  const admin = scope === "admin";
  const [period, setPeriod] = useState<Period>(() => periodRange("30d"));
  const [brand, setBrand] = useState<string>("all");
  const [query, setQuery] = useState("");
  const onSearch = useCallback((q: string) => setQuery(q.trim().toLowerCase()), []);
  const [onlyCollected, setOnlyCollected] = useState(false);
  const [now] = useState(() => Date.now());

  const creatorId = admin ? brand : undefined;
  const report = api.maps.report.summary.useQuery({ creatorId, from: period.from, to: period.to }, { refetchOnWindowFocus: false, placeholderData: (prev) => prev });
  const brands = api.admin.creator.getCreators.useQuery(undefined, { enabled: admin, refetchOnWindowFocus: false });
  const exp = api.maps.report.export.useMutation();

  const data = report.data;
  const loading = report.isPending;
  const refetching = report.isFetching && !report.isPending;

  const pins = useMemo(
    () =>
      (data?.pins ?? [])
        .filter((p) => (!onlyCollected || p.collected > 0) && (!query || p.title.toLowerCase().includes(query) || p.creator.name.toLowerCase().includes(query)))
        .sort((a, b) => b.collected - a.collected || +new Date(b.createdAt) - +new Date(a.createdAt)),
    [data, onlyCollected, query],
  );
  const top = useMemo(() => [...(data?.pins ?? [])].filter((p) => p.collected > 0).sort((a, b) => b.collected - a.collected).slice(0, 5), [data]);
  const activePins = data?.pins.filter((p) => p.collected > 0).length ?? 0;
  const base = admin ? "/admin/reports" : "/reports";
  const allBrands = admin && brand === "all";

  const exportCsv = () =>
    exp.mutate(
      { creatorId, from: period.from, to: period.to },
      {
        onSuccess: (rows) => {
          if (!rows.length) return toast("Nothing to export for this period");
          downloadCsv(
            `wadzzo-collections-${new Date().toISOString().slice(0, 10)}.csv`,
            rows.map((r) => ({
              ...(allBrands ? { Brand: r.brand } : {}),
              Pin: r.pin,
              "Pin ID": r.pinId,
              Latitude: r.lat,
              Longitude: r.lng,
              Collector: r.name ?? "",
              Email: r.email,
              Wallet: r.wallet,
              "Collected at": new Date(r.collectedAt).toISOString(),
              Redeemed: r.redeemed ? "yes" : "no",
            })),
          );
          toast.success(`Exported ${rows.length.toLocaleString()} collections`);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const columns: Column<PinRow>[] = [
    {
      id: "pin",
      header: "Pin",
      skeleton: "image",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg border object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <MapPin className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{p.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {allBrands ? `${p.creator.name} · ` : ""}
              {p.locations.toLocaleString()} location{p.locations === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      skeleton: "pill",
      cell: (p) => {
        const s = pinStatus(p, now);
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
      },
    },
    {
      id: "collected",
      header: "Collected",
      align: "right",
      skeleton: "number",
      cell: (p) => <span className={cn("tabular-nums", p.collected ? "font-semibold" : "text-muted-foreground")}>{p.collected.toLocaleString()}</span>,
    },
    {
      id: "collectors",
      header: "Collectors",
      align: "right",
      skeleton: "number",
      cell: (p) => <span className="text-muted-foreground tabular-nums">{p.collectors.toLocaleString()}</span>,
    },
    {
      id: "left",
      header: "Left",
      align: "right",
      skeleton: "number",
      mobileLabel: "Collections left",
      cell: (p) => <span className="text-muted-foreground tabular-nums">{p.limit > 0 ? `${p.remaining.toLocaleString()} / ${p.limit.toLocaleString()}` : "No limit"}</span>,
    },
    {
      id: "last",
      header: "Last collected",
      skeleton: "short",
      cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{p.lastCollected ? formatDistanceToNow(new Date(p.lastCollected), { addSuffix: true }) : "—"}</span>,
    },
  ];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow={admin ? "Admin" : "Insights"}
        title={admin ? "Collection reports" : "Reports"}
        description={admin ? "How every brand's pins are collected — by whom, where and when." : "How your pins are collected — by whom, where and when."}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exp.isPending || loading}>
            {exp.isPending ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
          </Button>
        }
      />

      {/* Scope: which brand (admins) and which period. */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <PeriodPicker value={period} onChange={setPeriod} />
        {admin && (
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-full lg:ml-auto lg:w-64" aria-label="Brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">All brands</SelectItem>
              {brands.data?.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {refetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
      </div>

      {report.isError ? (
        <ErrorState className="mt-6" message={report.error.message} onRetry={() => void report.refetch()} />
      ) : (
        <div className={cn("transition-opacity", refetching && "opacity-60")}>
          <dl className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {loading || !data ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[98px] rounded-xl" />)
            ) : (
              <>
                <StatCard label="Collections" icon={ScanLine} value={data.totals.collections.toLocaleString()} hint={<Delta now={data.totals.collections} before={data.previous?.collections} />} />
                <StatCard label="Collectors" icon={Users} value={data.totals.collectors.toLocaleString()} hint={<Delta now={data.totals.collectors} before={data.previous?.collectors} />} />
                <StatCard label="Pins collected" icon={MapPin} value={`${activePins} / ${data.pins.length}`} hint={`pins with a collection in ${periodLabel(period)}`} />
                <StatCard label="Redeemed" icon={Ticket} value={data.totals.redeemed.toLocaleString()} hint={data.totals.collections ? `${Math.round((data.totals.redeemed / data.totals.collections) * 100)}% of collections` : "rewards claimed in store"} />
              </>
            )}
          </dl>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {loading || !data ? <Skeleton className="h-[236px] rounded-xl" /> : <CollectionsChart daily={data.daily} from={period.from} to={period.to} />}
            <Leaders title="Top collectors" icon={Users} loading={loading} empty="Nobody collected a pin in this period.">
              {data?.collectors.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <Person name={c.name} image={c.image} id={c.id} size="sm" sub={<span className="font-mono">{addrShort(c.id, 4)}</span>} />
                  <span className="ml-auto text-sm font-semibold tabular-nums">{c.n.toLocaleString()}</span>
                </li>
              ))}
            </Leaders>
          </div>

          {top.length > 0 && (
            <Leaders title="Most collected pins" icon={TrendingUp} className="mt-3" loading={false} empty="">
              {top.map((p) => (
                <li key={p.id}>
                  <Link href={`${base}/${p.id}`} className="group flex items-center gap-3 py-2">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <MapPin className="size-3.5 text-muted-foreground" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:underline">{p.title}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(p.collected / top[0]!.collected) * 100}%` }} />
                      </div>
                    </div>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums">{p.collected.toLocaleString()}</span>
                  </Link>
                </li>
              ))}
            </Leaders>
          )}

          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-hud text-lg font-semibold">All pins</h2>
                <p className="text-sm text-muted-foreground">Numbers are for {periodLabel(period)}. Open a pin for its map and collectors.</p>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm">
                  <Switch checked={onlyCollected} onCheckedChange={setOnlyCollected} aria-label="Only pins with collections" />
                  <span className="hidden sm:inline">Only collected</span>
                </label>
                <SearchInput onSearch={onSearch} placeholder={allBrands ? "Search pin or brand" : "Search pins"} />
              </div>
            </div>
            <DataTable
              className="mt-3"
              label="Pins"
              columns={columns}
              rows={loading ? undefined : pins}
              rowKey={(p) => p.id}
              loading={loading}
              skeletonRows={6}
              rowHref={(p) => `${base}/${p.id}`}
              actions={(p) => [
                { label: "Open report", icon: ExternalLink, href: `${base}/${p.id}` },
                ...(allBrands ? [{ label: `View ${p.creator.name}`, icon: Users, href: `/admin/creators/${p.creator.id}` }] : []),
              ]}
              empty={{
                icon: MapPin,
                title: query || onlyCollected ? "No pins match" : "No pins yet",
                description: query || onlyCollected ? "Try another search or show all pins." : admin ? "This brand hasn't created any pins." : "Pins you drop show up here with their numbers.",
              }}
            />
          </section>
        </div>
      )}
    </PageBody>
  );
}

function Leaders({
  title,
  icon: Icon,
  loading,
  empty,
  className,
  children,
}: {
  title: string;
  icon: typeof Users;
  loading: boolean;
  empty: string;
  className?: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      <h2 className="label-caps flex items-center gap-1.5">
        <Icon className="size-3.5" /> {title}
      </h2>
      {loading ? (
        <div className="mt-3 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))}
        </div>
      ) : items.length ? (
        <ol className="mt-1 divide-y">{children}</ol>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

