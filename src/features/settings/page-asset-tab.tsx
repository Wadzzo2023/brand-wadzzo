"use client";

import { Clock, Coins, Copy, ExternalLink, Link2, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { env } from "~/env";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { cn } from "~/lib/utils";
import { Field } from "~/ui/form-page";
import { Dropzone } from "~/ui/upload/dropzone";
import { uploadToIpfsUrl } from "~/ui/upload/ipfs";
import { api, type RouterOutputs } from "~/utils/api";
import { addrShort } from "~/utils/utils";

type PageAsset = NonNullable<NonNullable<RouterOutputs["fan"]["creator"]["profileOverview"]>["pageAsset"]>;

const NETWORK = env.NEXT_PUBLIC_STELLAR_PUBNET ? "public" : "testnet";
const explorer = (code: string, issuer: string) => `https://stellar.expert/explorer/${NETWORK}/asset/${code}-${issuer}`;

/**
 * The brand's page asset: the token fans hold to unlock membership tiers.
 * Without one, create a new token (issued by Wadzzo) or connect an existing
 * Stellar asset; with one, see it and set its price.
 */
export function PageAssetTab({ pageAsset, onMembership }: { pageAsset: PageAsset | null; onMembership?: () => void }) {
  return pageAsset ? <AssetDetails asset={pageAsset} onMembership={onMembership} /> : <SetupAsset />;
}

// ── Set up ────────────────────────────────────────────────────────────────

function SetupAsset() {
  const utils = api.useUtils();
  const [mode, setMode] = useState<"new" | "custom">("new");
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [thumbnail, setThumbnail] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; issuer?: string }>({});

  const setup = api.fan.creator.setupPageAsset.useMutation({
    onSuccess: (r) => {
      toast.success(r.status === "pending" ? "Page asset created — we'll issue it shortly" : "Page asset connected");
      void utils.fan.creator.profileOverview.invalidate();
      void utils.fan.creator.getCreatorPageAsset.invalidate();
      void utils.fan.creator.meCreator.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    const next: typeof errors = {};
    if (mode === "new" && !/^[A-Za-z0-9]{4,12}$/.test(c)) next.code = "4–12 letters or numbers";
    if (mode === "custom" && !/^[A-Za-z0-9]{1,12}$/.test(c)) next.code = "Up to 12 letters or numbers";
    if (mode === "custom" && !/^G[A-Z2-7]{55}$/.test(issuer.trim())) next.issuer = "A Stellar account address starting with G";
    setErrors(next);
    if (Object.keys(next).length) return;
    setup.mutate(mode === "new" ? { type: "new", code: c, thumbnail } : { type: "custom", code: c, issuer: issuer.trim() });
  };

  const option = (id: "new" | "custom", icon: typeof Sparkles, title: string, body: string) => {
    const Icon = icon;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={mode === id}
        onClick={() => {
          setMode(id);
          setErrors({});
        }}
        className={cn(
          "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary",
          mode === id ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
        )}
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", mode === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          <Icon className="size-4" />
        </span>
        <span>
          <span className="block font-medium">{title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
        </span>
      </button>
    );
  };

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-4 sm:p-5" noValidate>
      <h3 className="font-hud text-lg font-semibold">Set up your page asset</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Your page asset is the token fans hold to join your membership tiers. You pick it once — it can&apos;t be changed later.
      </p>

      <div role="radiogroup" aria-label="Page asset type" className="mt-4 grid gap-3 md:grid-cols-2">
        {option("new", Sparkles, "Create a new token", "Name it and add an image. Wadzzo issues it on Stellar for you.")}
        {option("custom", Link2, "Use a token I already have", "Connect an existing Stellar asset by its code and issuer.")}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <Field
            label="Token code"
            htmlFor="asset-code"
            required
            error={errors.code}
            hint={mode === "new" ? "4–12 letters or numbers, e.g. FYRON. Fans see it everywhere." : "The asset code exactly as on Stellar."}
          >
            <Input
              id="asset-code"
              value={code}
              maxLength={12}
              onChange={(e) => {
                setCode(e.target.value.replace(/\s/g, "").toUpperCase());
                setErrors({});
              }}
              placeholder="MYBRAND"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          {mode === "custom" && (
            <Field label="Issuer" htmlFor="asset-issuer" required error={errors.issuer} hint="The account that issued the asset (starts with G).">
              <Input
                id="asset-issuer"
                value={issuer}
                onChange={(e) => {
                  setIssuer(e.target.value.trim().toUpperCase());
                  setErrors({});
                }}
                placeholder="GABC…"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </Field>
          )}
        </div>
        {mode === "new" && (
          <Field label="Token image" hint="Square, stored on IPFS">
            <Dropzone
              endpoint="imageUploader"
              shape="square"
              value={thumbnail ?? null}
              uploader={uploadToIpfsUrl}
              onUploadingChange={setUploading}
              onChange={(url) => setThumbnail(url)}
            />
          </Field>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {mode === "new" && <span className="text-xs text-muted-foreground">An admin issues new tokens — usually within a day.</span>}
        <Button type="submit" disabled={setup.isPending || uploading}>
          {setup.isPending && <Loader2 className="animate-spin" />}
          {mode === "new" ? "Create page asset" : "Connect asset"}
        </Button>
      </div>
    </form>
  );
}

// ── Existing asset ────────────────────────────────────────────────────────

function AssetDetails({ asset, onMembership }: { asset: PageAsset; onMembership?: () => void }) {
  const utils = api.useUtils();
  const [price, setPrice] = useState(asset.price != null ? String(asset.price) : "");
  const [priceUSD, setPriceUSD] = useState(asset.priceUSD != null ? String(asset.priceUSD) : "");
  const changed = price !== (asset.price != null ? String(asset.price) : "") || priceUSD !== (asset.priceUSD != null ? String(asset.priceUSD) : "");
  const valid = Number(price) > 0 && Number(priceUSD) > 0;

  const save = api.fan.creator.updatePageAssetPrice.useMutation({
    onSuccess: () => {
      toast.success("Price saved");
      void utils.fan.creator.profileOverview.invalidate();
      void utils.fan.creator.getCreatorPageAsset.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const copy = () =>
    void navigator.clipboard.writeText(asset.issuer).then(
      () => toast.success("Issuer copied"),
      () => toast.error("Couldn't copy"),
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {asset.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.thumbnail} alt="" className="size-16 rounded-xl border object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Coins className="size-7" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-hud text-2xl font-semibold">{asset.code}</p>
            <p className="text-sm text-muted-foreground">{asset.custom ? "Your own Stellar asset" : "Issued by Wadzzo"}</p>
          </div>
        </div>

        {asset.pending ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              <b>Waiting to be issued.</b> An admin issues new tokens on Stellar — usually within a day. You can already set up membership tiers.
            </p>
          </div>
        ) : (
          <dl className="mt-4 space-y-1 text-sm">
            <dt className="text-xs text-muted-foreground">Issuer</dt>
            <dd className="flex items-center gap-1">
              <span className="truncate font-mono text-xs" title={asset.issuer}>
                {addrShort(asset.issuer, 10)}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="Copy issuer" onClick={copy}>
                <Copy />
              </Button>
              <Button variant="ghost" size="icon-sm" asChild>
                <a href={explorer(asset.code, asset.issuer)} target="_blank" rel="noreferrer" aria-label="View on Stellar Expert">
                  <ExternalLink />
                </a>
              </Button>
            </dd>
          </dl>
        )}

        {onMembership && (
          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-sm">
            <span className="text-muted-foreground">Fans holding {asset.code} unlock your membership tiers.</span>
            <Button variant="outline" size="sm" onClick={onMembership}>
              Membership tiers
            </Button>
          </div>
        )}
      </div>

      <form
        className="rounded-xl border bg-card p-4 sm:p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate({ price: Number(price), priceUSD: Number(priceUSD) });
        }}
      >
        <h3 className="font-medium">Price</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">What fans pay for one {asset.code}.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label={PLATFORM_ASSET.code} htmlFor="pa-price">
            <Input id="pa-price" type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="USD" htmlFor="pa-usd">
            <Input id="pa-usd" type="number" min={0} step="any" value={priceUSD} onChange={(e) => setPriceUSD(e.target.value)} />
          </Field>
        </div>
        {!valid && (price || priceUSD) && <p className="mt-2 text-xs text-destructive">Both prices must be more than 0.</p>}
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!changed || !valid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save price
          </Button>
        </div>
      </form>
    </div>
  );
}
