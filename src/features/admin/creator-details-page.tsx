"use client";

import { format, formatDistanceToNow } from "date-fns";
import { Ban, Check, ChevronLeft, Clock, Coins, Copy, ExternalLink, FileText, MapPin, Package, Radar, Target, Trash2, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Switch } from "~/components/shadcn/ui/switch";
import { WADZZO_AR_URL } from "~/lib/embed";
import { BLANK_KEYWORD } from "~/lib/utils";
import type { CreatorExtraFields } from "~/types/creator";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Avatar } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatCard } from "~/ui/stat-card";
import { StatusPill } from "~/ui/status-pill";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

import { useCreatorActions } from "./use-creator-actions";

type Creator = RouterOutputs["admin"]["creator"]["getCreator"];
const back = { href: "/admin/creators", label: "Creators" };

/** Admin › Creators › one brand: who they are, what they've made, and the admin actions. */
export default function CreatorDetailsPage({ id }: { id: string }) {
  const creator = api.admin.creator.getCreator.useQuery(id, { retry: false });

  if (creator.isPending) return <DetailSkeleton />;
  if (creator.isError)
    return (
      <PageBody wide>
        <PageHeader title="Creator" back={back} />
        {/not found|No Creator/i.test(creator.error.message) ? (
          <EmptyState className="mt-6" icon={Users} title="Creator not found" description="They may have been deleted." />
        ) : (
          <ErrorState className="mt-6" message={creator.error.message} onRetry={() => void creator.refetch()} />
        )}
      </PageBody>
    );
  return <Details c={creator.data} />;
}

