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

type Kind = "PAGEASSET" | "PLATFORMASSET" | "ITEM";
/** `balance` is what can be given away now; for an item that's its stock plus what can still be minted (Infinity = open edition). */
type Asset = { code: string; issuer: string; balance: number; kind: Kind; itemId?: number; name?: string; stock?: number };

const KIND_LABEL: Record<Kind, string> = { PAGEASSET: "Page asset", PLATFORMASSET: "Platform", ITEM: "Item" };
const isPubkey = (s: string) => /^G[A-Z2-7]{55}$/.test(s.trim());
const isEmail = (s: string) => z.string().email().safeParse(s.trim()).success;

/** Gifts: send tokens to a fan — pick them from your followers or type their email / wallet. */
export default function GiftsPage() {
  const session = useSession();
  const { needSign } = useNeedSign();
  const { platformAssetBalance } = useUserStellarAcc();

  const pageAsset = api.fan.creator.getCreatorPageAssetBalance.useQuery(undefined, { retry: false });
  const items = api.fan.gift.items.useQuery(undefined, { retry: false });
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
    for (const i of items.data ?? []) {
      list.push({ code: i.code, issuer: i.issuer, balance: i.mintable === null ? Infinity : i.stock + i.mintable, kind: "ITEM", itemId: i.id, name: i.name, stock: i.stock });
    }
    return list;
  }, [pageAsset.data, items.data, platformAssetBalance]);

  const asset = assets.find((a) => `${a.code}-${a.issuer}` === assetKey) ?? null;
  const qty = Number(amount);
  const isItem = asset?.kind === "ITEM";
  const legacyFee = xlmFee.data ? Number(TrxBaseFee) + Number(TrxBaseFeeInPlatformAsset) + xlmFee.data : null;
  const pubkey = resolved?.pubkey ?? (isPubkey(recipient) ? recipient.trim() : null);
  const amountError = !asset ? null : !Number.isInteger(qty) || qty < 1 ? "Whole numbers from 1" : qty > asset.balance ? `Only ${asset.balance} available` : null;
  const ready = Boolean(pubkey && asset && !amountError);

  // Items are lazily minted and the brand pays everything, so ask the server what it costs and whether it will go through.
  const quote = api.fan.gift.quote.useQuery(
    { assetId: asset?.itemId ?? 0, pubkey: pubkey ?? "", quantity: Number.isInteger(qty) && qty > 0 ? qty : 1 },
    { enabled: ready && isItem && Boolean(pubkey && isPubkey(pubkey)), retry: false, staleTime: 15_000 },
  );
  const fee = isItem ? (quote.data?.total ?? null) : legacyFee;
  const itemBlocked = isItem && !quote.data?.ok;
  // True from the moment an item and amount are chosen until the server has priced it.
  const pricing = isItem && ready && (quote.isFetching || quote.isPending);

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
  const prepareItem = api.fan.gift.prepare.useMutation();
  const confirmItem = api.fan.gift.confirm.useMutation();
  const utils = api.useUtils();
  const sendItem = async () => {
    if (!asset?.itemId || !pubkey) return;
    setSigning(true);
    const walletType = session.data?.user?.walletType;
    try {
      console.info("[gift] preparing", { item: asset.itemId, qty, walletType });
      const res = await prepareItem.mutateAsync({ assetId: asset.itemId, pubkey, quantity: qty });
      console.info("[gift] prepared; signing and submitting", { txId: res.txId, delivery: res.quote.delivery });
      // A wallet popup that never answers would otherwise leave this spinning forever.
      const ok = await Promise.race([
        clientsign({ presignedxdr: res.xdr, walletType, pubkey: session.data?.user.id, test: clientSelect() }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Signing took too long. Check your wallet window or network and try again.")), 90_000)),
      ]);
      console.info("[gift] signed and submitted", { ok });
      if (!ok) throw new Error("The transaction wasn't signed");
      const done = await confirmItem.mutateAsync({ txId: res.txId });
      console.info("[gift] confirmed", done);
      if (done.status === "FAILED") throw new Error("The gift didn't go through on Stellar");
      toast.success(res.quote.delivery === "claimable" ? `Sent ${qty} ${asset.name ?? asset.code} 🎁 — they accept it from their wallet` : `Sent ${qty} ${asset.name ?? asset.code} 🎁`);
      setConfirming(false);
      setAmount("1");
      void utils.fan.gift.items.invalidate();
    } catch (e) {
      console.error("[gift] failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't send the gift");
    } finally {
      setSigning(false);
    }
  };
  const busy = send.isPending || signing || prepareItem.isPending;

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
            {pageAsset.isLoading || items.isLoading ? (
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
                        <span className="block truncate font-hud text-sm font-semibold">{a.name ?? a.code}</span>
                        <span className="block text-xs text-muted-foreground">{a.kind === "ITEM" ? (a.balance === Infinity ? "Minted when you send it" : `${KIND_LABEL[a.kind]} · mints on demand`) : KIND_LABEL[a.kind]}</span>
                      </span>
                      <span className="text-sm font-medium tabular-nums">{a.kind === "ITEM" ? `${(a.stock ?? 0).toLocaleString()} in stock` : a.balance.toLocaleString()}</span>
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

          {pricing && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin" /> Checking stock and what it will cost…
            </div>
          )}
          {!pricing && isItem && quote.data && quote.data.problems.length > 0 && (
            <ul className="space-y-1.5">
              {quote.data.problems.map((p) => (
                <li key={p} className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {p}
                </li>
              ))}
            </ul>
          )}
          {!pricing && isItem && quote.data?.ok && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {quote.data.fromStock > 0 && `${quote.data.fromStock} from your stock`}
              {quote.data.fromStock > 0 && quote.data.toMint > 0 && " + "}
              {quote.data.toMint > 0 && `${quote.data.toMint} minted now`} ·{" "}
              {quote.data.delivery === "direct" ? "lands in their wallet right away" : "they don't hold it yet, so it's sent as a gift they accept"}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            {fee !== null && !pricing && (
              <p className="text-xs text-muted-foreground">
                {isItem ? "You pay" : "Fee"} {fee} {PLATFORM_ASSET.code}
              </p>
            )}
            <Button disabled={!ready || busy || itemBlocked || pricing} onClick={() => setConfirming(true)}>
              {pricing ? <Loader2 className="animate-spin" /> : <Send />} {pricing ? "Checking…" : "Send gift"}
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
          isItem
            ? void sendItem()
            : pubkey &&
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
