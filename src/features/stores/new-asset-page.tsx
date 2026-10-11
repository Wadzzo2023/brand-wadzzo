"use client";

import { MediaType } from "@prisma/client";
import { Box, Coins, ImageIcon, Loader2, Lock, Music, Package, Receipt, Sparkles, Video } from "lucide-react";
import { keepPreviousData } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clientsign } from "package/connect_wallet";
import { WalletType } from "package/connect_wallet/src/lib/enums";
import { useDeferredValue, useState } from "react";
import toast from "react-hot-toast";

import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiImageButton } from "~/ui/ai/ai-image";
import { AiTextButton } from "~/ui/ai/ai-text";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { cn } from "~/lib/utils";
import type { EndPointType } from "~/server/s3";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { Dropzone } from "~/ui/upload/dropzone";
import { api } from "~/utils/api";
import { uploadToIpfs } from "~/ui/upload/ipfs";
import { ipfsHashToPinataGatewayUrl } from "~/utils/ipfs";

const KINDS: { type: MediaType; label: string; icon: typeof ImageIcon; endpoint: EndPointType; hint?: string }[] = [
  { type: MediaType.IMAGE, label: "Image", icon: ImageIcon, endpoint: "imageUploader" },
  { type: MediaType.VIDEO, label: "Video", icon: Video, endpoint: "videoUploader" },
  { type: MediaType.MUSIC, label: "Music", icon: Music, endpoint: "musicUploader" },
  { type: MediaType.THREE_D, label: "3D", icon: Box, endpoint: "modelUploader", hint: "3D model: GLB or OBJ" },
];

const MAX_THUMB = 1024 * 1024;
const MAX_ROYALTY = 50;
const code = PLATFORM_ASSET.code.toUpperCase();

type Form = {
  name: string;
  description: string;
  code: string;
  mediaType: MediaType;
  mediaUrl: string;
  coverImgUrl: string;
  price: number;
  priceUSD: number;
  limit: number;
  openEdition: boolean;
  royaltyPercent: number;
  mintMode: "later" | "now";
  mintNow: number;
};
type Errors = Partial<Record<keyof Form, string>>;

/**
 * Stores › New item. The locked content, thumbnail, details, supply, royalty
 * and price, with a live cost summary beside it. Items are minted on demand
 * when fans buy or claim them (they pay); "mint now" puts copies in your
 * storage straight away. The only on-chain cost to you is opening your issuer
 * (first item) and any copies minted now — shown before you sign.
 */
