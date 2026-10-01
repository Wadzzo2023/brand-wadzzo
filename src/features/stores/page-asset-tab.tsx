"use client";

import { format } from "date-fns";
import { CheckCircle2, Coins, Copy, Hourglass, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Skeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

type Listing = RouterOutputs["fan"]["asset"]["getMyAssets"][number];
const platform = PLATFORM_ASSET.code.toUpperCase();

/**
 * Stores › Page asset: the brand's own token at a glance (artwork, balance
 * in storage, how much is listed), then each sale listing as a card.
 */
export function PageAssetTab() {
  const overview = api.fan.creator.profileOverview.useQuery(undefined, { refetchOnWindowFocus: false });
  const balance = api.wallate.acc.getCreatorPageAssetBallances.useQuery(undefined, { refetchOnWindowFocus: false, retry: false });
  const listings = api.fan.asset.getMyAssets.useQuery(undefined, { refetchOnWindowFocus: false });
  const [deleting, setDeleting] = useState<Listing | null>(null);

  const utils = api.useUtils();
  const remove = api.fan.asset.deleteSoldPageAsset.useMutation({
    onSuccess: () => {
      toast.success("Listing removed");
      setDeleting(null);
      void utils.fan.asset.getMyAssets.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (overview.isPending) return <TabSkeleton />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />;

  const pa = overview.data?.pageAsset;
  if (!pa)
    return (
      <EmptyState
        icon={Coins}
        title="No page asset yet"
        description="Set up your page asset first — fans use it for memberships and you can sell it here."
        action={
          <Button asChild>
            <Link href="/settings?tab=page-asset">
              <Settings2 /> Set up page asset
            </Link>
          </Button>
        }
      />
    );

  const art = pa.thumbnail ?? overview.data?.profileUrl ?? null;
  const open = listings.data?.filter((l) => !l.isSold) ?? [];
  const onSale = open.reduce((n, l) => n + l.amountToSell, 0);
  const inStorage = balance.data ? Number(balance.data.balance) : undefined;

  return (
    <>
      {/* Hero: the token itself, on its own artwork. */}
      <section className="relative overflow-hidden rounded-2xl border bg-foreground text-white">
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30" aria-hidden />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl border-2 border-white/30 bg-white/10 shadow-xl sm:size-28">
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt={pa.code} className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center">
                <Coins className="size-10 text-white/80" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-white/70 uppercase">Your page asset</p>
            <h2 className="mt-1 font-hud text-3xl font-bold tracking-tight sm:text-4xl">{pa.code}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/80">
              {pa.pending ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/90 px-2 py-0.5 font-medium text-black">
                  <Hourglass className="size-3" /> Waiting for an admin to issue it
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(pa.issuer).then(() => toast.success("Issuer copied"))}
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-mono hover:bg-white/25"
                >
                  {addrShort(pa.issuer, 5)} <Copy className="size-3" />
                </button>
              )}
              {pa.custom && <span className="rounded-full bg-white/15 px-2 py-0.5">Your own Stellar asset</span>}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 sm:w-auto sm:min-w-[360px]">
            <HeroStat label="In storage" value={inStorage === undefined ? (balance.isError ? "—" : "…") : inStorage.toLocaleString()} />
            <HeroStat label="On sale" value={onSale.toLocaleString()} />
            <HeroStat label="Listings" value={(listings.data?.length ?? 0).toLocaleString()} />
          </dl>
        </div>
      </section>

      <div className="mt-8 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-hud text-lg font-semibold">Sale listings</h2>
          <p className="text-sm text-muted-foreground">Bundles of {pa.code} fans can buy from your store.</p>
        </div>
        {!pa.pending && (
          <Button asChild variant="outline">
            <Link href="/stores/page-asset/new">
              <Plus /> New listing
            </Link>
          </Button>
        )}
      </div>

      {listings.isPending ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : listings.isError ? (
        <ErrorState className="mt-4" message={listings.error.message} onRetry={() => void listings.refetch()} />
      ) : !listings.data.length ? (
        <EmptyState
          className="mt-4"
          icon={Coins}
          title="Nothing on sale yet"
          description={pa.pending ? "Once your page asset is issued you can put some of it on sale here." : `Put a bundle of ${pa.code} on sale — fans buy it with ${platform}, XLM or card.`}
          action={
            !pa.pending && (
              <Button asChild>
                <Link href="/stores/page-asset/new">
                  <Plus /> Sell page asset
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.data.map((l) => (
            <li key={l.id}>
              <ListingCard listing={l} code={pa.code} art={art} onDelete={() => setDeleting(l)} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}
        title={`Remove “${deleting?.title ?? "listing"}”?`}
        description="Fans can no longer buy this bundle. The tokens stay in your storage account."
        confirmLabel="Remove"
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate({ id: deleting.id })}
      />
    </>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
      <dt className="text-[10px] font-semibold tracking-wider text-white/70 uppercase">{label}</dt>
      <dd className="mt-0.5 font-hud text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function ListingCard({ listing: l, code, art, onDelete }: { listing: Listing; code: string; art: string | null; onDelete: () => void }) {
  return (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md", l.isSold && "opacity-80")}>
      {/* Banner: the bundle size on the token's artwork. */}
      <div className="relative h-32 overflow-hidden bg-foreground text-white">
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" aria-hidden />
        <div className="absolute top-3 right-3">
          {l.isSold ? (
            <StatusPill tone="success" icon={CheckCircle2} className="bg-success text-white">
              Sold
            </StatusPill>
          ) : (
            <StatusPill tone="info" className="bg-white/90 text-foreground">
              On sale
            </StatusPill>
          )}
        </div>
        <p className="absolute bottom-3 left-4 font-hud text-2xl font-bold tabular-nums">
          {l.amountToSell.toLocaleString()} <span className="text-sm font-semibold text-white/80">{code}</span>
        </p>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-semibold">{l.title || `${l.amountToSell.toLocaleString()} ${code}`}</h3>
        {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.description}</p>}
        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2.5 text-center">
          <Price label={platform} value={l.price} />
          <Price label="USD" value={l.priceUSD} prefix="$" />
          <Price label="XLM" value={l.priceXLM} />
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Listed {format(new Date(l.placedAt), "MMM d, yyyy")}</p>
        <div className="mt-auto flex justify-end gap-1 pt-3">
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
            <Trash2 /> Remove
          </Button>
          {!l.isSold && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/stores/page-asset/${l.id}`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Price({ label, value, prefix = "" }: { label: string; value: number; prefix?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value ? `${prefix}${value.toLocaleString()}` : "—"}</dd>
    </div>
  );
}

function TabSkeleton() {
  return (
    <>
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="mt-8 h-6 w-40" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </>
  );
}
