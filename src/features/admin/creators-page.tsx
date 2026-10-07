"use client";

import { formatDistanceToNow } from "date-fns";
import { Ban, Check, Clock, Coins, ExternalLink, RefreshCw, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Switch } from "~/components/shadcn/ui/switch";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { PlatformFilter } from "~/features/admin/platform-filter";
import { BLANK_KEYWORD } from "~/lib/utils";
import type { CreatorExtraFields } from "~/types/creator";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { DataTable, type Column, type RowAction } from "~/ui/data-table";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Person } from "~/ui/person";
import { StatusPill } from "~/ui/status-pill";
import { FilterChips, SearchInput, Toolbar } from "~/ui/toolbar";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

import { useCreatorActions } from "./use-creator-actions";

type Creator = RouterOutputs["admin"]["creator"]["getCreators"][number];
type Status = "all" | "pending" | "approved" | "banned";
type Sort = "newest" | "oldest" | "name";
type Pending = { creator: Creator; action: "ban" | "unban" | "delete" };

const statusOf = (c: Creator): Exclude<Status, "all"> => (c.approved === true ? "approved" : c.approved === false ? "banned" : "pending");
const needsIssue = (c: Creator) => c.approved === true && c.pageAsset?.issuer === BLANK_KEYWORD;

/** Admin › Creators: the approval queue, then every brand with its access. */
export default function CreatorsPage() {
  const { isSuperAdmin } = usePortalAccess();
  const [platformId, setPlatformId] = useState<string>();
  const creators = api.admin.creator.getCreators.useQuery(platformId ? { platformId } : undefined, { refetchOnWindowFocus: false });
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const onSearch = useCallback((q: string) => setQuery(q.toLowerCase()), []);
  const act = useCreatorActions();

  const counts = useMemo(() => {
    const all = creators.data ?? [];
    return {
      all: all.length,
      pending: all.filter((c) => c.approved === null).length,
      approved: all.filter((c) => c.approved === true).length,
      banned: all.filter((c) => c.approved === false).length,
    };
  }, [creators.data]);

  const rows = useMemo(() => {
    if (!creators.data) return undefined;
    return creators.data
      .filter((c) => status === "all" || statusOf(c) === status)
      .filter((c) => !query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query) || Boolean(c.vanityURL?.toLowerCase().includes(query)))
      .sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : (sort === "oldest" ? 1 : -1) * (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()),
      );
  }, [creators.data, status, query, sort]);

  const columns: Column<Creator>[] = [
    {
      id: "brand",
      header: "Brand",
      skeleton: "person",
      cell: (c) => <Person name={c.name} image={c.profileUrl} sub={<span className="font-mono">{addrShort(c.id, 6)}</span>} />,
    },
    ...(isSuperAdmin
      ? [{ id: "platform", header: "Platform", skeleton: "short", cell: (c) => <StatusPill tone="info">{c.platform.name}</StatusPill> } satisfies Column<Creator>]
      : []),
    {
      id: "status",
      header: "Status",
      skeleton: "pill",
      cell: (c) => <CreatorStatus creator={c} onApprove={act.approve} busy={act.busy} />,
    },
    {
      id: "asset",
      header: "Page asset",
      skeleton: "short",
      cell: (c) =>
        c.pageAsset ? (
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold">{c.pageAsset.code}</span>
            {c.pageAsset.issuer === BLANK_KEYWORD && <StatusPill tone="warning">Not issued</StatusPill>}
          </span>
        ) : c.customPageAssetCodeIssuer ? (
          <span className="font-mono text-xs font-semibold">
            {c.customPageAssetCodeIssuer.split("-")[0]} <span className="font-sans font-normal text-muted-foreground">(own)</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "activity",
      header: "Activity",
      skeleton: "text",
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground">
          <b className="font-semibold tabular-nums text-foreground">{c._count.LocationGroup}</b> {c._count.LocationGroup === 1 ? "pin" : "pins"} ·{" "}
          <b className="font-semibold tabular-nums text-foreground">{c._count.followers}</b> {c._count.followers === 1 ? "follower" : "followers"}
        </span>
      ),
    },
    {
      id: "nav",
      header: "Full access",
      skeleton: "toggle",
      cell: (c) => <NavPermissionToggle creator={c} />,
    },
    {
      id: "joined",
      header: "Joined",
      skeleton: "short",
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground" title={new Date(c.joinedAt).toLocaleString()}>
          {formatDistanceToNow(new Date(c.joinedAt), { addSuffix: true })}
        </span>
      ),
    },
  ];

  const actions = (c: Creator): RowAction[] => {
    const s = statusOf(c);
    const list: RowAction[] = [{ label: "View details", icon: ExternalLink, href: `/admin/creators/${c.id}` }];
    if (s === "pending") list.push({ label: "Approve", icon: Check, onSelect: () => act.approve(c) });
    if (needsIssue(c)) list.push({ label: "Issue page asset", icon: Coins, onSelect: () => act.approve(c) });
    if (s === "approved") list.push({ label: "Ban", icon: Ban, destructive: true, separator: true, onSelect: () => setConfirm({ creator: c, action: "ban" }) });
    if (s === "banned") list.push({ label: "Unban", icon: UserCheck, separator: true, onSelect: () => setConfirm({ creator: c, action: "unban" }) });
    list.push({ label: "Delete", icon: Trash2, destructive: true, separator: s === "pending", onSelect: () => setConfirm({ creator: c, action: "delete" }) });
    return list;
  };

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Creators"
        description="Approve new brands, give them full access, and manage existing ones."
        actions={
          <Button variant="outline" onClick={() => void creators.refetch()} disabled={creators.isFetching}>
            <RefreshCw className={creators.isFetching ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />

      <Toolbar className="mt-6">
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All", count: creators.data ? counts.all : undefined },
            { value: "pending", label: "Pending", icon: Clock, count: creators.data ? counts.pending : undefined },
            { value: "approved", label: "Approved", icon: UserCheck, count: creators.data ? counts.approved : undefined },
            { value: "banned", label: "Banned", icon: UserX, count: creators.data ? counts.banned : undefined },
          ]}
        />
        <div className="flex gap-2 sm:ml-auto">
          <SearchInput onSearch={onSearch} placeholder="Search name, wallet or URL" />
          <PlatformFilter value={platformId} onChange={setPlatformId} />
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-32 shrink-0" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <DataTable
        className="mt-4"
        label="Creators"
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={creators.isPending}
        error={creators.error?.message}
        onRetry={() => void creators.refetch()}
        rowHref={(c) => `/admin/creators/${c.id}`}
        actions={actions}
        empty={{
          icon: Users,
          title: query ? "No creators match" : status === "pending" ? "Nothing waiting for approval" : "No creators here",
          description: query ? "Try another name or wallet." : status === "pending" ? "New brand requests show up here." : undefined,
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && !act.busy && setConfirm(null)}
        title={
          confirm?.action === "delete"
            ? `Delete ${confirm.creator.name}?`
            : confirm?.action === "ban"
              ? `Ban ${confirm.creator.name}?`
              : `Unban ${confirm?.creator.name ?? ""}?`
        }
        description={
          confirm?.action === "delete"
            ? "The brand and everything it made — pins, posts, bounties — are removed for good."
            : confirm?.action === "ban"
              ? "They lose access to the portal and their drops stop showing to fans. You can unban them later."
              : "They get their portal access back."
        }
        confirmLabel={confirm?.action === "delete" ? "Delete" : confirm?.action === "ban" ? "Ban" : "Unban"}
        destructive={confirm?.action !== "unban"}
        busy={act.busy}
        onConfirm={() => {
          if (!confirm) return;
          const done = () => setConfirm(null);
          if (confirm.action === "delete") act.remove(confirm.creator, done);
          else act.setBan(confirm.creator, confirm.action === "ban", done);
        }}
      />
    </PageBody>
  );
}

