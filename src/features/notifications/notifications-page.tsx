"use client";

import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { NotificationRow } from "~/components/notification/notification-row";
import { useInboxActions } from "~/components/notification/use-inbox-actions";
import { Button } from "~/components/shadcn/ui/button";
import { CATEGORIES } from "~/lib/notification-catalog";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import type { InboxItem } from "~/server/notification-inbox";
import { api } from "~/utils/api";

const SCOPE = "brand" as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function bucket(d: Date | string): "Today" | "Yesterday" | "Earlier" {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(d))) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : "Earlier";
}

/** Everything that happened around your brand: sales, followers, bounties, drops. Newest first, repeats folded together. */
export default function NotificationsPage() {
  const [category, setCategory] = useState<string | undefined>();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const list = api.fan.notification.inbox.useInfiniteQuery(
    { scope: SCOPE, category, unreadOnly, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined, refetchOnWindowFocus: true },
  );
  const counts = api.fan.notification.inboxUnreadByCategory.useQuery({ scope: SCOPE }, { refetchOnWindowFocus: true });
  const { markAllRead, clearRead } = useInboxActions();

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const sections = useMemo(() => {
    const out: { label: string; rows: InboxItem[] }[] = [];
    for (const i of items) {
      const label = bucket(i.createdAt);
      const last = out.at(-1);
      if (last?.label === label) last.rows.push(i);
      else out.push({ label, rows: [i] });
    }
    return out;
  }, [items]);

  const totalUnread = Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);

  return (
    <PageBody className="max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Sales, followers, bounties and drops around your brand."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!totalUnread || markAllRead.isPending} onClick={() => markAllRead.mutate({ scope: SCOPE, category })}>
              <CheckCheck className="size-4" /> Mark all read
            </Button>
            <Button variant="ghost" size="sm" disabled={clearRead.isPending} onClick={() => clearRead.mutate({ scope: SCOPE })}>
              <Trash2 className="size-4" /> Clear read
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
          <Chip active={!category} onClick={() => setCategory(undefined)} label="All" count={totalUnread} />
          {CATEGORIES[SCOPE].map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)} label={c.label} count={counts.data?.[c.id] ?? 0} />
          ))}
        </div>
        <div className="flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Show">
          {[
            { id: false, label: "All" },
            { id: true, label: "Unread" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="tab"
              aria-selected={unreadOnly === o.id}
              onClick={() => setUnreadOnly(o.id)}
              className={cn("rounded-md px-3 py-1 font-medium transition-colors", unreadOnly === o.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <div className="space-y-2 rounded-xl border bg-card p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          description={unreadOnly ? "You've read everything." : "When fans buy your items, follow your brand, join your bounties or collect your pins, you'll see it here."}
        />
      ) : (
        <div className="space-y-5">
          {sections.map((s) => (
            <section key={s.label} className="space-y-1.5">
              <h2 className="px-1 font-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{s.label}</h2>
              <div className="divide-y rounded-xl border bg-card p-1">
                {s.rows.map((i) => (
                  <NotificationRow key={i.ids[0]} item={i} />
                ))}
              </div>
            </section>
          ))}
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </PageBody>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-line-bright hover:text-foreground",
      )}
    >
      {label}
      {count > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count > 99 ? "99+" : count}</span>}
    </button>
  );
}
