"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MediaType } from "@prisma/client";
import { Camera, Coins, Loader2, Receipt, Trophy, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clientsign } from "package/connect_wallet";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

import { Editor } from "~/components/common/quill-editor";
import { PaymentChoose, usePaymentMethodStore } from "~/components/common/payment-options";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import useNeedSign from "~/lib/hook";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { PLATFORM_ASSET, PLATFORM_FEE, SIMPLIFIED_FEE_IN_XLM, TrxBaseFeeInPlatformAsset } from "~/lib/stellar/constant";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { AiFillCard } from "~/ui/ai/ai-fill";
import { AiImageButton } from "~/ui/ai/ai-image";
import { AiTextButton } from "~/ui/ai/ai-text";
import { htmlToText } from "~/ui/ai/shared";
import { Field, FormPage, FormSection } from "~/ui/form-page";
import { Dropzone } from "~/ui/upload/dropzone";
import { api } from "~/utils/api";

const MAX_IMAGES = 4;
/** USD → platform asset rate the bounty form has always used. */
const PRIZE_RATE = 0.01;
const XLM_PER_USD = 0.7;

const BountySchema = z.object({
  title: z.string().min(1, { message: "Title can't be empty" }).max(65, { message: "Title can't be more than 65 characters" }),
  totalWinner: z.number({ invalid_type_error: "Enter how many winners" }).int().min(1, { message: "At least 1 winner" }),
  prizeInUSD: z.number({ invalid_type_error: "Enter the prize" }).min(0.00001, { message: "Enter the prize" }),
  prize: z.number().min(0.00001, { message: "Enter the prize" }),
  requiredBalance: z.number({ invalid_type_error: "Must be a number" }).nonnegative({ message: "Can't be less than 0" }).optional(),
  content: z.string().min(2, { message: "Describe the task" }),
});
type BountyForm = z.infer<typeof BountySchema>;

const code = PLATFORM_ASSET.code.toUpperCase();

/**
 * Bounties › New bounty. One page: the task, the reward, who can join and
 * images. The cost summary sits beside the form; publishing funds the bounty
 * from the brand's wallet (asset or XLM).
 */
