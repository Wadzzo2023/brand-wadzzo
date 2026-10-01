"use client";

import { Check, Coins, Gift, Loader2, Search, Send, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { clientsign } from "package/connect_wallet";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { z } from "zod";

import CustomAvatar from "~/components/common/custom-avatar";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import useNeedSign from "~/lib/hook";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { PLATFORM_ASSET, TrxBaseFee, TrxBaseFeeInPlatformAsset } from "~/lib/stellar/constant";
import { clientSelect } from "~/lib/stellar/fan/utils";
import { cn } from "~/lib/utils";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { EmptyState } from "~/ui/empty-state";
import { Field, FormSection } from "~/ui/form-page";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
import { api, type RouterInputs } from "~/utils/api";
import { fetchPubkeyfromEmail } from "~/utils/get-pubkey";
import { addrShort } from "~/utils/utils";

type Kind = "PAGEASSET" | "PLATFORMASSET" | "SHOPASSET";
type Asset = { code: string; issuer: string; balance: number; kind: Kind };

const KIND_LABEL: Record<Kind, string> = { PAGEASSET: "Page asset", PLATFORMASSET: "Platform", SHOPASSET: "Store asset" };
const isPubkey = (s: string) => /^G[A-Z2-7]{55}$/.test(s.trim());
const isEmail = (s: string) => z.string().email().safeParse(s.trim()).success;

/** Gifts: send tokens to a fan — pick them from your followers or type their email / wallet. */
export default function GiftsPage() {
  const session = useSession();
  const { needSign } = useNeedSign();
  const { platformAssetBalance } = useUserStellarAcc();

  const pageAsset = api.fan.creator.getCreatorPageAssetBalance.useQuery(undefined, { retry: false });
  const shop = api.fan.creator.getCreatorShopAssetBalance.useQuery(undefined, { retry: false });
  const xlmFee = api.bounty.Bounty.getplatformAssetNumberForXLM.useQuery({ xlm: 1 });

  const [recipient, setRecipient] = useState("");
  const [resolved, setResolved] = useState<{ pubkey: string; label: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [assetKey, setAssetKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [confirming, setConfirming] = useState(false);
  const [signing, setSigning] = useState(false);

  const assets = useMemo<Asset[]>(() => {
    const list: Asset[] = [];
    if (pageAsset.data) list.push({ code: pageAsset.data.assetCode, issuer: pageAsset.data.assetIssuer, balance: Number(pageAsset.data.balance), kind: "PAGEASSET" });
    list.push({ code: PLATFORM_ASSET.code, issuer: PLATFORM_ASSET.issuer, balance: platformAssetBalance, kind: "PLATFORMASSET" });
    for (const b of shop.data ?? []) {
      if (b.asset_type !== "credit_alphanum4" && b.asset_type !== "credit_alphanum12") continue;
      const isPage = pageAsset.data && b.asset_code === pageAsset.data.assetCode && b.asset_issuer === pageAsset.data.assetIssuer;
      const isPlatform = b.asset_code === PLATFORM_ASSET.code && b.asset_issuer === PLATFORM_ASSET.issuer;
      if (!isPage && !isPlatform) list.push({ code: b.asset_code, issuer: b.asset_issuer, balance: Number(b.balance), kind: "SHOPASSET" });
    }
    return list;
  }, [pageAsset.data, shop.data, platformAssetBalance]);

  const asset = assets.find((a) => `${a.code}-${a.issuer}` === assetKey) ?? null;
  const qty = Number(amount);
  const fee = xlmFee.data ? Number(TrxBaseFee) + Number(TrxBaseFeeInPlatformAsset) + xlmFee.data : null;
  const pubkey = resolved?.pubkey ?? (isPubkey(recipient) ? recipient.trim() : null);
  const amountError = !asset ? null : !Number.isInteger(qty) || qty < 1 ? "Whole numbers from 1" : qty > asset.balance ? `You have ${asset.balance}` : null;
  const ready = Boolean(pubkey && asset && !amountError);

  const lookup = async () => {
    setLooking(true);
    try {
      const pk = await fetchPubkeyfromEmail(recipient.trim());
      setResolved({ pubkey: pk, label: recipient.trim() });
    } catch {
      toast.error("No Wadzzo account uses that email");
    } finally {
      setLooking(false);
    }
  };

  const send = api.fan.trx.giftFollowerXDR.useMutation({
    onSuccess: async (xdr) => {
      if (!xdr) return;
      setSigning(true);
      try {
        const ok = await clientsign({ presignedxdr: xdr, walletType: session.data?.user?.walletType, pubkey: session.data?.user.id, test: clientSelect() });
        if (ok) {
          toast.success(`Sent ${qty} ${asset?.code} 🎁`);
          setConfirming(false);
          setAmount("1");
        } else toast.error("The transaction wasn't signed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't send the gift");
      } finally {
        setSigning(false);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const busy = send.isPending || signing;

  const pickFan = (pk: string, name: string | null) => {
    setRecipient(pk);
    setResolved({ pubkey: pk, label: name ?? addrShort(pk, 5) });
  };

  return (
    <PageBody>
      <PageHeader eyebrow="Commerce" title="Gifts" description="Send tokens to a fan as a thank-you — your page asset, the platform token or a store asset." />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <FormSection title="Who" icon={Users} description="Pick a follower, or enter an email or wallet address.">
            <Field
              label="Recipient"
              htmlFor="recipient"
              hint={resolved ? <span className="text-primary">Sending to {resolved.label} · {addrShort(resolved.pubkey, 5)}</span> : undefined}
              error={recipient && !pubkey && !isEmail(recipient) ? "Enter an email or a Stellar address (G…)" : undefined}
            >
              <div className="flex gap-2">
                <Input
                  id="recipient"
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    setResolved(null);
                  }}
                  placeholder="fan@email.com or G…"
                />
                {isEmail(recipient) && !resolved && (
                  <Button type="button" variant="outline" onClick={() => void lookup()} disabled={looking}>
                    {looking ? <Loader2 className="animate-spin" /> : <Search />} Find
                  </Button>
                )}
              </div>
            </Field>
          </FormSection>

          <FormSection title="What" icon={Coins}>
            {pageAsset.isLoading || shop.isLoading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Asset">
                {assets.map((a) => {
                  const key = `${a.code}-${a.issuer}`;
                  const on = key === assetKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={a.balance <= 0}
                      onClick={() => setAssetKey(key)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
                        on ? "border-primary bg-primary/5" : "hover:border-line-bright",
                      )}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 font-hud text-[10px] font-semibold">{a.code.slice(0, 4)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-hud text-sm font-semibold">{a.code}</span>
                        <span className="block text-xs text-muted-foreground">{KIND_LABEL[a.kind]}</span>
                      </span>
                      <span className="text-sm font-medium tabular-nums">{a.balance.toLocaleString()}</span>
                      {on && <Check className="size-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
            {!pageAsset.isLoading && !pageAsset.data && <p className="text-xs text-muted-foreground">You don&apos;t have a page asset yet — set one up in Settings to gift your own token.</p>}
            <Field label="Amount" htmlFor="amount" error={amountError ?? undefined}>
              <Input id="amount" type="number" min={1} step={1} className="max-w-[200px]" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!asset} />
            </Field>
          </FormSection>

          <div className="flex items-center justify-end gap-3">
            {fee !== null && (
              <p className="text-xs text-muted-foreground">
                Fee {fee} {PLATFORM_ASSET.code}
              </p>
            )}
            <Button disabled={!ready || busy} onClick={() => setConfirming(true)}>
              <Send /> Send gift
            </Button>
          </div>
        </div>

        <FansPanel onPick={pickFan} selected={pubkey} />
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive={false}
        title="Send this gift?"
        description={
          <>
            {qty} {asset?.code} to {resolved?.label ?? (pubkey ? addrShort(pubkey, 5) : "")}
            {fee !== null && ` · fee ${fee} ${PLATFORM_ASSET.code}`}. Gifts can&apos;t be undone.
          </>
        }
        confirmLabel="Send gift"
        busy={busy}
        onConfirm={() =>
          pubkey &&
          asset &&
          send.mutate({ pubkey, amount: qty, assetCode: asset.code, assetIssuer: asset.issuer, assetType: asset.kind as RouterInputs["fan"]["trx"]["giftFollowerXDR"]["assetType"], signWith: needSign() })
        }
      />
    </PageBody>
  );
}

function FansPanel({ onPick, selected }: { onPick: (pubkey: string, name: string | null) => void; selected: string | null }) {
  const fans = api.fan.creator.getFansList.useQuery();
  const [q, setQ] = useState("");
  const list = (fans.data ?? []).filter((f) => {
    const s = q.trim().toLowerCase();
    return !s || (f.user.name ?? "").toLowerCase().includes(s) || f.user.id.toLowerCase().includes(s);
  });

  return (
    <aside className="rounded-xl border bg-card lg:sticky lg:top-6 lg:self-start">
      <div className="border-b p-4">
        <h2 className="flex items-center gap-2 font-hud text-base font-semibold">
          <Gift className="size-4 text-primary" /> Your followers
          {fans.data && <span className="ml-auto text-xs font-normal text-muted-foreground">{fans.data.length}</span>}
        </h2>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search followers" className="pl-9" aria-label="Search followers" />
        </div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {fans.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : !fans.data?.length ? (
          <EmptyState icon={Users} title="No followers yet" description="Fans who follow your page show up here." className="m-4 py-8" />
        ) : (
          <ul className="divide-y">
            {list.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onPick(f.user.id, f.user.name)}
                  className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent", selected === f.user.id && "bg-primary/5")}
                >
                  <CustomAvatar url={f.user.image} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.user.name ?? "Fan"}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{addrShort(f.user.id, 6)}</span>
                  </span>
                  {selected === f.user.id && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
