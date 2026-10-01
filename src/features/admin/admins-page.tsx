"use client";

import { format } from "date-fns";
import { Copy, Loader2, Shield, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Input } from "~/components/shadcn/ui/input";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { DataTable, type Column } from "~/ui/data-table";
import { Field } from "~/ui/form-page";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Person } from "~/ui/person";
import { StatusPill } from "~/ui/status-pill";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

type Admin = RouterOutputs["wallate"]["admin"]["admins"][number];
const PUBKEY = /^G[A-Z2-7]{55}$/;

/** Admin › Admins: who can approve brands and manage the platform. */
export default function AdminsPage() {
  const session = useSession();
  const me = session.data?.user.id;
  const admins = api.wallate.admin.admins.useQuery();
  const utils = api.useUtils();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Admin | null>(null);

  const remove = api.wallate.admin.deleteAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin access removed");
      setRemoving(null);
      void utils.wallate.admin.admins.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const columns: Column<Admin>[] = [
    {
      id: "admin",
      header: "Admin",
      skeleton: "person",
      cell: (a) => (
        <div className="flex items-center gap-2">
          <Person name={a.user.name} image={a.user.image} id={a.id} sub={a.user.email ?? <span className="font-mono">{addrShort(a.id, 6)}</span>} />
          {a.id === me && <StatusPill tone="info">You</StatusPill>}
        </div>
      ),
    },
    {
      id: "key",
      header: "Public key",
      skeleton: "mono",
      cell: (a) => (
        <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="font-mono text-xs text-muted-foreground">{addrShort(a.id, 8)}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy public key"
            onClick={() => void navigator.clipboard.writeText(a.id).then(() => toast.success("Public key copied"))}
          >
            <Copy />
          </Button>
        </span>
      ),
    },
    {
      id: "since",
      header: "Admin since",
      skeleton: "short",
      cell: (a) => <span className="whitespace-nowrap text-muted-foreground">{format(new Date(a.joinedAt), "MMM d, yyyy")}</span>,
    },
  ];

  const count = admins.data?.length ?? 0;

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Admins"
        description="Admins approve brands, manage users and see every map. Keep this list short."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add admin
          </Button>
        }
      />

      <DataTable
        className="mt-6"
        label="Admins"
        columns={columns}
        rows={admins.data}
        rowKey={(a) => a.id}
        loading={admins.isPending}
        skeletonRows={4}
        error={admins.error?.message}
        onRetry={() => void admins.refetch()}
        actions={(a) => [
          {
            label: a.id === me ? "You can't remove yourself" : count <= 1 ? "The last admin can't be removed" : "Remove admin access",
            icon: Trash2,
            destructive: true,
            disabled: a.id === me || count <= 1,
            onSelect: () => setRemoving(a),
          },
        ]}
        empty={{ icon: Shield, title: "No admins", description: "Add someone's public key to make them an admin." }}
      />

      {adding && <AddAdminDialog onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && !remove.isPending && setRemoving(null)}
        title={`Remove ${removing?.user.name ?? addrShort(removing?.id, 5)} as admin?`}
        description="They keep their account but lose access to the Admin section right away."
        confirmLabel="Remove access"
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </PageBody>
  );
}

function AddAdminDialog({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string>();
  const add = api.wallate.admin.makeAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin added");
      void utils.wallate.admin.admins.invalidate();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!PUBKEY.test(k)) return setError("A Stellar public key: 56 characters starting with G.");
    add.mutate(k);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !add.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-hud">
              <ShieldCheck className="size-5 text-primary" /> Add an admin
            </DialogTitle>
            <DialogDescription>They need a Wadzzo account already — ask them to sign in once, then paste their public key.</DialogDescription>
          </DialogHeader>
          <div className="my-5">
            <Field label="Public key" htmlFor="admin-key" required error={error}>
              <Input
                id="admin-key"
                value={key}
                autoFocus
                spellCheck={false}
                onChange={(e) => {
                  setKey(e.target.value.toUpperCase());
                  setError(undefined);
                }}
                placeholder="GABC…"
                className="font-mono text-xs"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="animate-spin" />}
              Add admin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
