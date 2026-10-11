import "server-only";

import { Asset, Claimant, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { Platform } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";

import { env } from "~/env";
import { getplatformAssetNumberForXLM } from "~/lib/stellar/fan/get_token_price";
import { PLATFORM_ASSET, TrxBaseFee, TrxBaseFeeInPlatformAsset, networkPassphrase } from "~/lib/stellar/constant";
import { WithSing } from "~/lib/stellar/utils";
import type { db as Db } from "~/server/db";
import { notifyFan } from "~/server/notify";

import { decryptSecret, horizon, loadAccount, signerFor } from "./creator-items";

/*
 * Gifting a brand's item to a follower, lazily minted.
 *
 * Copies come from the brand's storage stock first; when that's empty the
 * issuer mints the copy straight to the fan (up to the item's limit). The
 * BRAND pays for all of it — from the wallet it's logged in with, in Wadzzo,
 * the same way every gift has always paid its fees: a fee bundle goes to the
 * platform account, which fronts the network fee. The storage account only
 * supplies stock; it pays nothing.
 *
 * A fan who already holds the item gets it directly. A fan who doesn't can't
 * receive it yet (that needs their trustline), so it's sent as a claimable
 * gift they accept from their wallet — for which the brand also covers the
 * 0.5 XLM the sending account must lock.
 */
type DbClient = typeof Db;
type Ctx = { db: DbClient; platform: Pick<Platform, "id">; session: Session };

const TX_TIMEOUT_SECONDS = 180;
const amt = (n: number) => (Math.round(n * 1e7) / 1e7).toFixed(7);

export type GiftLine = { label: string; amount: number; hint?: string };
export type GiftItemQuote = {
  item: { id: number; name: string; thumbnail: string; code: string } | null;
  quantity: number;
  /** direct = lands in the fan's wallet now; claimable = the fan accepts it (they don't hold the item yet) */
  delivery: "direct" | "claimable";
  fromStock: number;
  toMint: number;
  /** what the brand pays, in Wadzzo, from the wallet it's logged in with */
  lines: GiftLine[];
  total: number;
  currency: string;
  balance: number;
  ok: boolean;
  problems: string[];
};

const stellarAsset = (a: { code: string; issuer: string }) => new Asset(a.code, a.issuer);

/** Copies held by unexpired PENDING transactions: minted ones count against supply, the rest against stock. */
async function pending(db: DbClient, assetId: number) {
  const rows = await db.assetTransaction.findMany({
    where: { assetId, status: "PENDING", expiresAt: { gt: new Date() }, type: { in: ["PURCHASE", "CLAIM", "GIFT"] } },
    select: { minted: true, quantity: true },
  });
  return { minting: rows.reduce((s, r) => s + r.minted, 0), fromStock: rows.reduce((s, r) => s + (r.quantity - r.minted), 0) };
}

const balanceOf = (acc: Awaited<ReturnType<typeof loadAccount>>, code: string, issuer: string) =>
  Number(acc?.balances.find((b) => (b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12") && b.asset_code === code && b.asset_issuer === issuer)?.balance ?? 0);

/** Whether the account holds a trustline for the asset (even at a zero balance). */
const hasTrust = (acc: Awaited<ReturnType<typeof loadAccount>>, code: string, issuer: string) =>
  Boolean(acc?.balances.some((b) => (b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12") && b.asset_code === code && b.asset_issuer === issuer));

async function load(db: DbClient, creatorId: string, assetId: number) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, creatorId },
    select: { id: true, name: true, code: true, issuer: true, thumbnail: true, limit: true, mintedCount: true },
  });
  if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "That item isn't yours." });
  const creator = await db.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { storagePub: true } });
  return { asset, storagePub: creator.storagePub };
}

/** The issuer keypair when this item can still be minted (the encryption key is set and the issuer is on-chain). */
async function mintingIssuer(db: DbClient, creatorId: string, asset: { issuer: string }) {
  if (!env.ISSUER_ENCRYPTION_KEY) return null;
  const row = await db.creatorIssuer.findUnique({ where: { creatorId } });
  if (row?.publicKey !== asset.issuer) return null;
  if (!(await loadAccount(row.publicKey))) return null;
  return Keypair.fromSecret(decryptSecret(row.secretEncrypted));
}

/** How many copies the brand can hand out right now: stock, plus what the item's limit still lets it mint. */
async function availability(db: DbClient, creatorId: string, asset: { id: number; code: string; issuer: string; limit: number | null; mintedCount: number }, storagePub: string) {
  const [held, storage, issuer] = await Promise.all([pending(db, asset.id), loadAccount(storagePub), mintingIssuer(db, creatorId, asset)]);
  const stock = Math.max(0, Math.floor(balanceOf(storage, asset.code, asset.issuer) - held.fromStock));
  const mintable = issuer ? (asset.limit == null ? Infinity : Math.max(0, asset.limit - asset.mintedCount - held.minting)) : 0;
  return { stock, mintable, issuer };
}

