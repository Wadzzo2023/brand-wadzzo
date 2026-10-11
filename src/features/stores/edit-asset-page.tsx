"use client";

import { Box, Copy, DollarSign, Film, Image as ImageIcon, Loader2, Lock, Music, Package, Pencil, Tag } from "lucide-react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { EmptyState } from "~/ui/empty-state";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { FormSkeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { Dropzone } from "~/ui/upload/dropzone";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

const ThreeD = dynamic(() => import("~/components/3d-model/model-show"), { ssr: false });

type Item = RouterOutputs["fan"]["asset"]["getMyMarketAsset"];
const code = PLATFORM_ASSET.code.toUpperCase();
const MEDIA = {
  IMAGE: { label: "Image", icon: ImageIcon },
  VIDEO: { label: "Video", icon: Film },
  MUSIC: { label: "Music", icon: Music },
  THREE_D: { label: "3D model", icon: Box },
} as const;

/** Stores › one item: what fans get, and its price. */
export default function EditAssetPage({ id }: { id: number }) {
  const item = api.fan.asset.getMyMarketAsset.useQuery(id, { enabled: Number.isFinite(id), retry: false });
  if (item.isPending && Number.isFinite(id)) return <FormSkeleton sections={2} />;
  if (!item.data)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Package}
          title="Store item not found"
          description={item.error?.message}
          action={
            <Button asChild>
              <Link href="/stores">Back to Stores</Link>
            </Button>
          }
        />
      </div>
    );
  return <EditForm item={item.data} />;
}