export default function NewBountyPage() {
  const router = useRouter();
  const session = useSession();
  const { needSign } = useNeedSign();
  const { platformAssetBalance } = useUserStellarAcc();
  const { paymentMethod, setIsOpen } = usePaymentMethodStore();

  const [images, setImages] = useState<string[]>([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [signing, setSigning] = useState(false);

  const { register, handleSubmit, setValue, watch, control, getValues, formState } = useForm<BountyForm>({
    resolver: zodResolver(BountySchema),
    defaultValues: { title: "", content: "", totalWinner: 1, prizeInUSD: 0, prize: 0, requiredBalance: 0 },
  });
  const { errors } = formState;
  const values = watch();
  const [imageBrief, setImageBrief] = useState("");
  const aiContext = {
    title: values.title ?? "",
    description: htmlToText(values.content ?? ""),
    prize: values.prizeInUSD ? `$${values.prizeInUSD}` : "",
    winners: String(values.totalWinner ?? ""),
  };
  const imagePrompt = imageBrief || [values.title, htmlToText(values.content ?? "").slice(0, 400)].filter(Boolean).join(". ");

  const assetFees = 2 * Number(TrxBaseFeeInPlatformAsset) + Number(PLATFORM_FEE);
  const xlmFee = 2 * SIMPLIFIED_FEE_IN_XLM; // now, and again when paying winners
  const prizeXlm = (values.prizeInUSD || 0) * XLM_PER_USD;
  const assetTotal = (values.prize || 0) + assetFees;
  const insufficient = paymentMethod === "asset" && values.prize > 0 && platformAssetBalance < assetTotal;

  const create = api.bounty.Bounty.createBounty.useMutation({
    onSuccess: () => {
      toast.success("Bounty published");
      router.push("/bounties");
    },
    onError: (e) => toast.error(e.message),
  });

  const fund = api.bounty.Bounty.sendBountyBalanceToMotherAcc.useMutation({
    onSuccess: async (data, { method }) => {
      if (!data) return;
      setSigning(true);
      try {
        const signed = await clientsign({
          presignedxdr: data.xdr,
          walletType: session.data?.user?.walletType,
          pubkey: data.pubKey,
          test: clientSelect(),
        });
        if (!signed) {
          toast.error("The transaction wasn't signed");
          return;
        }
        const v = getValues();
        create.mutate({
          title: v.title,
          prizeInUSD: v.prizeInUSD,
          totalWinner: v.totalWinner,
          prize: v.prize,
          requiredBalance: v.requiredBalance ?? 0,
          priceInXLM: method === "xlm" ? v.prizeInUSD * XLM_PER_USD : undefined,
          content: v.content,
          medias: images.map((url) => ({ url, type: MediaType.IMAGE })),
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't fund the bounty");
      } finally {
        setSigning(false);
        setIsOpen(false);
      }
    },
    onError: (e) => {
      toast.error(e.message);
      setIsOpen(false);
    },
  });

  const busy = fund.isPending || signing || create.isPending;

  const confirmPayment = handleSubmit((data) =>
    fund.mutate({ signWith: needSign(), prize: data.prize, xlmPrice: data.prizeInUSD * XLM_PER_USD, method: paymentMethod }),
  );
  // The page's submit validates, then asks how to pay.
  const onSubmit = handleSubmit(() => setIsOpen(true));

  const setPrizeUsd = (raw: string) => {
    const usd = Number(raw) || 0;
    setValue("prizeInUSD", usd, { shouldValidate: true });
    setValue("prize", usd / PRIZE_RATE, { shouldValidate: true });
  };

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={() => router.push("/bounties")}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || uploading || insufficient}>
        {busy ? <Loader2 className="animate-spin" /> : <Coins />}
        {busy ? "Publishing…" : insufficient ? "Insufficient balance" : "Fund & publish"}
      </Button>
    </>
  );

  const row = (k: string, v: React.ReactNode, strong = false) => (
    <div className={`flex justify-between gap-3 py-1.5 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? undefined : "text-muted-foreground"}>{k}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  );
  const winners = values.totalWinner || 1;

  return (
    <>
      <FormPage
        title="New bounty"
        description="A task fans complete for a reward. You fund the prize now; winners are paid when you pick them."
        back={{ href: "/bounties", label: "Bounties" }}
        onSubmit={(e) => void onSubmit(e)}
        actions={actions}
        aside={
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-hud text-base font-semibold">
              <Receipt className="size-4 text-primary" /> Summary
            </h2>
            {images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
            )}
            <p className="font-hud text-sm font-semibold">{values.title || "Untitled bounty"}</p>
            <div className="mt-2 divide-y">
              {row("Prize", `$${values.prizeInUSD || 0} · ${(values.prize || 0).toFixed(2)} ${code}`)}
              {row("Winners", winners)}
              {row("Each winner gets", `$${((values.prizeInUSD || 0) / winners).toFixed(2)}`)}
              {row("Fans must hold", values.requiredBalance ? `${values.requiredBalance} ${code}` : "Nothing")}
              {row("Fees", paymentMethod === "asset" ? `${assetFees.toFixed(2)} ${code}` : `${xlmFee} XLM`)}
              {row("Total", paymentMethod === "asset" ? `${assetTotal.toFixed(2)} ${code}` : `${(prizeXlm + xlmFee).toFixed(2)} XLM`, true)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Your balance: {platformAssetBalance.toFixed(2)} {code}
            </p>
            {insufficient && <p className="mt-1 text-xs text-destructive">Not enough {code} for the prize and fees.</p>}
          </section>
        }
      >
        <AiFillCard
          form="bounty"
          context={aiContext}
          examples={["Best photo of our mural, 3 winners, $30 total", "First 5 fans to find all our city pins win", "Remix our new track — judged by the band"]}
          apply={(r) => {
            const before = { ...values };
            setValue("title", r.title.slice(0, 65), { shouldValidate: true });
            setValue("content", r.contentHtml, { shouldValidate: true });
            setValue("totalWinner", r.totalWinner, { shouldValidate: true });
            setValue("requiredBalance", r.requiredBalance, { shouldValidate: true });
            if (r.prizeInUSD) setPrizeUsd(String(r.prizeInUSD));
            setImageBrief(r.imagePrompt);
            return () => {
              setValue("title", before.title);
              setValue("content", before.content);
              setValue("totalWinner", before.totalWinner);
              setValue("requiredBalance", before.requiredBalance);
              setPrizeUsd(String(before.prizeInUSD ?? 0));
            };
          }}
        />

        <FormSection title="The task" icon={Trophy}>
          <Field
            label="Title"
            htmlFor="title"
            required
            error={errors.title?.message}
            hint={`${65 - (values.title?.length ?? 0)} characters left`}
            action={<AiTextButton form="bounty" field="title" maxChars={65} value={values.title ?? ""} context={aiContext} onChange={(t) => setValue("title", t.slice(0, 65), { shouldValidate: true })} />}
          >
            <Input id="title" maxLength={65} placeholder="What should fans do?" {...register("title")} />
          </Field>
          <Field
            label="Description"
            required
            error={errors.content?.message}
            action={<AiTextButton form="bounty" field="task description" format="html" value={values.content ?? ""} context={aiContext} onChange={(t) => setValue("content", t, { shouldValidate: true })} />}
          >
            <Controller name="content" control={control} render={({ field }) => <Editor value={field.value} onChange={field.onChange} placeholder="Rules, what counts as a win, deadlines…" />} />
          </Field>
        </FormSection>

        <FormSection title="Reward" icon={Coins} description={`Prizes are paid in ${code}. 1 USD = ${1 / PRIZE_RATE} ${code}.`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prize (USD)" htmlFor="prizeInUSD" required error={errors.prizeInUSD?.message}>
              <Input id="prizeInUSD" type="number" inputMode="decimal" min={0} step="any" placeholder="10" value={values.prizeInUSD || ""} onChange={(e) => setPrizeUsd(e.target.value)} />
            </Field>
            <Field label={`Prize (${code})`} htmlFor="prize">
              <Input id="prize" readOnly tabIndex={-1} value={values.prize ? values.prize.toFixed(5) : ""} placeholder="Calculated" className="bg-surface-2" />
            </Field>
            <Field label="Winners" htmlFor="totalWinner" required error={errors.totalWinner?.message} hint="The prize is split evenly.">
              <Input id="totalWinner" type="number" min={1} step={1} {...register("totalWinner", { valueAsNumber: true })} />
            </Field>
            <Field label={`Fans must hold (${code})`} htmlFor="requiredBalance" error={errors.requiredBalance?.message} hint="0 lets anyone join.">
              <Input id="requiredBalance" type="number" min={0} step="any" {...register("requiredBalance", { valueAsNumber: true })} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Images" icon={Camera} description={`Optional, up to ${MAX_IMAGES}. The first is the cover.`}>
          {images.length < MAX_IMAGES && (
            <div className="flex justify-end">
              <AiImageButton form="bounty" aspect="wide" suggestedPrompt={imagePrompt} label="Generate cover with AI" onImage={(url) => setImages((all) => [url, ...all].slice(0, MAX_IMAGES))} />
            </div>
          )}
          {images.length < MAX_IMAGES && (
            <Dropzone
              key={uploadKey}
              endpoint="imageUploader"
              shape="wide"
              label="Drop an image here"
              onUploadingChange={setUploading}
              onChange={(url) => {
                if (!url) return;
                setImages((all) => [...all, url]);
                setUploadKey((n) => n + 1);
              }}
            />
          )}
          {images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((url, i) => (
                <li key={url} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                  {i === 0 && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Cover</span>}
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setImages((all) => all.filter((_, j) => j !== i))}
                    className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
      </FormPage>

      <PaymentChoose
        costBreakdown={[
          { label: "Bounty prize", amount: paymentMethod === "asset" ? values.prize : prizeXlm, highlighted: true, type: "cost" },
          { label: "Platform fee", amount: paymentMethod === "asset" ? assetFees : xlmFee, type: "fee" },
          { label: "Total", amount: paymentMethod === "asset" ? assetTotal : prizeXlm + xlmFee, type: "total" },
        ]}
        XLM_EQUIVALENT={prizeXlm + xlmFee}
        requiredToken={assetTotal}
        handleConfirm={() => void confirmPayment()}
        loading={busy}
      />
    </>
  );
}
