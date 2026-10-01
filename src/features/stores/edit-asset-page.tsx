"use client";

import { Box, Copy, DollarSign, Film, Image as ImageIcon, Loader2, Lock, Music, Package, Tag } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { EmptyState } from "~/ui/empty-state";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { FormSkeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
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
  const a = item.asset;
  const media = MEDIA[a.mediaType] ?? MEDIA.IMAGE;
  const copies = api.marketplace.market.getMarketAssetAvailableCopy.useQuery({ id: item.id }, { refetchOnWindowFocus: false });

  const [price, setPrice] = useState(String(item.price));
  const [priceUSD, setPriceUSD] = useState(String(item.priceUSD));
  const [errors, setErrors] = useState<Partial<Record<"price" | "priceUSD", string>>>({});

  const utils = api.useUtils();
  const update = api.fan.asset.updateAsset.useMutation({
    onSuccess: () => {
      void utils.fan.asset.getMyMarketAsset.invalidate(item.id);
      void utils.marketplace.market.getACreatorNfts.invalidate();
      toast.success("Price updated");
      router.push("/stores");
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(price);
    const u = Number(priceUSD);
    const next: typeof errors = {};
    if (!Number.isFinite(p) || p < 0) next.price = "Enter a price of 0 or more";
    if (!Number.isFinite(u) || u < 0) next.priceUSD = "Enter a price of 0 or more";
    setErrors(next);
    if (Object.keys(next).length) return;
    update.mutate({ assetId: item.id, price: p, priceUSD: u });
  };

  const left = copies.data;
  const dirty = Number(price) !== item.price || Number(priceUSD) !== item.priceUSD;

  return (
    <FormPage
      title={a.name}
      description="What fans get when they buy it, and what it costs."
      back={{ href: "/stores", label: "Stores" }}
      onSubmit={submit}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={() => router.push("/stores")}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending || !dirty}>
            {update.isPending && <Loader2 className="animate-spin" />} Save price
          </Button>
        </>
      }
      aside={
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="relative aspect-square bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.thumbnail} alt="" className="size-full object-cover" />
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
