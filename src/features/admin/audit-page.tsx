"use client";

import { format } from "date-fns";
import { ScrollText } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { PlatformFilter } from "~/features/admin/platform-filter";
import { DataTable, type Column } from "~/ui/data-table";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Person } from "~/ui/person";
import { Spinner } from "~/ui/spinner";
import { StatusPill } from "~/ui/status-pill";
import { SearchInput, Toolbar } from "~/ui/toolbar";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

type Entry = RouterOutputs["admin"]["audit"]["list"]["items"][number];

/** Admin › Audit log: who did what, and from which platform. */
export default function AuditPage() {
  const [platformId, setPlatformId] = useState<string>();
  const [action, setAction] = useState("");
  const onSearch = useCallback((q: string) => setAction(q.trim()), []);

  const log = api.admin.audit.list.useInfiniteQuery(
    { platformId, action: action || undefined, limit: 50 },
    { getNextPageParam: (l) => l.nextCursor, refetchOnWindowFocus: false },
  );
  const rows = log.data?.pages.flatMap((p) => p.items);

  const columns: Column<Entry>[] = [
    {
      id: "when",
      header: "When",
      skeleton: "short",
      cell: (e) => <span className="whitespace-nowrap text-muted-foreground">{format(new Date(e.createdAt), "MMM d, yyyy HH:mm")}</span>,
    },
    {
      id: "who",
      header: "Who",
      skeleton: "person",
      cell: (e) =>
        e.actorId ? <Person name={e.actor?.name ?? null} image={e.actor?.image ?? null} id={e.actorId} sub={<span className="font-mono">{addrShort(e.actorId, 6)}</span>} /> : <span className="text-muted-foreground">System</span>,
    },
    {
      id: "action",
      header: "Action",
      skeleton: "mono",
      cell: (e) => (
        <div>
          <p className="font-mono text-xs">{e.action}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {e.entityType} {e.entityId.length > 40 ? `${e.entityId.slice(0, 40)}…` : e.entityId}
          </p>
        </div>
      ),
    },
    {
      id: "platform",
      header: "From",
      skeleton: "pill",
      cell: (e) => (
        <span className="flex flex-wrap gap-1">
          <StatusPill tone="info">{e.platform.name}</StatusPill>
          {e.targetPlatformId && <StatusPill tone="warning">on {e.targetPlatformId}</StatusPill>}
        </span>
      ),
    },
  ];

  return (
    <PageBody wide>
      <PageHeader eyebrow="Admin" title="Audit log" description="Sign-ups, platform joins and every admin action, with the platform it came from." />

      <Toolbar className="mt-6">
        <SearchInput onSearch={onSearch} placeholder="Action, e.g. brand. or user.signup" />
        <PlatformFilter value={platformId} onChange={setPlatformId} />
      </Toolbar>

      <DataTable
        className="mt-4"
        label="Audit log"
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={log.isPending}
        error={log.error?.message}
        onRetry={() => void log.refetch()}
        empty={{ icon: ScrollText, title: "Nothing logged yet" }}
        footer={
          log.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                {log.isFetchingNextPage && <Spinner className="size-4" />}
                {log.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )
        }
      />
    </PageBody>
  );
}