/** The brand's items and how many copies of each it could give away right now. */
export async function giftableItems(db: DbClient, creatorId: string) {
  const [assets, creator] = await Promise.all([
    db.asset.findMany({
      where: { creatorId },
      select: { id: true, name: true, code: true, issuer: true, thumbnail: true, limit: true, mintedCount: true },
      orderBy: { id: "desc" },
    }),
    db.creator.findUnique({ where: { id: creatorId }, select: { storagePub: true } }),
  ]);
  if (!assets.length || !creator) return [];
  const storage = await loadAccount(creator.storagePub);
  const canMint = Boolean(env.ISSUER_ENCRYPTION_KEY) && Boolean((await db.creatorIssuer.findUnique({ where: { creatorId } }))?.active);
  return assets.map((a) => {
    const stock = Math.floor(balanceOf(storage, a.code, a.issuer));
    const mintable = canMint ? (a.limit == null ? null : Math.max(0, a.limit - a.mintedCount)) : 0;
    return { id: a.id, name: a.name, code: a.code, issuer: a.issuer, thumbnail: a.thumbnail, stock, mintable, giftable: stock > 0 || mintable === null || mintable > 0 };
  });
}

export async function quoteGiftItem(db: DbClient, creatorId: string, { assetId, pubkey, quantity }: { assetId: number; pubkey: string; quantity: number }): Promise<GiftItemQuote> {
  const { asset, storagePub } = await load(db, creatorId, assetId);
  const problems: string[] = [];
  const currency = PLATFORM_ASSET.code;

  const [isFollower, recipient, brand, avail] = await Promise.all([
    db.follow.findUnique({ where: { userId_creatorId: { userId: pubkey, creatorId } }, select: { id: true } }),
    loadAccount(pubkey),
    loadAccount(creatorId),
    availability(db, creatorId, asset, storagePub),
  ]);
  if (!isFollower) problems.push("Only your followers can receive gifts.");
  if (pubkey === creatorId) problems.push("You can't gift to yourself.");

  const total = avail.stock + avail.mintable;
  if (total <= 0) problems.push("No copies are left to give — the item is out of stock and fully minted.");
  else if (quantity > total) problems.push(`Only ${total === Infinity ? "unlimited" : total} cop${total === 1 ? "y is" : "ies are"} available.`);
  const fromStock = Math.min(avail.stock, quantity);
  const toMint = quantity - fromStock;

  const delivery = hasTrust(recipient, asset.code, asset.issuer) ? "direct" : "claimable";

  // What the brand pays, in Wadzzo.
  const lines: GiftLine[] = [{ label: "Network fee", amount: Number(TrxBaseFeeInPlatformAsset), hint: "Covers the Stellar transaction" }];
  if (delivery === "claimable") {
    const sources = (fromStock > 0 ? 1 : 0) + (toMint > 0 ? 1 : 0);
    const reserve = await getplatformAssetNumberForXLM(1).catch(() => 0);
    if (reserve > 0) lines.push({ label: "Gift reserve", amount: reserve * sources, hint: "They don't hold this item yet, so it's sent as a gift they accept. Stellar locks a little XLM until they do." });
  }
  const sum = lines.reduce((s, l) => s + l.amount, 0);

  const balance = balanceOf(brand, PLATFORM_ASSET.code, PLATFORM_ASSET.issuer);
  if (!brand) problems.push("Your wallet isn't active on Stellar yet.");
  else if (!hasTrust(brand, PLATFORM_ASSET.code, PLATFORM_ASSET.issuer)) problems.push(`Your wallet doesn't hold ${currency} yet.`);
  else if (balance < sum) problems.push(`You need ${Math.ceil(sum - balance)} more ${currency} to cover the fees (balance ${balance}).`);
  if (toMint > 0 && !avail.issuer) problems.push("This item can't be minted right now, so only copies in stock can be gifted.");

  return {
    item: { id: asset.id, name: asset.name, thumbnail: asset.thumbnail, code: asset.code },
    quantity,
    delivery,
    fromStock,
    toMint,
    lines,
    total: sum,
    currency,
    balance,
    ok: problems.length === 0,
    problems,
  };
}

/**
 * Re-checks everything, then builds the transaction and records it as a
 * PENDING gift (holding the copies until it expires). The brand signs; the
 * supply check runs under a row lock on the item.
 */
