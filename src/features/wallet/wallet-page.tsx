"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { env } from "~/env";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

const fmt = (n: number, dp = 2) => n.toLocaleString("en-US", { maximumFractionDigits: dp });
const explorer = (path: string) =>
  `https://stellar.expert/explorer/${env.NEXT_PUBLIC_STELLAR_PUBNET ? "public" : "testnet"}/${path}`;

/**
 * The brand's storage wallet: the Stellar account that holds its stock until
 * fans buy or claim it. Balances on top, then everything that moved through it.
 */
export default function WalletPage() {
  const account = api.fan.storage.account.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  return (
    <PageBody className="max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Storage account"
        title="Wallet"
        description="Where your item stock sits until fans buy or claim it."
      />

      {account.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : account.isError ? (
        <ErrorState message={account.error.message} onRetry={() => void account.refetch()} />
      ) : !account.data ? (
        <EmptyState
          icon={Wallet}
          title="No storage account yet"
          description="It's created when your brand is approved."
        />
      ) : (
        <>
          <Summary data={account.data} />
          <Holdings tokens={account.data.tokens} />
          <History />
        </>
      )}
    </PageBody>
  );
}

type Data = NonNullable<RouterOutputs["fan"]["storage"]["account"]>;

function Summary({ data }: { data: Data }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(data.publicKey).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Couldn't copy the address"),
    );
  const stats = [
    { label: "XLM balance", value: fmt(data.xlm, 4) },
    {
      label: "Spendable",
      value: fmt(data.spendableXlm, 4),
      hint: "after reserves",
    },
    {
      label: "Reserved",
      value: fmt(data.reserved, 2),
      hint: "locked by Stellar",
    },
    { label: "Assets held", value: String(data.tokens.length) },
  ];
  return (
    <section className="bg-card border-foreground/10 rounded-[1.4rem] border-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
          <Wallet className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-hud text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
            Address
          </p>
          <p className="truncate font-mono text-sm" title={data.publicKey}>
            {data.publicKey}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={explorer(`account/${data.publicKey}`)} target="_blank" rel="noreferrer">
            <ExternalLink /> Explorer
          </a>
        </Button>
      </div>
      {!data.active && (
        <p className="bg-warning/10 text-warning mt-3 rounded-lg px-3 py-2 text-sm">
          This account isn&apos;t active on Stellar yet. It activates with your first item.
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-lg p-3">
            <dt className="text-muted-foreground text-xs">{s.label}</dt>
            <dd className="font-hud mt-0.5 text-lg font-semibold tabular-nums">{s.value}</dd>
            {s.hint && <p className="text-faint text-[11px]">{s.hint}</p>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function Holdings({ tokens }: { tokens: Data["tokens"] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-hud text-base font-semibold">Holdings</h2>
      {!tokens.length ? (
        <EmptyState
          icon={Boxes}
          title="Nothing in storage"
          description="Items you mint ahead of time land here and leave when fans buy or claim them."
        />
      ) : (
        <ul className="bg-card border-foreground/10 divide-y rounded-[1.4rem] border-2">
          {tokens.map((t) => (
            <li key={`${t.code}-${t.issuer}`} className="flex items-center gap-3 p-3">
              {t.item?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.item.thumbnail} alt="" className="size-10 rounded-lg object-cover" />
              ) : (
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  {t.platform ? <Sparkles className="size-5" /> : <Boxes className="size-5" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.item?.name ?? t.code}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {t.code} · {addrShort(t.issuer, 5)}
                </p>
              </div>
              <p className="font-hud text-sm font-semibold tabular-nums">{fmt(t.balance, 4)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function History() {
  const q = api.fan.storage.history.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (l) => l.nextCursor ?? undefined },
  );
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="space-y-2">
      <h2 className="font-hud text-base font-semibold">History</h2>
      {q.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : !rows.length ? (
        <EmptyState
          icon={ArrowDownLeft}
          title="No activity yet"
          description="Mints, sales and claims through this account show up here."
        />
      ) : (
        <>
          <ul className="bg-card border-foreground/10 divide-y rounded-[1.4rem] border-2">
            {rows.map((r) => {
              const out = r.kind === "sent";
              return (
                <li key={r.id}>
                  <a
                    href={explorer(`tx/${r.hash}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:bg-accent/50 flex items-center gap-3 p-3 transition-colors"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        out
                          ? "bg-foreground/8 text-muted-foreground"
                          : "bg-primary/12 text-primary",
                      )}
                    >
                      {out ? (
                        <ArrowUpRight className="size-4" />
                      ) : (
                        <ArrowDownLeft className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.kind === "created" ? "Account created" : out ? "Sent" : "Received"}{" "}
                        {r.label ?? r.code}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {r.kind === "created" ? "by" : out ? "to" : "from"}{" "}
                        <span className="font-mono">{addrShort(r.counterparty, 5)}</span> ·{" "}
                        {formatDistanceToNow(new Date(r.at), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "font-hud text-sm font-semibold tabular-nums",
                        !out && "text-primary",
                      )}
                    >
                      {out ? "−" : "+"}
                      {fmt(r.amount, 4)}{" "}
                      <span className="text-muted-foreground text-xs font-medium">{r.code}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {q.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                disabled={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
              >
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
