"use client";

import type { Subscription } from "@prisma/client";
import { Check, Crown, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Input } from "~/components/shadcn/ui/input";
import { Switch } from "~/components/shadcn/ui/switch";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { cn } from "~/lib/utils";
import { BADWORDS } from "~/utils/banned-word";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Field } from "~/ui/form-page";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { api } from "~/utils/api";

export type SubscriptionType = Omit<Subscription, "issuerPrivate" | "platformId">;

const TIER_COLORS = ["green", "blue", "purple", "gold", "rose", "slate"] as const;
type TierColor = (typeof TIER_COLORS)[number];
/** The same palette names the fan apps use for tier colors. */
const SWATCH: Record<TierColor, { bar: string }> = {
  green: { bar: "bg-emerald-500" },
  blue: { bar: "bg-sky-500" },
  purple: { bar: "bg-violet-500" },
  gold: { bar: "bg-amber-500" },
  rose: { bar: "bg-rose-500" },
  slate: { bar: "bg-slate-500" },
};
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
              <li key={t.id} className={cn("relative flex flex-col overflow-hidden rounded-xl border bg-card p-5", t.popular && "border-primary/50", !t.isActive && "opacity-70")}>
                <span className={cn("absolute inset-x-0 top-0 h-1", SWATCH[t.color as TierColor]?.bar ?? SWATCH.green.bar)} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-hud text-xs font-semibold uppercase tracking-wide text-primary">
                      Tier {i + 1}
                      {t.popular && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                          <Star className="size-3" /> Most popular
                        </span>
                      )}
                      {!t.isActive && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">Hidden</span>}
                    </p>
                    <h3 className="mt-1 truncate font-hud text-xl font-semibold">{t.name}</h3>
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
                  <span className="font-hud text-3xl font-semibold tabular-nums">{t.price.toLocaleString("en-US")}</span>{" "}
                  <span className="text-sm text-muted-foreground">{code} to hold</span>
                </p>
                {t.description && <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>}
                <ul className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
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

const MAX_PERKS = 8;

function TierDialog({ tier, code, onClose }: { tier: SubscriptionType | null; code: string; onClose: () => void }) {
  const [name, setName] = useState(tier?.name ?? "");
  const [price, setPrice] = useState(tier ? String(tier.price) : "");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [perks, setPerks] = useState<string[]>(tier?.features.length ? tier.features : [""]);
  const [color, setColor] = useState<TierColor>((tier?.color as TierColor) ?? "green");
  const [popular, setPopular] = useState(tier?.popular ?? false);
  const [isActive, setIsActive] = useState(tier?.isActive ?? true);
  const [errors, setErrors] = useState<Partial<Record<"name" | "price" | "description" | "features", string>>>({});

  const utils = api.useUtils();
  const done = (msg: string) => {
    toast.success(msg);
    void utils.fan.member.getAllMembership.invalidate();
    onClose();
  };
  const create = api.fan.member.createMembership.useMutation({ onSuccess: () => done("Tier created"), onError: (e) => toast.error(e.message) });
  const update = api.fan.member.editTierModal.useMutation({ onSuccess: () => done("Tier updated"), onError: (e) => toast.error(e.message) });
  const saving = create.isPending || update.isPending;

  const setPerk = (i: number, v: string) => setPerks((ps) => ps.map((p, j) => (j === i ? v : p)));
  const save = () => {
    const n = name.trim();
    const p = Number(price);
    const features = perks.map((f) => f.trim()).filter(Boolean);
    const e: typeof errors = {};
    if (n.length < 2 || n.length > 24) e.name = "2–24 characters";
    else if (BADWORDS.some((w) => n.toLowerCase().includes(w))) e.name = "That name isn't allowed";
    if (!Number.isFinite(p) || p < 1) e.price = "At least 1";
    if (description.trim().length > 160) e.description = "Keep it under 160 characters";
    if (!features.length) e.features = "Add at least one perk";
    else if (features.some((f) => f.length > 80)) e.features = "Keep each perk under 80 characters";
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = { name: n, price: p, description: description.trim(), features, color, popular, isActive };
    if (tier) update.mutate({ id: tier.id, ...data });
    else create.mutate(data);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-hud">{tier ? `Edit ${tier.name}` : "New tier"}</DialogTitle>
          <DialogDescription>Fans holding at least this much {code} get these perks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="tier-name" required error={errors.name} hint="e.g. Insider, VIP">
              <Input id="tier-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={`Price (${code})`} htmlFor="tier-price" required error={errors.price} hint="Tokens a fan must hold">
              <Input id="tier-price" type="number" min={1} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          <Field label="Description" htmlFor="tier-desc" error={errors.description} hint={`${description.length}/160`}>
            <Textarea id="tier-desc" value={description} maxLength={160} rows={2} onChange={(e) => setDescription(e.target.value)} placeholder="Who this tier is for" className="resize-none" />
          </Field>
          <Field label="Perks" required error={errors.features} hint={`One per line, up to ${MAX_PERKS}`}>
            <div className="space-y-2">
              {perks.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={p} maxLength={80} onChange={(e) => setPerk(i, e.target.value)} placeholder={i === 0 ? "Members-only posts" : "Another perk"} aria-label={`Perk ${i + 1}`} />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove perk ${i + 1}`} disabled={perks.length === 1} onClick={() => setPerks((ps) => ps.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              {perks.length < MAX_PERKS && (
                <Button type="button" variant="outline" size="sm" onClick={() => setPerks((ps) => [...ps, ""])}>
                  <Plus /> Add perk
                </Button>
              )}
            </div>
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tier color">
              {TIER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  title={c}
                  onClick={() => setColor(c)}
                  className={cn("flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow", SWATCH[c].bar, color === c && "ring-2 ring-foreground")}
                >
                  {color === c && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </Field>
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">Most popular</span>
                <span className="text-xs text-muted-foreground">Highlights this tier (only one at a time)</span>
              </span>
              <Switch checked={popular} onCheckedChange={setPopular} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">Active</span>
                <span className="text-xs text-muted-foreground">Hidden tiers aren&apos;t shown to fans</span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
          </div>
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
