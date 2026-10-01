"use client";

import { Coins, DollarSign, FileText, Loader2 } from "lucide-react";
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
import { api, type RouterOutputs } from "~/utils/api";

type Listing = RouterOutputs["fan"]["asset"]["getMySellPageAsset"];
const platform = PLATFORM_ASSET.code.toUpperCase();
const back = { href: "/stores?tab=page-asset", label: "Page asset" };

/** Stores › Page asset › new listing, or edit one (`id`). */
export default function PageAssetSalePage({ id }: { id?: number }) {
  const editing = id !== undefined;
  const listing = api.fan.asset.getMySellPageAsset.useQuery(id ?? 0, { enabled: editing && Number.isFinite(id), retry: false });
  const overview = api.fan.creator.profileOverview.useQuery(undefined, { refetchOnWindowFocus: false });
  const balance = api.wallate.acc.getCreatorPageAssetBallances.useQuery(undefined, { refetchOnWindowFocus: false, retry: false });

  if (overview.isPending || (editing && listing.isPending)) return <FormSkeleton sections={2} />;
  const pa = overview.data?.pageAsset;
  if (!pa || pa.pending || (editing && !listing.data))
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState
          icon={Coins}
          title={!pa ? "No page asset yet" : pa.pending ? "Your page asset isn't issued yet" : "Listing not found"}
          description={!pa ? "Set it up in Settings first." : pa.pending ? "An admin issues it after approving it — then you can sell it." : listing.error?.message}
          action={
            <Button asChild>
              <Link href={!pa ? "/settings?tab=page-asset" : back.href}>{!pa ? "Set up page asset" : "Back to page asset"}</Link>
            </Button>
          }
        />
      </div>
    );
  if (listing.data?.isSold)
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <EmptyState icon={Coins} title="This bundle is sold" description="Sold listings can't be changed." action={<Button asChild><Link href={back.href}>Back to page asset</Link></Button>} />
      </div>
    );

  return (
    <SaleForm
      key={listing.data?.id ?? "new"}
      listing={listing.data}
      code={pa.code}
      art={pa.thumbnail ?? overview.data?.profileUrl ?? null}
      balance={balance.data ? Number(balance.data.balance) : undefined}
    />
  );
}

function SaleForm({ listing, code, art, balance }: { listing?: Listing; code: string; art: string | null; balance?: number }) {
  const router = useRouter();
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [amount, setAmount] = useState(listing ? String(listing.amountToSell) : "");
  const [price, setPrice] = useState(listing ? String(listing.price) : "");
  const [priceUSD, setPriceUSD] = useState(listing ? String(listing.priceUSD) : "");
  const [priceXLM, setPriceXLM] = useState(listing ? String(listing.priceXLM) : "0");
  const [errors, setErrors] = useState<Partial<Record<"amount" | "price" | "priceUSD" | "priceXLM", string>>>({});

  // When editing, the bundle's own tokens count as available again.
  const available = balance === undefined ? undefined : balance + (listing?.amountToSell ?? 0);

  const utils = api.useUtils();
  const done = (msg: string) => {
    void utils.fan.asset.getMyAssets.invalidate();
    toast.success(msg);
    router.push(back.href);
  };
  const create = api.fan.asset.sellPageAsset.useMutation({ onSuccess: () => done("Listing is live"), onError: (e) => toast.error(e.message) });
  const update = api.fan.asset.updateSellPageAsset.useMutation({ onSuccess: () => done("Listing updated"), onError: (e) => toast.error(e.message) });
  const busy = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    const p = Number(price);
    const u = Number(priceUSD);
    const x = Number(priceXLM || 0);
    const next: typeof errors = {};
    if (!Number.isInteger(n) || n <= 0) next.amount = "A whole number above 0";
    else if (available !== undefined && n > available) next.amount = `You have ${available.toLocaleString()} ${code} available`;
    if (!(p > 0)) next.price = "Above 0";
    if (!(u > 0)) next.priceUSD = "Above 0";
    if (!(x >= 0)) next.priceXLM = "0 or more";
    setErrors(next);
    if (Object.keys(next).length) return;
    const data = { title: title.trim() || `${n} ${code}`, description: description.trim() || undefined, amountToSell: n, price: p, priceUSD: u, priceXLM: x };
    if (listing) update.mutate({ id: listing.id, ...data });
    else create.mutate(data);
  };

  const n = Number(amount) || 0;

  return (
    <FormPage
      title={listing ? "Edit listing" : `Sell ${code}`}
      description={`Put a bundle of your page asset on sale. Fans pay in ${platform}, XLM or by card.`}
      back={back}
      onSubmit={submit}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={() => router.push(back.href)}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {listing ? "Save changes" : "Put on sale"}
          </Button>
        </>
      }
      aside={
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="relative h-40 overflow-hidden bg-foreground text-white">
            {art && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-70" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" aria-hidden />
            <p className="absolute top-3 left-4 text-[10px] font-semibold tracking-wider text-white/75 uppercase">Preview</p>
            <p className="absolute bottom-3 left-4 font-hud text-3xl font-bold tabular-nums">
              {n.toLocaleString()} <span className="text-base text-white/80">{code}</span>
            </p>
          </div>
          <div className="space-y-3 p-4">
            <p className="truncate font-semibold">{title.trim() || `${n.toLocaleString()} ${code}`}</p>
            {description.trim() && <p className="line-clamp-3 text-sm text-muted-foreground">{description}</p>}
            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2.5 text-center">
              {(
                [
                  [platform, price ? price : "—"],
                  ["USD", priceUSD ? `$${priceUSD}` : "—"],
                  ["XLM", priceXLM && priceXLM !== "0" ? priceXLM : "—"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{k}</dt>
                  <dd className="truncate text-sm font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Available to sell: <span className="font-medium text-foreground tabular-nums">{available === undefined ? "…" : `${available.toLocaleString()} ${code}`}</span>
            </p>
          </div>
        </section>
      }
    >
      <FormSection title="Bundle" icon={Coins} description="How many tokens fans get in one purchase.">
        <Field label={`Amount of ${code}`} htmlFor="amount" required error={errors.amount} hint={available !== undefined ? `Up to ${available.toLocaleString()}.` : undefined}>
          <div className="flex gap-2">
            <Input id="amount" type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" />
            {available !== undefined && available > 0 && (
              <Button type="button" variant="outline" onClick={() => setAmount(String(available))}>
                Max
              </Button>
            )}
          </div>
        </Field>
      </FormSection>

      <FormSection title="Price" icon={DollarSign} description="The price of the whole bundle in each currency.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={platform} htmlFor="price" required error={errors.price}>
            <Input id="price" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="USD" htmlFor="priceUSD" required error={errors.priceUSD} hint="Card payments.">
            <Input id="priceUSD" type="number" min={0} step="any" inputMode="decimal" value={priceUSD} onChange={(e) => setPriceUSD(e.target.value)} />
          </Field>
          <Field label="XLM" htmlFor="priceXLM" error={errors.priceXLM} hint="0 = not sold for XLM.">
            <Input id="priceXLM" type="number" min={0} step="any" inputMode="decimal" value={priceXLM} onChange={(e) => setPriceXLM(e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Listing" icon={FileText} description="Optional — what fans see in your store.">
        <Field label="Title" htmlFor="title" hint={`Leave empty to show “${n || "100"} ${code}”.`}>
          <Input id="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="description">
          <Textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What holders of your page asset get — perks, access, rewards…" />
        </Field>
      </FormSection>
    </FormPage>
  );
}