function Details({ c }: { c: Creator }) {
  const router = useRouter();
  const utils = api.useUtils();
  const act = useCreatorActions();
  const [confirm, setConfirm] = useState<"ban" | "unban" | "delete" | null>(null);
  const [now] = useState(() => Date.now());

  const status = c.approved === true ? "approved" : c.approved === false ? "banned" : "pending";
  const needsIssue = c.approved === true && c.pageAsset?.issuer === BLANK_KEYWORD;
  const nav = (c.extraFields as CreatorExtraFields | null)?.navPermission ?? false;
  const custom = c.customPageAssetCodeIssuer?.split("-");
  const asset = c.pageAsset ?? (custom?.[0] ? { code: custom[0], issuer: custom[1] ?? "", thumbnail: null, price: null, priceUSD: null } : null);

  const setNav = api.admin.creator.updateNavPermission.useMutation({
    onSuccess: (_, v) => {
      toast.success(v.navPermission ? "Full access on" : "Full access off");
      void utils.admin.creator.getCreator.invalidate(c.id);
      void utils.admin.creator.getCreators.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

  return (
    <PageBody wide>
      <Link href={back.href} className="label-caps mb-3 inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3.5" /> {back.label}
      </Link>

      {/* Cover + avatar */}
      <div className="relative">
        <div className="relative aspect-[851/315] max-h-60 w-full overflow-hidden rounded-xl border bg-gradient-to-br from-primary/25 via-surface-2 to-primary/5">
          {c.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.coverUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <Avatar src={c.profileUrl} name={c.name} className="absolute -bottom-10 left-4 size-24 border-4 border-background text-3xl sm:-bottom-12 sm:left-6 sm:size-28" />
      </div>

      <div className="mt-12 flex flex-wrap items-start justify-between gap-4 sm:mt-4 sm:pl-40">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-hud text-2xl font-semibold sm:text-3xl">{c.name}</h1>
            {status === "approved" ? (
              <StatusPill tone="success" icon={UserCheck}>
                Approved
              </StatusPill>
            ) : status === "banned" ? (
              <StatusPill tone="danger" icon={Ban}>
                Banned
              </StatusPill>
            ) : (
              <StatusPill tone="warning" icon={Clock}>
                Waiting for approval
              </StatusPill>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{c.bio ?? "No bio yet."}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>Joined {format(new Date(c.joinedAt), "MMM d, yyyy")}</span>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => copy(c.id, "Wallet")} className="inline-flex items-center gap-1 font-mono hover:text-foreground">
              {addrShort(c.id, 6)} <Copy className="size-3" />
            </button>
            {c.user.email && (
              <>
                <span aria-hidden>·</span>
                <span>{c.user.email}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`${WADZZO_AR_URL}/brands/${c.id}`} target="_blank" rel="noreferrer">
              <ExternalLink /> Fan page
            </a>
          </Button>
          {status === "pending" && (
            <>
              <Button variant="outline" className="text-destructive hover:text-destructive" disabled={act.busy} onClick={() => setConfirm("ban")}>
                <Ban /> Reject
              </Button>
              <Button disabled={act.busy} onClick={() => act.approve(c)}>
                <Check /> Approve
              </Button>
            </>
          )}
          {needsIssue && (
            <Button disabled={act.busy} onClick={() => act.approve(c)}>
              <Coins /> Issue page asset
            </Button>
          )}
          {status === "approved" && (
            <Button variant="outline" className="text-destructive hover:text-destructive" disabled={act.busy} onClick={() => setConfirm("ban")}>
              <Ban /> Ban
            </Button>
          )}
          {status === "banned" && (
            <Button variant="outline" disabled={act.busy} onClick={() => setConfirm("unban")}>
              <UserCheck /> Unban
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Pins" icon={MapPin} value={c._count.LocationGroup.toLocaleString()} />
        <StatCard label="Hotspots" icon={Radar} value={c._count.hotspots.toLocaleString()} />
        <StatCard label="Collected" icon={Users} value={c.collected.toLocaleString()} />
        <StatCard label="Followers" icon={Users} value={c._count.followers.toLocaleString()} />
        <StatCard label="Posts" icon={FileText} value={c._count.posts.toLocaleString()} />
        <StatCard label="Bounties" icon={Target} value={c._count.Bounty.toLocaleString()} />
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Recent pins */}
        <section className="rounded-xl border bg-card">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-hud text-sm font-semibold">Recent pins</h2>
            <span className="text-xs text-muted-foreground">{c._count.LocationGroup.toLocaleString()} in total</span>
          </header>
          {c.LocationGroup.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No pins yet.</p>
          ) : (
            <ul className="divide-y">
              {c.LocationGroup.map((g) => {
                const start = new Date(g.startDate).getTime();
                const end = new Date(g.endDate).getTime();
                const live = start <= now && end > now;
                const ended = end <= now;
                return (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                    {g.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <MapPin className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {g._count.locations} {g._count.locations === 1 ? "pin" : "pins"} · {live ? "ends" : ended ? "ended" : "starts"}{" "}
                        {formatDistanceToNow(live || ended ? end : start, { addSuffix: true })}
                      </p>
                    </div>
                    {g.approved === false ? (
                      <StatusPill tone="danger">Rejected</StatusPill>
                    ) : g.approved == null ? (
                      <StatusPill tone="warning">In review</StatusPill>
                    ) : live ? (
                      <StatusPill tone="success" dot>
                        Live
                      </StatusPill>
                    ) : (
                      <StatusPill>{ended ? "Ended" : "Scheduled"}</StatusPill>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-hud text-sm font-semibold">Access</h2>
            <label className="mt-3 flex items-start gap-3">
              <span className="flex-1">
                <span className="block text-sm font-medium">Full access</span>
                <span className="block text-xs text-muted-foreground">Posts, bounties, stores, gifts and membership. Without it, brands can only drop pins.</span>
              </span>
              <Switch
                checked={setNav.isPending ? Boolean(setNav.variables?.navPermission) : nav}
                disabled={setNav.isPending || c.approved !== true}
                onCheckedChange={(v) => setNav.mutate({ creatorId: c.id, navPermission: v })}
              />
            </label>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-hud text-sm font-semibold">Page asset</h2>
            {asset ? (
              <div className="mt-3 flex items-center gap-3">
                {asset.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.thumbnail} alt="" className="size-11 rounded-lg border object-cover" />
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Package className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex items-center gap-2 font-mono font-semibold">
                    {asset.code}
                    {asset.issuer === BLANK_KEYWORD ? <StatusPill tone="warning">Not issued</StatusPill> : !c.pageAsset && <StatusPill>Own asset</StatusPill>}
                  </p>
                  {asset.issuer && asset.issuer !== BLANK_KEYWORD && (
                    <button type="button" onClick={() => copy(asset.issuer, "Issuer")} className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                      {addrShort(asset.issuer, 6)} <Copy className="size-3" />
                    </button>
                  )}
                </div>
                {asset.price != null && (
                  <p className="text-right text-xs text-muted-foreground">
                    <b className="block text-sm tabular-nums text-foreground">{asset.price}</b> price
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No page asset — the brand can set one up in Settings.</p>
            )}
          </section>

          <section className="rounded-xl border border-destructive/30 bg-card p-4">
            <h2 className="font-hud text-sm font-semibold text-destructive">Danger zone</h2>
            <p className="mt-1 text-xs text-muted-foreground">Deleting removes the brand and everything it made.</p>
            <Button variant="outline" size="sm" className="mt-3 text-destructive hover:text-destructive" onClick={() => setConfirm("delete")} disabled={act.busy}>
              <Trash2 /> Delete brand
            </Button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && !act.busy && setConfirm(null)}
        title={confirm === "delete" ? `Delete ${c.name}?` : confirm === "unban" ? `Unban ${c.name}?` : status === "pending" ? `Reject ${c.name}?` : `Ban ${c.name}?`}
        description={
          confirm === "delete"
            ? "The brand and everything it made — pins, posts, bounties — are removed for good."
            : confirm === "unban"
              ? "They get their portal access back."
              : "They can't use the portal and their drops stop showing to fans. You can unban them later."
        }
        confirmLabel={confirm === "delete" ? "Delete" : confirm === "unban" ? "Unban" : status === "pending" ? "Reject" : "Ban"}
        destructive={confirm !== "unban"}
        busy={act.busy}
        onConfirm={() => {
          if (confirm === "delete") act.remove(c, () => router.push("/admin/creators"));
          else if (confirm) act.setBan(c, confirm === "ban", () => setConfirm(null));
        }}
      />
    </PageBody>
  );
}

function DetailSkeleton() {
  return (
    <PageBody wide>
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="aspect-[851/315] max-h-60 w-full rounded-xl" />
      <div className="mt-12 space-y-2 sm:mt-4 sm:pl-40">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </PageBody>
  );
}
