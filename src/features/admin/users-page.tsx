"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Shield, Store, Trash2, Users } from "lucide-react";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { PlatformFilter } from "~/features/admin/platform-filter";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { DataTable, type Column } from "~/ui/data-table";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Person } from "~/ui/person";
import { Spinner } from "~/ui/spinner";
import { StatusPill } from "~/ui/status-pill";
import { SearchInput, Toolbar } from "~/ui/toolbar";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

type User = RouterOutputs["admin"]["user"]["getUsers"]["users"][number];

// firstSignUpMethod holds the wallet type's raw value (e.g. "frieghter").
const SIGNUP: Record<string, string> = {
  email: "Email",
  emailPass: "Email",
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
  frieghter: "Freighter",
  albedo: "Albedo",
  rabet: "Rabet",
  hana: "Hana",
  xBull: "xBull",
  metamask: "MetaMask",
  walletConnect: "WalletConnect",
  hotWallet: "HOT Wallet",
};

/** Admin › Users: everyone who joined this platform (every platform on Wadzzo) — fans, brands and admins. */
export default function UsersPage() {
  const { isSuperAdmin } = usePortalAccess();
  const [platformId, setPlatformId] = useState<string>();
  const [search, setSearch] = useState("");
  const onSearch = useCallback((q: string) => setSearch(q), []);
  const [deleting, setDeleting] = useState<User | null>(null);
  const utils = api.useUtils();

  const users = api.admin.user.getUsers.useInfiniteQuery(
    { search: search || undefined, platformId, limit: 30 },
    { getNextPageParam: (l) => l.nextCursor, refetchOnWindowFocus: false },
  );
  const rows = users.data?.pages.flatMap((p) => p.users);
  const total = users.data?.pages[0]?.total;

  const remove = api.admin.user.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      setDeleting(null);
      void utils.admin.user.getUsers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const columns: Column<User>[] = [
    {
      id: "user",
      header: "User",
      skeleton: "person",
      cell: (u) => <Person name={u.name} image={u.image} id={u.id} sub={u.email ?? (u.name ? <span className="font-mono">{addrShort(u.id, 6)}</span> : "Wallet account")} />,
    },
    {
      id: "role",
      header: "Role",
      skeleton: "pill",
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          {u.Admin.length > 0 && (
            <StatusPill tone="info" icon={Shield}>
              Admin
            </StatusPill>
          )}
          {u.creator ? (
            <StatusPill tone={u.creator.approved === false ? "danger" : u.creator.approved ? "success" : "warning"} icon={Store}>
              Brand{u.creator.approved === null ? " (pending)" : u.creator.approved === false ? " (banned)" : ""}
            </StatusPill>
          ) : (
            u.Admin.length === 0 && <StatusPill>Fan</StatusPill>
          )}
        </span>
      ),
    },
    {
      id: "collected",
      header: "Collected",
      align: "right",
      skeleton: "number",
      cell: (u) => <span className="tabular-nums">{u._count.LocationConsumer.toLocaleString()}</span>,
    },
    {
      id: "signup",
      header: "Signed up with",
      skeleton: "short",
      cell: (u) => <span className="text-muted-foreground">{u.firstSignUpMethod ? (SIGNUP[u.firstSignUpMethod] ?? u.firstSignUpMethod) : "—"}</span>,
    },
    {
      id: "platform",
      header: "Signed up on",
      skeleton: "short",
      cell: (u) => <span className="text-muted-foreground">{u.signupPlatform.name}</span>,
    },
    {
      id: "joined",
      header: "Joined",
      skeleton: "short",
      cell: (u) =>
        u.joinedAt ? (
          <span className="whitespace-nowrap text-muted-foreground" title={new Date(u.joinedAt).toLocaleString()}>
            {formatDistanceToNow(new Date(u.joinedAt), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description={total !== undefined ? `${total.toLocaleString()} accounts — fans, brands and admins.` : "Everyone with an account here — fans, brands and admins."}
      />

      <Toolbar className="mt-6">
        <SearchInput onSearch={onSearch} placeholder="Search name, email or wallet" />
        <PlatformFilter value={platformId} onChange={setPlatformId} />
      </Toolbar>

      <DataTable
        className="mt-4"
        label="Users"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={users.isPending}
        error={users.error?.message}
        onRetry={() => void users.refetch()}
        rowHref={(u) => `/admin/users/${u.id}`}
        actions={(u) => [
          { label: "View details", icon: ExternalLink, href: `/admin/users/${u.id}` },
          // Accounts are shared by every platform: only Wadzzo admins delete them.
          ...(isSuperAdmin ? [{ label: "Delete user", icon: Trash2, destructive: true, separator: true, onSelect: () => setDeleting(u) }] : []),
        ]}
        empty={{ icon: Users, title: search ? "No users match" : "No users yet", description: search ? "Try a name, email or wallet." : undefined }}
        footer={
          users.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void users.fetchNextPage()} disabled={users.isFetchingNextPage}>
                {users.isFetchingNextPage && <Spinner className="size-4" />}
                {users.isFetchingNextPage ? "Loading…" : `Load more${total && rows ? ` (${(total - rows.length).toLocaleString()} left)` : ""}`}
              </Button>
            </div>
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}
        title={`Delete ${deleting?.name ?? deleting?.email ?? "this user"}?`}
        description={
          deleting?.creator
            ? "This account owns a brand — the brand and everything it made are deleted too. This can't be undone."
            : "Their account, collections and activity are removed. This can't be undone."
        }
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </PageBody>
  );
}
