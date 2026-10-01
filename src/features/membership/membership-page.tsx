"use client";

import type { Subscription } from "@prisma/client";
import { Crown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Preview } from "~/components/common/quill-preview";
import { Editor } from "~/components/common/quill-editor";
import { plainText } from "~/components/common/enhance-button";
import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Input } from "~/components/shadcn/ui/input";
import { BADWORDS } from "~/utils/banned-word";
import { AiTextButton } from "~/ui/ai/ai-text";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Field } from "~/ui/form-page";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { api } from "~/utils/api";

export type SubscriptionType = Omit<Subscription, "issuerPrivate">;
const MAX_TIERS = 3;

/** Membership: up to three tiers fans unlock by holding your page asset. */
export default function MembershipPage() {
  return (
    <PageBody>
      <PageHeader
        eyebrow="Commerce"
        title="Membership"
        description={`Tiers fans unlock by holding your page asset. Use them to gate posts and pins. Up to ${MAX_TIERS} tiers.`}
      />
      <div className="mt-6">
        <MembershipTiers pageAssetHref="/settings?tab=page-asset" />
      </div>
    </PageBody>
  );
}

/**
 * The tiers themselves — list, add, edit, delete. Used on /membership and in
 * Settings; `pageAssetHref` is where to send a brand without a page asset.
 */
export function MembershipTiers({ pageAssetHref, onSetUpPageAsset }: { pageAssetHref?: string; onSetUpPageAsset?: () => void }) {
  const tiers = api.fan.member.getAllMembership.useQuery({});
  const creator = api.fan.creator.meCreator.useQuery();
  const pageAsset = api.fan.creator.getCreatorPageAsset.useQuery();
  const [editing, setEditing] = useState<SubscriptionType | "new" | null>(null);
  const [deleting, setDeleting] = useState<SubscriptionType | null>(null);

  const code = pageAsset.data?.code ?? creator.data?.customPageAssetCodeIssuer?.split("-")[0];
  const loadingAsset = pageAsset.isLoading || creator.isLoading;
  const list = [...(tiers.data ?? [])].sort((a, b) => a.price - b.price);
  const canAdd = Boolean(code) && list.length < MAX_TIERS;

  const utils = api.useUtils();
  const remove = api.fan.member.deleteTier.useMutation({
    onSuccess: () => {
      toast.success("Tier deleted");
      setDeleting(null);
      void utils.fan.member.getAllMembership.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addButton = (
    <Button onClick={() => setEditing("new")} disabled={!canAdd}>
      <Plus /> New tier
    </Button>
  );
  const setUp = onSetUpPageAsset ? (
    <Button onClick={onSetUpPageAsset}>Set up page asset</Button>
  ) : (
    <Button asChild>
      <Link href={pageAssetHref ?? "/settings?tab=page-asset"}>Set up page asset</Link>
    </Button>
  );

  return (
    <>
      {tiers.isLoading || loadingAsset ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : tiers.isError ? (
        <ErrorState message={tiers.error.message} onRetry={() => void tiers.refetch()} />
      ) : !code ? (
        <EmptyState
          icon={Crown}
          title="Set up your page asset first"
          description="Membership tiers are priced in your page asset. Create a new one or connect one you already have, then add tiers."
          action={setUp}
        />
      ) : list.length === 0 ? (
        <EmptyState icon={Crown} title="No tiers yet" description="Start with one tier — e.g. a fan club that unlocks members-only posts." action={addButton} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {list.length} of {MAX_TIERS} tiers · priced in <b className="font-mono text-foreground">{code}</b>
            </p>
            {addButton}
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {list.map((t, i) => (
              <li key={t.id} className="flex flex-col rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-hud text-xs font-semibold uppercase tracking-wide text-primary">Tier {i + 1}</p>
                    <h3 className="mt-1 font-hud text-xl font-semibold">{t.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <p className="mt-3">
                  <span className="font-hud text-3xl font-semibold tabular-nums">{t.price}</span>{" "}
                  <span className="text-sm text-muted-foreground">{code} to hold</span>
                </p>
                <div className="prose prose-sm mt-4 max-w-none border-t pt-4 dark:prose-invert">
                  <Preview value={t.features} />
                </div>
              </li>
            ))}
            {canAdd && (
              <li>
                <button
                  type="button"
                  onClick={() => setEditing("new")}
                  className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Plus className="size-5" /> Add a tier
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      {editing && <TierDialog tier={editing === "new" ? null : editing} code={code ?? ""} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the ${deleting?.name} tier?`}
        description="Posts and pins gated to this tier will need a new tier."
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate({ id: deleting.id })}
      />
    </>
  );
}

function TierDialog({ tier, code, onClose }: { tier: SubscriptionType | null; code: string; onClose: () => void }) {
  const [name, setNameRaw] = useState(tier?.name ?? "");
  const [price, setPriceRaw] = useState(tier ? String(tier.price) : "");
  const [features, setFeaturesRaw] = useState(tier?.features ?? "");
  const [errors, setErrors] = useState<Partial<Record<"name" | "price" | "features", string>>>({});
  // Editing a field clears the previous save attempt's errors.
  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setErrors({});
  };
  const setName = edited(setNameRaw);
  const setPrice = edited(setPriceRaw);
  const setFeatures = edited(setFeaturesRaw);

  const utils = api.useUtils();
  const done = (msg: string) => {
    toast.success(msg);
    void utils.fan.member.getAllMembership.invalidate();
    onClose();
  };
  const create = api.fan.member.createMembership.useMutation({ onSuccess: () => done("Tier created"), onError: (e) => toast.error(e.message) });
  const update = api.fan.member.editTierModal.useMutation({ onSuccess: () => done("Tier updated"), onError: (e) => toast.error(e.message) });
  const saving = create.isPending || update.isPending;

  const save = () => {
    const n = name.trim();
    const p = Number(price);
    const e: typeof errors = {};
    if (n.length < 4 || n.length > 12) e.name = "4–12 characters";
    else if (!/^\w+$/.test(n)) e.name = "One word — letters, numbers or _";
    else if (BADWORDS.some((w) => n.includes(w))) e.name = "That name isn't allowed";
    if (!Number.isFinite(p) || p < 1) e.price = "At least 1";
    if (plainText(features).length < 20) e.features = "Describe the perks in at least 20 characters";
    setErrors(e);
    if (Object.keys(e).length) return;
    if (tier) update.mutate({ id: tier.id, name: n, price: p, featureDescription: features });
    else create.mutate({ name: n, price: p, featureDescription: features });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-hud">{tier ? `Edit ${tier.name}` : "New tier"}</DialogTitle>
          <DialogDescription>Fans holding at least this much {code} get these perks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="tier-name" required error={errors.name} hint="One word, e.g. Insider">
              <Input id="tier-name" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={`Price (${code})`} htmlFor="tier-price" required error={errors.price}>
              <Input id="tier-price" type="number" min={1} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          <Field
            label="Perks"
            required
            error={errors.features}
            action={<AiTextButton form="post" field="membership tier perks" format="html" value={features} context={{ tier: name, price: price ? `${price} ${code}` : "" }} onChange={setFeatures} />}
          >
            <Editor value={features} onChange={setFeatures} placeholder="Members-only posts, early access to drops, a monthly shout-out…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {tier ? "Save changes" : "Create tier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
