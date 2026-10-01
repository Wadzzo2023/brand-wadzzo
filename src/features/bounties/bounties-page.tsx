"use client";

import { Plus, Search, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "~/components/shadcn/ui/badge";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { cn } from "~/lib/utils";
import { sortOptionEnum } from "~/types/bounty/bounty-type";
import { htmlToText } from "~/ui/ai/shared";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { api, type RouterOutputs } from "~/utils/api";

import { bountyStatus } from "./bounty-status";

type Bounty = RouterOutputs["bounty"]["Bounty"]["getAllBountyByUserId"]["bounties"][number];

const SORTS: { value: sortOptionEnum; label: string }[] = [
  { value: sortOptionEnum.DATE_DESC, label: "Newest first" },
  { value: sortOptionEnum.DATE_ASC, label: "Oldest first" },
  { value: sortOptionEnum.PRICE_DESC, label: "Highest prize" },
  { value: sortOptionEnum.PRICE_ASC, label: "Lowest prize" },
];

/** Bounties: the brand's own tasks — status, entries and winners at a glance. */
export default function BountiesPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<sortOptionEnum>(sortOptionEnum.DATE_DESC);
  const debounced = useDebounce(search.trim(), 400);

  const bounties = api.bounty.Bounty.getAllBountyByUserId.useInfiniteQuery(
    { limit: 12, search: debounced || undefined, sortBy: sort },
    { getNextPageParam: (last) => last.nextCursor },
  );
  const items = bounties.data?.pages.flatMap((p) => p.bounties) ?? [];

  const newBounty = (
    <Button asChild>
      <Link href="/bounties/new">
        <Plus /> New bounty
      </Link>
    </Button>
  );

  return (
    <PageBody>
      <PageHeader eyebrow="Content" title="Bounties" description="Tasks fans complete for a prize. Pick winners from the entries on each bounty." actions={newBounty} />

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your bounties" className="pl-9" aria-label="Search bounties" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as sortOptionEnum)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5">
        {bounties.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border bg-card">
                <Skeleton className="aspect-[2/1] w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : bounties.isError ? (
          <ErrorState message={bounties.error.message} onRetry={() => void bounties.refetch()} />
        ) : items.length === 0 ? (
          debounced ? (
            <EmptyState icon={Search} title="No matches" description={`No bounties match "${debounced}".`} />
          ) : (
            <EmptyState icon={Trophy} title="No bounties yet" description="Give fans a task — a photo, a hunt, a remix — and a prize for the best entries." action={newBounty} />
          )
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((b) => (
                <li key={b.id}>
                  <BountyCard bounty={b} />
                </li>
              ))}
            </ul>
            {bounties.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={() => void bounties.fetchNextPage()} disabled={bounties.isFetchingNextPage}>
                  {bounties.isFetchingNextPage && <Spinner className="size-4" />}
                  {bounties.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}

export function BountyCard({ bounty: b }: { bounty: Bounty }) {
  const { label, tone } = bountyStatus(b);
  const summary = htmlToText(b.description);

  return (
    <Link
      href={`/bounties/${b.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-surface-2">
        {b.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.imageUrls[0]} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex size-full items-center justify-center text-faint">
            <Trophy className="size-10" />
          </div>
        )}
        <span className={cn("absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 font-hud text-[11px] font-semibold uppercase tracking-wide", tone)}>{label}</span>
        <Badge className="absolute right-3 top-3 font-hud">${b.priceInUSD}</Badge>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 font-hud text-base font-semibold">{b.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{summary || "No description"}</p>
        <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {b._count.participants} {b._count.participants === 1 ? "entry" : "entries"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="size-3.5" /> {b.currentWinnerCount}/{b.totalWinner} winners
          </span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {b.priceInBand.toFixed(0)} {PLATFORM_ASSET.code.toUpperCase()}
          </span>
        </div>
      </div>
    </Link>
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