export default function NewAssetPage() {
  const router = useRouter();
  const session = useSession();
  const walletType = session.data?.user.walletType ?? WalletType.none;
  const tiers = api.fan.member.getAllMembership.useQuery({});

  const [values, setValues] = useState<Form>({
    name: "",
    description: "",
    code: "",
    mediaType: MediaType.IMAGE,
    mediaUrl: "",
    coverImgUrl: "",
    price: 100,
    priceUSD: 1,
    limit: 100,
    openEdition: false,
    royaltyPercent: 10,
    mintMode: "later",
    mintNow: 1,
  });
  const [errors, setErrors] = useState<Errors>({});
  const setValue = <K extends keyof Form>(k: K, v: Form[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const [tier, setTier] = useState<string>("public");
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"idle" | "creating" | "signing" | "confirming">("idle");

  const kind = KINDS.find((k) => k.type === values.mediaType) ?? KINDS[0]!;
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = { name: values.name, description: values.description, type: kind.label, code: values.code };
  const imagePrompt = imageBrief || [values.name, values.description.slice(0, 400)].filter(Boolean).join(". ");

  const limit = values.openEdition ? null : values.limit;
  const mintNow = values.mintMode === "now" ? values.mintNow : 0;
  const quoteInput = useDeferredValue({ code: values.code.trim(), mintNow: Number.isFinite(mintNow) ? mintNow : 0, limit: limit && Number.isFinite(limit) && limit > 0 ? limit : null });
  const quote = api.fan.item.quote.useQuery(quoteInput, { placeholderData: keepPreviousData });
  const q = quote.data;

  const create = api.fan.item.create.useMutation();
  const confirm = api.fan.item.confirm.useMutation();
  const cancel = api.fan.item.cancel.useMutation();
  const busy = step !== "idle";

  const validate = () => {
    const e: Errors = {};
    if (!values.mediaUrl) e.mediaUrl = "Upload the content";
    if (!values.coverImgUrl) e.coverImgUrl = "Upload a thumbnail";
    if (!values.name.trim()) e.name = "Give it a name";
    if (!/^[a-zA-Z]{4,12}$/.test(values.code.trim())) e.code = "4–12 letters (A–Z)";
    if (!values.openEdition && !(Number.isInteger(values.limit) && values.limit >= 1)) e.limit = "At least 1";
    if (!(values.royaltyPercent >= 0 && values.royaltyPercent <= MAX_ROYALTY)) e.royaltyPercent = `0–${MAX_ROYALTY}%`;
    if (!(values.price >= 0)) e.price = "0 or more";
    if (!(values.priceUSD >= 0)) e.priceUSD = "0 or more";
    if (values.mintMode === "now" && !(Number.isInteger(values.mintNow) && values.mintNow >= 1)) e.mintNow = "At least 1";
    else if (values.mintMode === "now" && limit != null && values.mintNow > limit) e.mintNow = "Can't exceed the supply";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setStep("creating");
    try {
      const res = await create.mutateAsync({
        name: values.name.trim(),
        description: values.description.trim(),
        code: values.code.trim(),
        mediaType: values.mediaType,
        mediaUrl: values.mediaUrl,
        thumbnail: values.coverImgUrl,
        price: values.price,
        priceUSD: values.priceUSD,
        limit,
        royaltyPercent: values.royaltyPercent,
        mintNow,
        access: tier,
      });
      if (res.txId && res.xdr) {
        setStep("signing");
        const signed = await clientsign({ presignedxdr: res.xdr, pubkey: session.data?.user.id, walletType, test: clientSelect() }).catch(() => false);
        if (!signed) {
          await cancel.mutateAsync({ txId: res.txId }).catch(() => undefined);
          toast.error("The transaction wasn't signed, so the item wasn't created.");
          return;
        }
        setStep("confirming");
        const result = await confirm.mutateAsync({ txId: res.txId });
        if (result.status === "FAILED") {
          toast.error("The transaction failed on Stellar, so the item wasn't created.");
          return;
        }
      }
      toast.success("Item created");
      router.push("/stores");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the item");
    } finally {
      setStep("idle");
    }
  };

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/stores")}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || uploading || (q != null && !q.ok)}>
        {busy ? <Loader2 className="animate-spin" /> : <Coins />}
        {step === "creating" ? "Creating…" : step === "signing" ? "Confirm in your wallet…" : step === "confirming" ? "Confirming on Stellar…" : q && q.totalXlm > 0 ? `Create · ${q.totalXlm} XLM` : "Create item"}
      </Button>
    </>
  );

  const row = (k: string, v: React.ReactNode, strong = false) => (
    <div className={cn("flex justify-between gap-3 py-1.5 text-sm", strong && "font-semibold")}>
      <span className={strong ? undefined : "text-muted-foreground"}>{k}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  );

  return (
    <>
      <FormPage
        title="New item"
        description="An item for your store — image, video, music or 3D. Buyers unlock the content; the thumbnail is what everyone sees."
        back={{ href: "/stores", label: "Stores" }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        actions={actions}
        aside={
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-hud text-base font-semibold">
              <Receipt className="size-4 text-primary" /> Summary
            </h2>
            <div className="mb-3 aspect-square w-full overflow-hidden rounded-lg border bg-surface-2">
              {values.coverImgUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={values.coverImgUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-faint">
                  <kind.icon className="size-10" />
                </div>
              )}
            </div>
            <p className="font-hud text-sm font-semibold">{values.name || "Untitled asset"}</p>
            {values.code && <p className="font-mono text-xs text-muted-foreground">{values.code.toUpperCase()}</p>}
            <div className="mt-2 divide-y">
              {row("Type", kind.label)}
              {row("Supply", values.openEdition ? "Open edition" : values.limit || "—")}
              {row("Price", `$${values.priceUSD || 0} · ${values.price || 0} ${code}`)}
              {row("Royalty", `${values.royaltyPercent || 0}% of resales`)}
              {row("Access", tier === "public" ? "Public" : tier === "private" ? "Followers" : (tiers.data?.find((t) => t.id.toString() === tier)?.name ?? "Tier"))}
              {row("Minting", values.mintMode === "now" ? `${values.mintNow || 0} now, rest on demand` : "On demand")}
            </div>
            <div className="mt-4 rounded-lg bg-surface-2 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">You pay now</p>
              {!q ? (
                <p className="text-sm text-muted-foreground">Calculating…</p>
              ) : q.totalXlm === 0 ? (
                <p className="text-sm">
                  <b>Nothing</b> — copies are minted when fans buy or claim them, and they cover the cost.
                </p>
              ) : (
                <>
                  {q.lines.map((l) => (
                    <div key={l.label} className="flex justify-between gap-3 py-1 text-sm">
                      <span className="text-muted-foreground">
                        {l.label}
                        {l.hint && <span className="block text-xs">{l.hint}</span>}
                      </span>
                      <span className="tabular-nums">{l.amount} XLM</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t pt-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{q.totalXlm} XLM</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Available: {Math.floor(q.spendableXlm * 1e4) / 1e4} XLM</p>
                </>
              )}
              {q?.problems.map((p) => (
                <p key={p} className="mt-2 text-xs text-destructive">
                  {p}
                </p>
              ))}
            </div>
          </section>
        }
      >
        <AiFillCard
          form="asset"
          context={aiContext}
          examples={["Limited signed tour poster, 100 copies, $15", "Exclusive unreleased demo track for superfans", "3D collectible of our mascot"]}
          apply={(r) => {
            const before = { ...values };
            setValue("name", r.name);
            setValue("description", r.description);
            setValue("code", r.code.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 12));
            setValue("limit", r.limit);
            setValue("priceUSD", r.priceUSD);
            // Only switch the content type if nothing's been uploaded yet.
            if (!values.mediaUrl) setValue("mediaType", r.mediaType);
            setImageBrief(r.imagePrompt);
            return () => {
              setValue("name", before.name);
              setValue("description", before.description);
              setValue("code", before.code);
              setValue("limit", before.limit);
              setValue("priceUSD", before.priceUSD);
              setValue("mediaType", before.mediaType);
            };
          }}
        />

        <FormSection title="Content" icon={Lock} description="What buyers unlock.">
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Content type">
            {KINDS.map((k) => (
              <button
                key={k.type}
                type="button"
                role="radio"
                aria-checked={values.mediaType === k.type}
                onClick={() => {
                  setValue("mediaType", k.type);
                  setValue("mediaUrl", "");
                }}
                className={cn(
                  "flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                  values.mediaType === k.type ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <k.icon className="size-4" /> {k.label}
              </button>
            ))}
          </div>
          <Field label={`${kind.label} file`} required error={errors.mediaUrl}>
            <Dropzone
              key={kind.type}
              endpoint={kind.endpoint}
              shape="wide"
              value={values.mediaUrl}
              description={kind.hint}
              onUploadingChange={setUploading}
              onChange={(url) => setValue("mediaUrl", url ?? "")}
            />
          </Field>
          <Field
            label="Thumbnail"
            required
            error={errors.coverImgUrl}
            hint="The token image and store card. PNG or JPG, under 1 MB."
            action={
              <AiImageButton
                form="asset"
                aspect="square"
                destination="ipfs"
                className="h-7 px-2.5 text-xs"
                label="Generate"
                suggestedPrompt={imagePrompt}
                onImage={(url) => setValue("coverImgUrl", url)}
              />
            }
          >
            <Dropzone
              endpoint="imageUploader"
              shape="square"
              className="max-w-56"
              accept="image/png,image/jpeg"
              description="PNG or JPG · max 1 MB"
              value={values.coverImgUrl || null}
              onBeforeUpload={(f) => {
                if (f.size > MAX_THUMB) {
                  toast.error("The thumbnail must be under 1 MB");
                  return undefined;
                }
                return f;
              }}
              uploader={async (f) => ipfsHashToPinataGatewayUrl(await uploadToIpfs(f))} // the thumbnail is the token's image
              onUploadingChange={setUploading}
              onChange={(url) => setValue("coverImgUrl", url ?? "")}
            />
          </Field>
        </FormSection>

        <FormSection title="Details" icon={Sparkles}>
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errors.name}
            action={<AiTextButton form="asset" field="name" maxChars={60} value={values.name ?? ""} context={aiContext} onChange={(t) => setValue("name", t)} />}
          >
            <Input id="name" placeholder="What is it called?" value={values.name} maxLength={60} onChange={(e) => setValue("name", e.target.value)} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            action={<AiTextButton form="asset" field="description" value={values.description ?? ""} context={aiContext} onChange={(t) => setValue("description", t)} />}
          >
            <Textarea id="description" rows={4} className="resize-none" placeholder="Tell fans what they get" value={values.description} onChange={(e) => setValue("description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset code" htmlFor="code" required error={errors.code} hint="4–12 letters (A–Z), shown on-chain. Unique among your items.">
              <Input id="code" className="font-mono uppercase" maxLength={12} placeholder="MYDROP" value={values.code} onChange={(e) => setValue("code", e.target.value.replace(/[^a-z]/gi, "").toUpperCase())} />
            </Field>
            <Field label="Access" hint="Who can see it in your store.">
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Only followers</SelectItem>
                  {tiers.data?.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name} · {t.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Supply, royalty & price" icon={Package}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supply" htmlFor="limit" required={!values.openEdition} error={errors.limit} hint="Most copies that can ever exist.">
              <Input id="limit" type="number" min={1} step={1} disabled={values.openEdition} value={values.openEdition ? "" : Number.isNaN(values.limit) ? "" : values.limit} placeholder={values.openEdition ? "Unlimited" : undefined} onChange={(e) => setValue("limit", e.target.valueAsNumber)} />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={values.openEdition} onChange={(e) => setValue("openEdition", e.target.checked)} className="size-4 accent-primary" /> Open edition (no limit)
              </label>
            </Field>
            <Field label="Royalty" htmlFor="royalty" required error={errors.royaltyPercent} hint={`Your share of every resale, 0–${MAX_ROYALTY}%.`}>
              <div className="relative">
                <Input id="royalty" type="number" min={0} max={MAX_ROYALTY} step="any" className="pr-8" value={Number.isNaN(values.royaltyPercent) ? "" : values.royaltyPercent} onChange={(e) => setValue("royaltyPercent", e.target.valueAsNumber)} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Field label="Price (USD)" htmlFor="priceUSD" required error={errors.priceUSD}>
              <Input id="priceUSD" type="number" min={0} step="any" value={Number.isNaN(values.priceUSD) ? "" : values.priceUSD} onChange={(e) => setValue("priceUSD", e.target.valueAsNumber)} />
            </Field>
            <Field label={`Price (${code})`} htmlFor="price" required error={errors.price}>
              <Input id="price" type="number" min={0} step="any" value={Number.isNaN(values.price) ? "" : values.price} onChange={(e) => setValue("price", e.target.valueAsNumber)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Minting" icon={Coins} description="When copies are created on Stellar.">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Minting">
            {(
              [
                { id: "later", title: "Mint later", text: "Each copy is minted when a fan buys or claims it — they pay for it. Nothing to pay now." },
                { id: "now", title: "Mint now", text: "Mint copies into your storage now — handy for gifts and pins. You pay the storage reserve and fee." },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={values.mintMode === m.id}
                onClick={() => setValue("mintMode", m.id)}
                className={cn("rounded-lg border p-3 text-left transition-colors", values.mintMode === m.id ? "border-primary bg-primary/5" : "hover:border-line-bright")}
              >
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{m.text}</span>
              </button>
            ))}
          </div>
          {values.mintMode === "now" && (
            <Field label="Copies to mint now" htmlFor="mintNow" required error={errors.mintNow} hint="The rest are still minted on demand, up to the supply.">
              <Input id="mintNow" type="number" min={1} step={1} max={values.openEdition ? undefined : values.limit} className="max-w-40" value={Number.isNaN(values.mintNow) ? "" : values.mintNow} onChange={(e) => setValue("mintNow", e.target.valueAsNumber)} />
            </Field>
          )}
        </FormSection>
      </FormPage>

    </>
  );
}
