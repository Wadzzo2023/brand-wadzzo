"use client";

import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronLeft, Copy, MapPin, Package, Shield, Store, Ticket, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs";
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

type User = RouterOutputs["admin"]["user"]["getUser"];
const back = { href: "/admin/users", label: "Users" };

/** Admin › Users › one account: who they are, and what they've collected, redeemed and bought. */
export default function UserDetailsPage({ id }: { id: string }) {
  const user = api.admin.user.getUser.useQuery(id, { retry: false });

  if (user.isPending) return <UserSkeleton />;
  if (user.isError)
    return (
      <PageBody wide>
        <PageHeader title="User" back={back} />
        {/not found|No User/i.test(user.error.message) ? (
          <EmptyState className="mt-6" icon={Users} title="User not found" description="The account may have been deleted." />
        ) : (
          <ErrorState className="mt-6" message={user.error.message} onRetry={() => void user.refetch()} />
        )}
      </PageBody>
    );
  return <Details u={user.data} />;
}

function Details({ u }: { u: User }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [deleting, setDeleting] = useState(false);
  const title = u.name?.trim() ? u.name : addrShort(u.id, 6);

  const remove = api.admin.user.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      void utils.admin.user.getUsers.invalidate();
      router.push("/admin/users");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <PageBody wide>
      <Link href={back.href} className="label-caps mb-4 inline-flex items-center gap-1 hover:text-foreground">
        <ChevronLeft className="size-3.5" /> {back.label}
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Avatar src={u.image} name={title} className="size-16 text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-hud text-2xl font-semibold sm:text-3xl">{title}</h1>
            {u.Admin.length > 0 && (
              <StatusPill tone="info" icon={Shield}>
                Admin
              </StatusPill>
            )}
            {u.creator && (
              <StatusPill tone={u.creator.approved ? "success" : u.creator.approved === false ? "danger" : "warning"} icon={Store}>
                Brand
              </StatusPill>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {u.email && (
              <>
                <span>{u.email}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(u.id).then(() => toast.success("Wallet copied"))}
              className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
            >
              {addrShort(u.id, 6)} <Copy className="size-3" />
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {u.joinedAt ? `Joined ${format(new Date(u.joinedAt), "MMM d, yyyy")}` : "Join date unknown"}
            {u.firstSignUpMethod && ` · signed up with ${u.firstSignUpMethod}`}
            {u.fromAppSignup && " · from the app"}
          </p>
          {u.bio && <p className="mt-2 max-w-2xl text-sm">{u.bio}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {u.creator && (
            <Button variant="outline" asChild>
              <Link href={`/admin/creators/${u.creator.id}`}>
                <Store /> View brand
              </Link>
            </Button>
          )}
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Pins collected" icon={MapPin} value={u._count.LocationConsumer.toLocaleString()} />
        <StatCard label="Rewards redeemed" icon={Ticket} value={u._count.RedeemConsumer.toLocaleString()} />
        <StatCard label="Assets bought" icon={Package} value={u._count.assets.toLocaleString()} />
        <StatCard label="Following" icon={Users} value={u._count.followings.toLocaleString()} />
      </dl>

      <Tabs defaultValue="pins" className="mt-8">
        <TabsList variant="line">
          <TabsTrigger value="pins">
            <MapPin /> Collected <TabCount n={u._count.LocationConsumer} />
          </TabsTrigger>
          <TabsTrigger value="redeems">
            <Ticket /> Codes redeemed <TabCount n={u._count.RedeemConsumer} />
          </TabsTrigger>
          <TabsTrigger value="assets">
            <Package /> Assets <TabCount n={u._count.assets} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pins">
          <List
            empty="Hasn't collected any pins yet."
            more={u._count.LocationConsumer - u.LocationConsumer.length}
            items={u.LocationConsumer.map((c) => {
              const g = c.location.locationGroup;
              const at = c.claimedAt ?? c.createdAt;
              return {
                key: c.id,
                image: g?.image,
                icon: MapPin,
                title: g?.title ?? "Pin",
                sub: (
                  <>
                    {g?.creator ? (
                      <Link href={`/admin/creators/${g.creator.id}`} className="hover:underline">
                        {g.creator.name}
                      </Link>
                    ) : (
                      "Unknown brand"
                    )}{" "}
                    · {formatDistanceToNow(new Date(at), { addSuffix: true })}
                  </>
                ),
                end: c.isRedeemed ? (
                  <StatusPill tone="success" icon={CheckCircle2}>
                    Redeemed
                  </StatusPill>
                ) : g?.type === "LANDMARK" || g?.type === "EVENT" ? (
                  <StatusPill tone="warning">Not redeemed</StatusPill>
                ) : null,
              };
            })}
          />
        </TabsContent>
        <TabsContent value="redeems">
          <List
            empty="Hasn't redeemed any codes."
            more={u._count.RedeemConsumer - u.RedeemConsumer.length}
            items={u.RedeemConsumer.map((r) => ({
              key: String(r.id),
              icon: Ticket,
              title: <span className="font-mono tracking-wider">{r.code}</span>,
              sub: format(new Date(r.redeemedAt), "PPp"),
            }))}
          />
        </TabsContent>
        <TabsContent value="assets">
          <List
            empty="Hasn't bought any assets."
            more={u._count.assets - u.assets.length}
            items={u.assets.map((a) => ({
              key: String(a.id),
              image: a.asset.thumbnail,
              icon: Package,
              title: a.asset.name,
              sub: (
                <>
                  <span className="font-mono">{a.asset.code}</span> · bought {formatDistanceToNow(new Date(a.buyAt), { addSuffix: true })}
                </>
              ),
            }))}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => !remove.isPending && setDeleting(o)}
        title={`Delete ${title}?`}
        description={
          u.creator
            ? "This account owns a brand — the brand and everything it made are deleted too. This can't be undone."
            : "Their account, collections and activity are removed. This can't be undone."
        }
        busy={remove.isPending}
        onConfirm={() => remove.mutate(u.id)}
      />
    </PageBody>
  );
}

type Item = { key: string; image?: string | null; icon: typeof MapPin; title: React.ReactNode; sub: React.ReactNode; end?: React.ReactNode };

function List({ items, empty, more }: { items: Item[]; empty: string; more: number }) {
  if (!items.length) return <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-3 px-4 py-2.5">
            {i.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <i.icon className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.title}</p>
              <p className="truncate text-xs text-muted-foreground">{i.sub}</p>
            </div>
            {i.end}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">Showing the latest {items.length} · {more.toLocaleString()} more</p>}
    </div>
  );
}

function UserSkeleton() {
  return (
    <PageBody wide>
      <Skeleton className="mb-4 h-3 w-16" />
      <div className="flex items-start gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-10 w-80" />
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </PageBody>
  );
}
