"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MediaType } from "@prisma/client";
import { Box, Coins, ImageIcon, Loader2, Lock, Music, Package, Receipt, Sparkles, Video } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clientsign } from "package/connect_wallet";
import { WalletType } from "package/connect_wallet/src/lib/enums";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import type { z } from "zod";

import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiImageButton } from "~/ui/ai/ai-image";
import { AiTextButton } from "~/ui/ai/ai-text";
import { PaymentChoose, usePaymentMethodStore } from "~/components/common/payment-options";
import { NftFormSchema } from "~/types/asset";
import RechargeLink from "~/components/payment/recharge-link";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/shadcn/ui/select";
import { Textarea } from "~/components/shadcn/ui/textarea";
import useNeedSign from "~/lib/hook";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { PLATFORM_ASSET, PLATFORM_FEE, TrxBaseFeeInPlatformAsset } from "~/lib/stellar/constant";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { cn } from "~/lib/utils";
import type { EndPointType } from "~/server/s3";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { Dropzone } from "~/ui/upload/dropzone";
import { api } from "~/utils/api";
import { uploadToIpfs } from "~/ui/upload/ipfs";
import { ipfsHashToPinataGatewayUrl } from "~/utils/ipfs";

type AssetForm = z.infer<typeof NftFormSchema>;

const KINDS: { type: MediaType; label: string; icon: typeof ImageIcon; endpoint: EndPointType; hint?: string }[] = [
  { type: MediaType.IMAGE, label: "Image", icon: ImageIcon, endpoint: "imageUploader" },
  { type: MediaType.VIDEO, label: "Video", icon: Video, endpoint: "videoUploader" },
  { type: MediaType.MUSIC, label: "Music", icon: Music, endpoint: "musicUploader" },
  { type: MediaType.THREE_D, label: "3D", icon: Box, endpoint: "modelUploader", hint: "3D model: GLB or OBJ" },
];

const REQUIRED_XLM = 2;
const FEE_XLM = 2;
const MAX_THUMB = 1024 * 1024;
const code = PLATFORM_ASSET.code.toUpperCase();

/**
 * Stores › New asset (NFT). One page: the locked content, thumbnail, details,
 * supply and price, with a preview and cost summary beside it. Creating it
 * issues the asset on Stellar from the brand's wallet.
 */
