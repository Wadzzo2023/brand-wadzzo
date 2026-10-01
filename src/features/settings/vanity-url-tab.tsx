"use client";

import type { VanitySubscription } from "@prisma/client";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { format, formatDistanceToNow } from "date-fns";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { clientsign } from "package/connect_wallet";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { env } from "~/env";
import useNeedSign from "~/lib/hook";
import { networkPassphrase, PLATFORM_ASSET } from "~/lib/stellar/constant";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { cn } from "~/lib/utils";
import { Field } from "~/ui/form-page";
import { api } from "~/utils/api";

const isWadzzo = PLATFORM_ASSET.code.toLowerCase() === "wadzzo";
// Same numbers the server charges (VANITY_PRICE in lib/stellar/fan/vanity-url); shown before paying.
const PRICE = isWadzzo ? { set: 200, change: 500 } : { set: 300000, change: 750000 };
export const VANITY_HOST = env.NEXT_PUBLIC_ASSET_CODE.toLowerCase() === "wadzzo" ? "app.wadzzo.com" : "bandcoin.io";
const VANITY_RE = /^[a-z0-9_-]+$/;
const money = (n: number) => `${n.toLocaleString()} ${PLATFORM_ASSET.code}`;

/**
 * The vanity URL: a paid short link to the brand's page. Paying is two steps —
 * sign the payment, then the server checks it on the network before saving.
 */
export function VanityUrlTab({ vanityURL, subscription }: { vanityURL: string | null; subscription: VanitySubscription | null }) {
  const session = useSession();
  const { needSign } = useNeedSign();
  const utils = api.useUtils();

  const state = !subscription ? "none" : new Date(subscription.endDate) >= new Date() ? "active" : "expired";
  const current = vanityURL ?? "";
  const [value, setValue] = useState(current);
  const [paying, setPaying] = useState(false);

  const debounced = useDebounce(value, 400);
  const valid = debounced.length >= 2 && debounced.length <= 30 && VANITY_RE.test(debounced);
  const changed = debounced !== current;
  const availability = api.fan.creator.checkVanityURLAvailability.useQuery(
    { vanityURL: debounced },
    { enabled: state !== "expired" && valid && changed, retry: false },
  );

  const price = state === "active" ? PRICE.change : PRICE.set;
  const typing = value !== debounced;
  const localError =
    value && !VANITY_RE.test(value) ? "Lowercase letters, numbers, - and _ only" : value && (value.length < 2 || value.length > 30) ? "2–30 characters" : undefined;
  const available = !changed || availability.data?.isAvailable === true;

  const getXdr = api.fan.creator.updateVanityURL.useMutation({ onError: (e) => toast.error(e.message) });
  const save = api.fan.creator.createOrUpdateVanityURL.useMutation({ onError: (e) => toast.error(e.message) });

  const canSubmit =
    !paying && (state === "expired" || (!localError && !typing && Boolean(value) && changed && available && !availability.isFetching));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const url = state === "expired" ? current : value;
    setPaying(true);
    try {
      const xdr = await getXdr.mutateAsync({ vanityURL: url, signWith: needSign() });
      // Signing doesn't change the hash, so we know which payment to verify.
      const txHash = TransactionBuilder.fromXDR(xdr, networkPassphrase).hash().toString("hex");
      const paid = await clientsign({
        presignedxdr: xdr,
        walletType: session.data?.user?.walletType,
        pubkey: session.data?.user?.id,
        test: clientSelect(),
      });
      if (!paid) {
        toast.error("The payment wasn't signed");
        return;
      }
      await save.mutateAsync({ vanityURL: url, txHash });
      toast.success(state === "active" ? "Vanity URL changed" : state === "expired" ? "Vanity URL renewed" : "Vanity URL set");
      void utils.fan.creator.profileOverview.invalidate();
    } catch (err) {
      // tRPC errors are already shown by the mutations' onError.
      if (!(err instanceof Error && "data" in err)) toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPaying(false);
    }
  };

  const copy = () =>
    void navigator.clipboard.writeText(`https://${VANITY_HOST}/${current}`).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy the link"),
    );

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">
        {state === "active"
          ? `Your short link is live. Changing it costs ${money(PRICE.change)}.`
          : `A short link to your page, for ${money(PRICE.set)} a month.`}
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4" noValidate>
        <Field
          label="Your link"
          htmlFor="vanity"
          error={localError}
          hint={
            state === "expired" ? (
              "Your subscription ended. Renew to keep this link."
            ) : changed && valid && !typing ? (
              availability.isFetching ? (
                "Checking…"
              ) : availability.data?.isAvailable ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Check className="size-3.5" /> Available
                </span>
              ) : availability.data ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <X className="size-3.5" /> Taken
                </span>
              ) : undefined
            ) : undefined
          }
          action={
            current && state === "active" ? (
              <Button type="button" variant="ghost" size="sm" onClick={copy}>
                <Copy /> Copy
              </Button>
            ) : undefined
          }
        >
          <div className="flex items-center overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
            <span className="shrink-0 border-r bg-muted px-3 py-2 text-sm text-muted-foreground">{VANITY_HOST}/</span>
            <input
              id="vanity"
              value={value}
              disabled={state === "expired" || paying}
              onChange={(e) => setValue(e.target.value.toLowerCase().trim())}
              placeholder="your-brand"
              maxLength={30}
              autoCapitalize="none"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
            />
          </div>
        </Field>

        {subscription && (
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
            <Info label="Status">
              <span className={cn("font-semibold", state === "active" ? "text-primary" : "text-destructive")}>{state === "active" ? "Active" : "Expired"}</span>
            </Info>
            <Info label={state === "active" ? "Renews" : "Ended"}>
              <span title={format(new Date(subscription.endDate), "PPp")}>
                {state === "active" ? `in ${formatDistanceToNow(new Date(subscription.endDate))}` : format(new Date(subscription.endDate), "MMM d, yyyy")}
              </span>
            </Info>
            <Info label="Since">{format(new Date(subscription.startDate), "MMM d, yyyy")}</Info>
            <Info label="Last payment">
              <span className="tabular-nums">{money(subscription.lastPaymentAmount)}</span>
            </Info>
          </dl>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            You pay <b className="tabular-nums text-foreground">{money(price)}</b>
          </span>
          <Button type="submit" disabled={!canSubmit}>
            {paying && <Loader2 className="animate-spin" />}
            {state === "active" ? "Change link" : state === "expired" ? "Renew link" : "Set link"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function useDebounce<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
