"use client";

import { MediaType } from "@prisma/client";
import { Coins, CuboidIcon, ImageIcon, Music, Package, Plus, Search, Video } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createElement, useMemo, useState } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs";
import type { MarketAssetType } from "~/lib/state/play/use-modal-store";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { Spinner } from "~/ui/spinner";
import { PageAssetTab } from "./page-asset-tab";
import { api } from "~/utils/api";

type Tab = "assets" | "page-asset";
type Sort = "newest" | "oldest" | "price-high" | "price-low";

const TYPES: { value: MediaType | "ALL"; label: string; icon?: typeof ImageIcon }[] = [
  { value: "ALL", label: "All" },
  { value: MediaType.IMAGE, label: "Image", icon: ImageIcon },
  { value: MediaType.VIDEO, label: "Video", icon: Video },
  { value: MediaType.MUSIC, label: "Music", icon: Music },
  { value: MediaType.THREE_D, label: "3D", icon: CuboidIcon },
];
const typeIcon = (t: MediaType) => TYPES.find((x) => x.value === t)?.icon ?? ImageIcon;
/** The icon for a media type (the lookup returns one of a fixed set of icons). */
function MediaTypeIcon({ type, className }: { type: MediaType; className?: string }) {
  return createElement(typeIcon(type), { className });
}

/** Stores: what the brand sells — NFT assets and its page asset. */
export default function StoresPage() {
  const router = useRouter();
  const search = useSearchParams();
  const tabParam = search?.get("tab");
  const tab: Tab = tabParam === "page-asset" ? "page-asset" : "assets";
  const setTab = (t: string) => router.replace(t === "assets" ? "/stores" : `/stores?tab=${t}`, { scroll: false });

  // One action per tab: the thing that tab is about.
  const actions =
    tab === "page-asset" ? (
      <Button asChild>
        <Link href="/stores/page-asset/new">
          <Coins /> Sell page asset
        </Link>
      </Button>
    ) : (
      <Button asChild>
        <Link href="/stores/new">
          <Plus /> New asset
        </Link>
      </Button>
    );

  return (
    <PageBody>
      <PageHeader eyebrow="Commerce" title="Stores" description="Collectibles fans buy, and your page asset on sale." actions={actions} />

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="assets">
            <Package className="size-4" /> Assets
          </TabsTrigger>
          <TabsTrigger value="page-asset">
            <Coins className="size-4" /> Page asset
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assets" className="mt-5">
          <AssetsTab />
        </TabsContent>
        <TabsContent value="page-asset" className="mt-5">
          <PageAssetTab />
        </TabsContent>
      </Tabs>

    </PageBody>
  );
}

function AssetsTab() {
  const [type, setType] = useState<MediaType | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const nfts = api.marketplace.market.getACreatorNfts.useInfiniteQuery({ limit: 20 }, { getNextPageParam: (last) => last.nextCursor });

  const items = useMemo(() => {
    let list = nfts.data?.pages.flatMap((p) => p.nfts) ?? [];
    if (type !== "ALL") list = list.filter((i) => i.asset.mediaType === type);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.asset.name.toLowerCase().includes(q) || i.asset.code.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sort === "price-high") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "price-low") return (a.price ?? 0) - (b.price ?? 0);
      return sort === "oldest" ? a.id - b.id : b.id - a.id;
    });
  }, [nfts.data, type, query, sort]);

  const hasAny = (nfts.data?.pages[0]?.nfts.length ?? 0) > 0;

  if (nfts.isLoading)
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-card">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  if (nfts.isError) return <ErrorState message={nfts.error.message} onRetry={() => void nfts.refetch()} />;
  if (!hasAny)
    return (
      <EmptyState
        icon={Package}
        title="Nothing in your store yet"
        description="Create a collectible — an image, video, track or 3D piece — and fans can buy it with your page's currency."
        action={
          <Button asChild>
            <Link href="/stores/new">
              <Plus /> New asset
            </Link>
          </Button>
        }
      />
    );

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or code" className="pl-9" aria-label="Search assets" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="price-high">Price: high to low</SelectItem>
            <SelectItem value="price-low">Price: low to high</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
              type === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon && <t.icon className="size-3.5" />} {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try another search or type." className="mt-5" />
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <AssetCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {nfts.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => void nfts.fetchNextPage()} disabled={nfts.isFetchingNextPage}>
            {nfts.isFetchingNextPage && <Spinner className="size-4" />}
            {nfts.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

    </>
  );
}

/** One store item: thumbnail, name, code and price. */
export function AssetCard({ item }: { item: MarketAssetType }) {
  return (
    <Link
      href={`/stores/${item.id}`}
      className="group block w-full overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        {item.asset.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.asset.thumbnail} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
        ) : (
          <div className="flex size-full items-center justify-center text-faint">
            <MediaTypeIcon type={item.asset.mediaType} className="size-8" />
          </div>
        )}
        <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-card/90 text-muted-foreground">
          <MediaTypeIcon type={item.asset.mediaType} className="size-3.5" />
        </span>
      </div>
      <div className="p-3">
        <p className="truncate font-hud text-sm font-semibold">{item.asset.name}</p>
        <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">{item.asset.code}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">
            {item.price ? `${item.price} ${PLATFORM_ASSET.code.toUpperCase()}` : "Not for sale"}
          </span>
        </p>
      </div>
    </Link>
  );
}