export default function NewAssetPage() {
  const router = useRouter();
  const session = useSession();
  const { needSign } = useNeedSign();
  const { platformAssetBalance } = useUserStellarAcc();
  const { paymentMethod, setIsOpen } = usePaymentMethodStore();
  const walletType = session.data?.user.walletType ?? WalletType.none;

  const tiers = api.fan.member.getAllMembership.useQuery({});
  const requiredToken = api.fan.trx.getRequiredPlatformAsset.useQuery({ xlm: REQUIRED_XLM });
  const requiredTokenAmount = requiredToken.data ?? 0;
  const assetFees = Number(TrxBaseFeeInPlatformAsset) + Number(PLATFORM_FEE);
  const insufficient = paymentMethod === "asset" && requiredToken.isSuccess && requiredTokenAmount > platformAssetBalance;

  const [ipfsHash, setIpfsHash] = useState<string>();
  const [tier, setTier] = useState<string>("public");
  const [uploading, setUploading] = useState(false);
  const [signing, setSigning] = useState(false);

  const { register, handleSubmit, setValue, watch, control, getValues, formState } = useForm<AssetForm>({
    resolver: zodResolver(NftFormSchema),
    defaultValues: { mediaType: MediaType.IMAGE, price: 2, priceUSD: 1, limit: 1, name: "", description: "", code: "", coverImgUrl: "" },
  });
  const { errors } = formState;
  const values = watch();
  const kind = KINDS.find((k) => k.type === values.mediaType) ?? KINDS[0]!;
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = { name: values.name ?? "", description: values.description ?? "", type: kind.label, code: values.code ?? "" };
  const imagePrompt = imageBrief || [values.name, values.description?.slice(0, 400)].filter(Boolean).join(". ");

  const create = api.fan.asset.createAsset.useMutation({
    onSuccess: () => {
      toast.success("Asset created");
      setIsOpen(false);
      router.push("/stores");
    },
    onError: (e) => toast.error(e.message),
  });

  const issue = api.fan.trx.createUniAssetTrx.useMutation({
    onSuccess: async ({ issuer, xdr }) => {
      setValue("issuer", issuer);
      setSigning(true);
      try {
        const signed = await clientsign({ presignedxdr: xdr, pubkey: session.data?.user.id, walletType, test: clientSelect() });
        if (!signed) {
          toast.error("The transaction wasn't signed");
          return;
        }
        create.mutate({ ...getValues(), tier });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Signing failed");
      } finally {
        setSigning(false);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const busy = issue.isPending || signing || create.isPending;

  const confirmPayment = handleSubmit((data) => {
    if (!ipfsHash) return toast.error("Upload a thumbnail first");
    issue.mutate({ code: data.code, limit: data.limit, signWith: needSign(), ipfsHash, native: paymentMethod === "xlm" });
  });
  const onSubmit = handleSubmit(() => setIsOpen(true));

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/stores")}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || uploading || insufficient}>
        {busy ? <Loader2 className="animate-spin" /> : <Coins />}
        {busy ? "Creating…" : insufficient ? "Insufficient balance" : "Create asset"}
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
        title="New asset"
        description="An NFT or item for your store — image, video, music or 3D. Buyers unlock the content; the thumbnail is what everyone sees."
        back={{ href: "/stores", label: "Stores" }}
        onSubmit={(e) => void onSubmit(e)}
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
              {row("Supply", values.limit || "—")}
              {row("Price", `$${values.priceUSD || 0} · ${values.price || 0} ${code}`)}
              {row("Access", tier === "public" ? "Public" : tier === "private" ? "Followers" : (tiers.data?.find((t) => t.id.toString() === tier)?.name ?? "Tier"))}
              {row("Issuing fee", paymentMethod === "asset" ? `${requiredTokenAmount} ${code}` : `${REQUIRED_XLM + FEE_XLM} XLM`, true)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Your balance: {platformAssetBalance.toFixed(2)} {code}
            </p>
            {insufficient && (
              <div className="mt-2 space-y-2 text-xs text-destructive">
                <p>You need at least {requiredTokenAmount} {code}.</p>
                <RechargeLink />
              </div>
            )}
          </section>
        }
      >
        <AiFillCard
          form="asset"
          context={aiContext}
          examples={["Limited signed tour poster, 100 copies, $15", "Exclusive unreleased demo track for superfans", "3D collectible of our mascot"]}
          apply={(r) => {
            const before = { ...values };
            setValue("name", r.name, { shouldValidate: true });
            setValue("description", r.description, { shouldValidate: true });
            setValue("code", r.code.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 12), { shouldValidate: true });
            setValue("limit", r.limit, { shouldValidate: true });
            setValue("priceUSD", r.priceUSD, { shouldValidate: true });
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
                  setValue("mediaUrl", undefined as unknown as string);
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
          <Field label={`${kind.label} file`} required error={errors.mediaUrl ? "Upload the content" : undefined}>
            <Dropzone
              key={kind.type}
              endpoint={kind.endpoint}
              shape="wide"
              value={values.mediaUrl}
              description={kind.hint}
              onUploadingChange={setUploading}
              onChange={(url) => setValue("mediaUrl", url!, { shouldValidate: Boolean(url) })}
            />
          </Field>
          <Field
            label="Thumbnail"
            required
            error={errors.coverImgUrl?.message}
            hint="The token image and store card. PNG or JPG, under 1 MB."
            action={
              <AiImageButton
                form="asset"
                aspect="square"
                destination="ipfs"
                className="h-7 px-2.5 text-xs"
                label="Generate"
                suggestedPrompt={imagePrompt}
                onImage={(url, hash) => {
                  setValue("coverImgUrl", url, { shouldValidate: true });
                  setIpfsHash(hash);
                }}
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
              uploader={async (f) => {
                const hash = await uploadToIpfs(f) // the thumbnail becomes the token's image;
                setIpfsHash(hash);
                return ipfsHashToPinataGatewayUrl(hash);
              }}
              onUploadingChange={setUploading}
              onChange={(url) => {
                setValue("coverImgUrl", url ?? "", { shouldValidate: true });
                if (!url) setIpfsHash(undefined);
              }}
            />
          </Field>
        </FormSection>

        <FormSection title="Details" icon={Sparkles}>
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errors.name?.message}
            action={<AiTextButton form="asset" field="name" maxChars={60} value={values.name ?? ""} context={aiContext} onChange={(t) => setValue("name", t, { shouldValidate: true })} />}
          >
            <Input id="name" placeholder="What is it called?" {...register("name")} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            action={<AiTextButton form="asset" field="description" value={values.description ?? ""} context={aiContext} onChange={(t) => setValue("description", t, { shouldValidate: true })} />}
          >
            <Textarea id="description" rows={4} className="resize-none" placeholder="Tell fans what they get" {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset code" htmlFor="code" required error={errors.code?.message} hint="4–12 letters (A–Z), shown on-chain.">
              <Input id="code" className="font-mono uppercase" maxLength={12} placeholder="MYDROP" {...register("code")} />
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

        <FormSection title="Supply & price" icon={Package}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supply" htmlFor="limit" required error={errors.limit?.message} hint="How many copies can exist.">
              <Input id="limit" type="number" min={1} step={1} {...register("limit", { valueAsNumber: true })} />
            </Field>
            <Field label="Price (USD)" htmlFor="priceUSD" required error={errors.priceUSD?.message}>
              <Input id="priceUSD" type="number" min={0} step="any" {...register("priceUSD", { valueAsNumber: true })} />
            </Field>
            <Field label={`Price (${code})`} htmlFor="price" required error={errors.price?.message}>
              <Controller
                name="price"
                control={control}
                render={({ field }) => (
                  <Input id="price" type="number" min={0} step="any" value={Number.isNaN(field.value) ? "" : field.value} onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                )}
              />
            </Field>
          </div>
        </FormSection>
      </FormPage>

      <PaymentChoose
        costBreakdown={[
          { label: "Cost", amount: paymentMethod === "asset" ? requiredTokenAmount - assetFees : REQUIRED_XLM, type: "cost", highlighted: true },
          { label: "Platform fee", amount: paymentMethod === "asset" ? assetFees : FEE_XLM, type: "fee" },
          { label: "Total", amount: paymentMethod === "asset" ? requiredTokenAmount : REQUIRED_XLM + FEE_XLM, type: "total" },
        ]}
        XLM_EQUIVALENT={REQUIRED_XLM + FEE_XLM}
        handleConfirm={() => void confirmPayment()}
        loading={busy}
        requiredToken={requiredTokenAmount}
      />
    </>
  );
}
