"use client";

import { Building2, Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Input } from "~/components/shadcn/ui/input";
import { Switch } from "~/components/shadcn/ui/switch";
import { DataTable, type Column } from "~/ui/data-table";
import { Field } from "~/ui/form-page";
import { PageBody, PageHeader } from "~/ui/page-header";
import { StatusPill } from "~/ui/status-pill";
import { api, type RouterOutputs } from "~/utils/api";

type Platform = RouterOutputs["admin"]["platforms"]["list"][number];
type Form = {
  id: string;
  name: string;
  webUrl: string;
  brandUrl: string;
  assetCode: string;
  assetIssuer: string;
  active: boolean;
};

const EMPTY: Form = { id: "", name: "", webUrl: "https://web.", brandUrl: "https://brand.", assetCode: "", assetIssuer: "", active: true };

/** Admin › Platforms (Wadzzo only): every white-label deployment sharing this database. */
export default function PlatformsPage() {
  const platforms = api.admin.platforms.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const [editing, setEditing] = useState<{ form: Form; isNew: boolean } | null>(null);

  const n = (v: number) => <span className="tabular-nums">{v.toLocaleString()}</span>;
  const columns: Column<Platform>[] = [
    {
      id: "platform",
      header: "Platform",
      skeleton: "person",
      cell: (p) => (
        <div>
          <p className="font-medium">
            {p.name} {p.isRoot && <StatusPill tone="info">Parent</StatusPill>}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{p.id}</p>
        </div>
      ),
    },
    {
      id: "sites",
      header: "Sites",
      skeleton: "mono",
      cell: (p) => (
        <div className="text-xs text-muted-foreground">
          <p>{p.webUrl}</p>
          <p>{p.brandUrl}</p>
        </div>
      ),
    },
    { id: "users", header: "Users", align: "right", skeleton: "number", cell: (p) => n(p.stats.users) },
    { id: "brands", header: "Brands", align: "right", skeleton: "number", cell: (p) => n(p.stats.brands) },
    { id: "pins", header: "Pins", align: "right", skeleton: "number", cell: (p) => n(p.stats.pins) },
    { id: "claims", header: "Collections", align: "right", skeleton: "number", cell: (p) => n(p.stats.claims) },
    { id: "admins", header: "Admins", align: "right", skeleton: "number", cell: (p) => n(p.stats.admins) },
    {
      id: "status",
      header: "Status",
      skeleton: "pill",
      cell: (p) => <StatusPill tone={p.active ? "success" : "warning"}>{p.active ? "Active" : "Inactive"}</StatusPill>,
    },
  ];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Platforms"
        description="Partner deployments sharing Wadzzo's data. Each one's admins and brands only see their own platform; you see all of them."
        actions={
          <Button onClick={() => setEditing({ form: EMPTY, isNew: true })}>
            <Plus /> New platform
          </Button>
        }
      />

      <DataTable
        className="mt-6"
        label="Platforms"
        columns={columns}
        rows={platforms.data}
        rowKey={(p) => p.id}
        loading={platforms.isPending}
        skeletonRows={3}
        error={platforms.error?.message}
        onRetry={() => void platforms.refetch()}
        actions={(p) => [
          {
            label: "Edit",
            icon: Pencil,
            onSelect: () =>
              setEditing({
                isNew: false,
                form: { id: p.id, name: p.name, webUrl: p.webUrl, brandUrl: p.brandUrl, assetCode: p.assetCode ?? "", assetIssuer: p.assetIssuer ?? "", active: p.active },
              }),
          },
        ]}
        empty={{ icon: Building2, title: "No platforms", description: "Run the multi-platform migration to create Wadzzo's own platform." }}
      />

      {editing && <PlatformDialog initial={editing.form} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </PageBody>
  );
}

function PlatformDialog({ initial, isNew, onClose }: { initial: Form; isNew: boolean; onClose: () => void }) {
  const utils = api.useUtils();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  const save = api.admin.platforms.save.useMutation({
    onSuccess: () => {
      toast.success(isNew ? "Platform created" : "Platform saved");
      void utils.admin.platforms.invalidate();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setError(undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      ...form,
      isNew,
      assetCode: form.assetCode.trim() || null,
      assetIssuer: form.assetIssuer.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="font-hud">{isNew ? "New platform" : `Edit ${initial.name}`}</DialogTitle>
            <DialogDescription>
              The slug must match the <span className="font-mono">PLATFORM_SLUG</span> env of the platform&apos;s deployments.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 grid gap-4">
            <Field label="Slug" htmlFor="pf-id" required>
              <Input id="pf-id" value={form.id} onChange={set("id")} disabled={!isNew} placeholder="clintoncounty" className="font-mono" />
            </Field>
            <Field label="Name" htmlFor="pf-name" required>
              <Input id="pf-name" value={form.name} onChange={set("name")} placeholder="Clinton County" />
            </Field>
            <Field label="AR web URL" htmlFor="pf-web" required>
              <Input id="pf-web" value={form.webUrl} onChange={set("webUrl")} placeholder="https://web.clintoncounty-ia.gov" />
            </Field>
            <Field label="Brand panel URL" htmlFor="pf-brand" required>
              <Input id="pf-brand" value={form.brandUrl} onChange={set("brandUrl")} placeholder="https://brand.clintoncounty-ia.gov" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label="Asset code" htmlFor="pf-code">
                <Input id="pf-code" value={form.assetCode} onChange={set("assetCode")} className="font-mono" />
              </Field>
              <Field label="Asset issuer" htmlFor="pf-issuer">
                <Input id="pf-issuer" value={form.assetIssuer} onChange={set("assetIssuer")} placeholder="G…" className="font-mono text-xs" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /> Active
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {isNew ? "Create platform" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