/** Status, with the one action that matters inline: Approve / Issue. */
function CreatorStatus({ creator: c, onApprove, busy }: { creator: Creator; onApprove: (c: Creator) => void; busy: boolean }) {
  const s = statusOf(c);
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {s === "approved" ? (
        <StatusPill tone="success" icon={UserCheck}>
          Approved
        </StatusPill>
      ) : s === "banned" ? (
        <StatusPill tone="danger" icon={Ban}>
          Banned
        </StatusPill>
      ) : (
        <StatusPill tone="warning" icon={Clock}>
          Pending
        </StatusPill>
      )}
      {(s === "pending" || needsIssue(c)) && (
        <Button size="sm" className="h-7 px-2.5 text-xs" disabled={busy} onClick={() => onApprove(c)}>
          {s === "pending" ? "Approve" : "Issue asset"}
        </Button>
      )}
    </div>
  );
}

function NavPermissionToggle({ creator: c }: { creator: Creator }) {
  const utils = api.useUtils();
  const on = (c.extraFields as CreatorExtraFields | null)?.navPermission ?? false;
  const update = api.admin.creator.updateNavPermission.useMutation({
    onSuccess: (_, v) => {
      toast.success(v.navPermission ? `${c.name} now has full access` : `${c.name} is back to drops only`);
      void utils.admin.creator.getCreators.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center" title="Posts, bounties, stores, gifts and membership">
      <Switch
        checked={update.isPending ? Boolean(update.variables?.navPermission) : on}
        disabled={update.isPending || c.approved !== true}
        onCheckedChange={(v) => update.mutate({ creatorId: c.id, navPermission: v })}
        aria-label={`Full access for ${c.name}`}
      />
    </div>
  );
}