export async function prepareGiftItem(ctx: Ctx, input: { assetId: number; pubkey: string; quantity: number }) {
  const creatorId = ctx.session.user.id;
  return ctx.db.$transaction(
    async (tx) => {
      const db = tx as unknown as DbClient;
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`;
      const q = await quoteGiftItem(db, creatorId, input);
      if (!q.ok || !q.item) throw new TRPCError({ code: "PRECONDITION_FAILED", message: q.problems[0] ?? "This gift can't be sent." });

      const { asset } = await load(db, creatorId, input.assetId);
      const token = stellarAsset(asset);
      const mother = Keypair.fromSecret(env.MOTHER_SECRET);
      const motherPub = mother.publicKey();
      const signers: Keypair[] = [mother];

      const builder = new TransactionBuilder(await horizon().loadAccount(motherPub), { fee: TrxBaseFee, networkPassphrase }).setTimeout(TX_TIMEOUT_SECONDS);
      // The brand's fee bundle to the platform (this is the op the brand signs).
      builder.addOperation(Operation.payment({ source: creatorId, destination: motherPub, asset: PLATFORM_ASSET, amount: amt(q.total) }));

      const deliver = (source: Keypair, qty: number) => {
        if (q.delivery === "direct") {
          builder.addOperation(Operation.payment({ source: source.publicKey(), destination: input.pubkey, asset: token, amount: amt(qty) }));
        } else {
          // the sending account locks a little XLM for the claimable balance; the platform tops it up
          builder.addOperation(Operation.payment({ source: motherPub, destination: source.publicKey(), asset: Asset.native(), amount: "1.0000000" }));
          builder.addOperation(
            Operation.createClaimableBalance({
              source: source.publicKey(),
              asset: token,
              amount: amt(qty),
              claimants: [new Claimant(input.pubkey, Claimant.predicateUnconditional())],
            }),
          );
        }
        signers.push(source);
      };
      if (q.fromStock > 0) {
        const creator = await db.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { storageSecret: true } });
        deliver(Keypair.fromSecret(creator.storageSecret), q.fromStock);
      }
      if (q.toMint > 0) {
        const issuer = await mintingIssuer(db, creatorId, asset);
        if (!issuer) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This item can't be minted right now." });
        deliver(issuer, q.toMint);
      }

      const built = builder.build();
      built.sign(...signers);

      const row = await db.assetTransaction.create({
        data: {
          type: "GIFT",
          assetId: asset.id,
          quantity: input.quantity,
          minted: q.toMint,
          // A direct gift is the fan's; a claimable one is theirs only once they accept (then it's a GIFT_CLAIM), so it
          // names them as the other party instead of as the owner.
          buyerId: q.delivery === "direct" ? input.pubkey : null,
          sellerId: q.delivery === "claimable" ? input.pubkey : null,
          creatorId,
          method: "PLATFORM_ASSET",
          currency: q.currency,
          networkFee: q.lines.find((l) => l.label === "Network fee")?.amount ?? 0,
          reserveCost: q.lines.filter((l) => l.label === "Gift reserve").reduce((s, l) => s + l.amount, 0),
          total: q.total,
          txHash: built.hash().toString("hex"),
          expiresAt: new Date(Date.now() + TX_TIMEOUT_SECONDS * 1000),
          platformId: ctx.platform.id,
        },
      });
      return { txId: row.id, xdr: await WithSing({ xdr: built.toXDR(), signWith: signerFor(ctx.session) }), quote: q };
    },
    { timeout: 30_000 },
  );
}

async function txSucceeded(hash: string): Promise<boolean | null> {
  try {
    return (await horizon().transactions().transaction(hash).call()).successful;
  } catch {
    return null;
  }
}

/** After the brand signed: settle from Stellar. Success counts minted copies, records ownership for a direct gift, and tells the fan. */
export async function confirmGiftItem(db: DbClient, creatorId: string, txId: string) {
  const row = await db.assetTransaction.findFirst({ where: { id: txId, creatorId, type: "GIFT" } });
  if (!row?.txHash) throw new TRPCError({ code: "NOT_FOUND" });
  if (row.status !== "PENDING") return { status: row.status };

  let ok: boolean | null = null;
  for (let i = 0; i < 6 && ok === null; i++) {
    ok = await txSucceeded(row.txHash);
    if (ok === null) await new Promise((r) => setTimeout(r, 1500));
  }
  if (ok === null) {
    if (row.expiresAt && row.expiresAt > new Date()) return { status: "PENDING" as const };
    await db.assetTransaction.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "FAILED", error: "The gift expired before it was submitted." } });
    return { status: "FAILED" as const };
  }
  if (!ok) {
    await db.assetTransaction.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "FAILED", error: "The transaction failed on the Stellar network." } });
    return { status: "FAILED" as const };
  }

  // Only the first settler (here or in the fan app) applies the effects.
  const applied = await db.$transaction(async (tx) => {
    const { count } = await tx.assetTransaction.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "SUCCESS", error: null } });
    if (count === 0) return false;
    if (row.assetId && row.minted > 0) await tx.asset.update({ where: { id: row.assetId }, data: { mintedCount: { increment: row.minted } } });
    if (row.assetId && row.buyerId) await tx.user_Asset.create({ data: { userId: row.buyerId, assetId: row.assetId } });
    return true;
  });
  if (applied) {
    const to = row.buyerId ?? row.sellerId;
    const asset = row.assetId ? await db.asset.findUnique({ where: { id: row.assetId }, select: { name: true } }) : null;
    if (to) await notifyFan(db, { actorId: creatorId, type: "GIFT_RECEIVED", entityId: row.assetId ?? 0, userId: to, meta: { item: asset?.name ?? "", assetId: row.assetId ?? 0, qty: row.quantity } });
  }
  return { status: "SUCCESS" as const };
}