function EditForm({ item }: { item: Item }) {
  const router = useRouter();
  const session = useSession();
  const a = item.asset;
  const media = MEDIA[a.mediaType] ?? MEDIA.IMAGE;
  const copies = api.marketplace.market.getMarketAssetAvailableCopy.useQuery({ id: item.id }, { refetchOnWindowFocus: false });
  // Brands edit their own items fully; admin-placed items only by price.
  const mine = a.creatorId != null && a.creatorId === session.data?.user.id;

  const [name, setName] = useState(a.name);
  const [description, setDescription] = useState(a.description ?? "");
  const [thumbnail, setThumbnail] = useState(a.thumbnail);
  const [price, setPrice] = useState(String(item.price));
  const [priceUSD, setPriceUSD] = useState(String(item.priceUSD));
  const [openEdition, setOpenEdition] = useState(a.limit == null);
  const [limit, setLimit] = useState(a.limit != null ? String(a.limit) : "");
  const [royalty, setRoyalty] = useState(String(a.royaltyPercent));
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "price" | "priceUSD" | "limit" | "royalty", string>>>({});

  const utils = api.useUtils();
  const onSaved = () => {
    void utils.fan.asset.getMyMarketAsset.invalidate(item.id);
    void utils.marketplace.market.getACreatorNfts.invalidate();
    toast.success("Item updated");
    router.push("/stores");
  };
  const updatePrice = api.fan.asset.updateAsset.useMutation({ onSuccess: onSaved, onError: (e) => toast.error(e.message) });
  const updateItem = api.fan.item.update.useMutation({ onSuccess: onSaved, onError: (e) => toast.error(e.message) });
  const saving = updatePrice.isPending || updateItem.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(price);
    const u = Number(priceUSD);
    const l = openEdition ? null : Number(limit);
    const r = Number(royalty);
    const next: typeof errors = {};
    if (!Number.isFinite(p) || p < 0) next.price = "Enter a price of 0 or more";
    if (!Number.isFinite(u) || u < 0) next.priceUSD = "Enter a price of 0 or more";
    if (mine) {
      if (!name.trim()) next.name = "Give it a name";
      if (l != null && !(Number.isInteger(l) && l >= 1)) next.limit = "At least 1";
      else if (l != null && l < a.mintedCount) next.limit = `${a.mintedCount} copies already exist`;
      if (!(r >= 0 && r <= 50)) next.royalty = "0–50%";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    if (mine) updateItem.mutate({ assetId: a.id, name: name.trim(), description: description.trim(), thumbnail, price: p, priceUSD: u, limit: l, royaltyPercent: r });
    else updatePrice.mutate({ assetId: item.id, price: p, priceUSD: u });
  };

  const left = copies.data;
  const dirty =
    Number(price) !== item.price ||
    Number(priceUSD) !== item.priceUSD ||
    (mine && (name !== a.name || description !== (a.description ?? "") || thumbnail !== a.thumbnail || openEdition !== (a.limit == null) || (!openEdition && Number(limit) !== a.limit) || Number(royalty) !== a.royaltyPercent));

  return (
    <FormPage
      title={a.name}
      description={mine ? "Edit the details, supply, royalty and price." : "What fans get when they buy it, and what it costs."}
      back={{ href: "/stores", label: "Stores" }}
      onSubmit={submit}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={() => router.push("/stores")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || uploading || !dirty}>
            {saving && <Loader2 className="animate-spin" />} {mine ? "Save changes" : "Save price"}
          </Button>
        </>
      }
      aside={
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="relative aspect-square bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnail} alt="" className="size-full object-cover" />
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
              <media.icon className="size-3.5" /> {media.label}
            </span>
            {a.tier && (
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
                <Lock className="size-3" /> {a.tier.name}
              </span>
            )}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-hud text-lg font-semibold">{Number(price) || 0} {code}</p>
              <p className="text-sm text-muted-foreground">${Number(priceUSD) || 0}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="label-caps">Available</dt>
                <dd className="mt-0.5">{left === undefined ? "…" : left === 0 ? <StatusPill tone="danger">Sold out</StatusPill> : `${left.toLocaleString()} ${left === 1 ? "copy" : "copies"}`}</dd>
              </div>
              <div>
                <dt className="label-caps">Edition</dt>
                <dd className="mt-0.5">{a.limit ? `${a.limit.toLocaleString()} total` : "Unlimited"}</dd>
              </div>
              <div>
                <dt className="label-caps">Minted</dt>
                <dd className="mt-0.5">{a.mintedCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="label-caps">Royalty</dt>
                <dd className="mt-0.5">{a.royaltyPercent}%</dd>
              </div>
              <div>
                <dt className="label-caps">Code</dt>
                <dd className="mt-0.5 font-mono text-xs">{a.code}</dd>
              </div>
              <div>
                <dt className="label-caps">Issuer</dt>
                <dd className="mt-0.5">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(a.issuer).then(() => toast.success("Issuer copied"))}
                    className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    {addrShort(a.issuer, 4)} <Copy className="size-3" />
                  </button>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      }
    >
      {mine && (
        <FormSection title="Details" icon={Pencil} description="What everyone sees in your store.">
          <Field label="Name" htmlFor="name" required error={errors.name}>
            <Input id="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" rows={4} className="resize-none" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Cover" hint="The store card image. PNG or JPG.">
            <Dropzone endpoint="imageUploader" shape="square" className="max-w-56" accept="image/png,image/jpeg" value={thumbnail} onUploadingChange={setUploading} onChange={(url) => url && setThumbnail(url)} />
          </Field>
        </FormSection>
      )}

      {mine && (
        <FormSection title="Supply & royalty" icon={Package} description="Supply can't go below the copies already minted. Royalty applies to future resales.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supply" htmlFor="limit" error={errors.limit} hint={`${a.mintedCount.toLocaleString()} minted so far`}>
              <Input id="limit" type="number" min={Math.max(1, a.mintedCount)} step={1} disabled={openEdition} placeholder={openEdition ? "Unlimited" : undefined} value={openEdition ? "" : limit} onChange={(e) => setLimit(e.target.value)} />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={openEdition} onChange={(e) => setOpenEdition(e.target.checked)} className="size-4 accent-primary" /> Open edition (no limit)
              </label>
            </Field>
            <Field label="Royalty" htmlFor="royalty" error={errors.royalty} hint="Your share of every resale, 0–50%.">
              <div className="relative">
                <Input id="royalty" type="number" min={0} max={50} step="any" className="pr-8" value={royalty} onChange={(e) => setRoyalty(e.target.value)} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          </div>
        </FormSection>
      )}

      <FormSection title="Price" icon={DollarSign} description="Fans pay in either currency. Changing the price doesn't affect copies already sold.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Price in ${code}`} htmlFor="price" required error={errors.price}>
            <Input id="price" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Price in USD" htmlFor="priceUSD" required error={errors.priceUSD} hint="For card payments.">
            <Input id="priceUSD" type="number" min={0} step="any" inputMode="decimal" value={priceUSD} onChange={(e) => setPriceUSD(e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="What fans get" icon={Tag} description={a.tier ? `Only members of “${a.tier.name}” can open it.` : "Anyone who buys it can open it."}>
        {a.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{a.description}</p>}
        <div className="overflow-hidden rounded-lg border bg-muted">
          {a.mediaType === "VIDEO" ? (
            <video src={a.mediaUrl} poster={a.thumbnail} controls className="aspect-video w-full bg-black" />
          ) : a.mediaType === "MUSIC" ? (
            <div className="flex items-center gap-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.thumbnail} alt="" className="size-16 rounded-md object-cover" />
              <audio src={a.mediaUrl} controls className="w-full" />
            </div>
          ) : a.mediaType === "THREE_D" ? (
            <div className="h-80">
              <ThreeD url={a.mediaUrl} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.mediaUrl} alt={a.name} className="max-h-[480px] w-full object-contain" />
          )}
        </div>
      </FormSection>
    </FormPage>
  );
}
