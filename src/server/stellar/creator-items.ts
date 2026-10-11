import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { Asset, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { Platform } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { WalletType } from "package/connect_wallet/src/lib/enums";

import { env } from "~/env";
import { STELLAR_URL, TrxBaseFee, networkPassphrase } from "~/lib/stellar/constant";
import { WithSing } from "~/lib/stellar/utils";
import type { db as Db } from "~/server/db";

/*
 * Creator items under the lazy-mint model. Every creator has ONE issuer
 * (CreatorIssuer, secret AES-256-GCM encrypted with ISSUER_ENCRYPTION_KEY —
 * the same key and format the fan app uses to mint on demand). Creating an
 * item needs a transaction only when the issuer isn't on-chain yet (first
 * item) or when the creator mints copies into their storage now; otherwise
 * it's just a database row and copies are minted when fans buy or claim.
 */

type DbClient = typeof Db;
type Ctx = { db: DbClient; platform: Pick<Platform, "id">; session: Session };

const BASE_RESERVE = 0.5;
/** Stellar's minimum to open an account (2 base reserves). */
const ISSUER_STARTING_XLM = 1;
const TX_TIMEOUT_SECONDS = 180;
const FEE_XLM = (n: number) => (Number(TrxBaseFee) * n) / 1e7;
const amt = (n: number) => (Math.floor(n * 1e7) / 1e7).toFixed(7);

// ── issuer secrets ───────────────────────────────────────────────────────────

function key() {
  const raw = env.ISSUER_ENCRYPTION_KEY;
  if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Minting isn't configured on this server (ISSUER_ENCRYPTION_KEY)." });
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ISSUER_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
  return buf;
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(payload: string) {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// ── chain helpers ────────────────────────────────────────────────────────────

export const horizon = () => new Horizon.Server(STELLAR_URL);

export async function loadAccount(id: string) {
  try {
    return await horizon().loadAccount(id);
  } catch {
    return null;
  }
}

export function spendableXlm(acc: Horizon.AccountResponse) {
  const native = acc.balances.find((b) => b.asset_type === "native");
  const balance = Number(native?.balance ?? 0);
  const selling = Number(native && "selling_liabilities" in native ? native.selling_liabilities : 0);
  const { num_sponsoring = 0, num_sponsored = 0 } = acc as unknown as { num_sponsoring?: number; num_sponsored?: number };
  const reserves = (2 + acc.subentry_count + num_sponsoring - num_sponsored) * BASE_RESERVE;
  return Math.max(0, balance - reserves - selling);
}

const CUSTODIAL = new Set<string>([WalletType.emailPass, WalletType.google, WalletType.facebook, WalletType.apple]);
/** Custodial creators are signed for here; wallet creators sign in the browser. */
export const signerFor = (session: Session) => (CUSTODIAL.has(session.user.walletType) && session.user.email ? { email: session.user.email } : undefined);

/** The creator's issuer row, made (keypair generated, secret encrypted) on first use. */
async function issuerFor(db: DbClient, creatorId: string) {
  const existing = await db.creatorIssuer.findUnique({ where: { creatorId } });
  if (existing) return existing;
  const kp = Keypair.random();
  return db.creatorIssuer.create({ data: { creatorId, publicKey: kp.publicKey(), secretEncrypted: encryptSecret(kp.secret()) } });
}

// ── quote ────────────────────────────────────────────────────────────────────

export type CostLine = { label: string; amount: number; hint?: string };
export type CreateItemQuote = {
  issuerPublicKey: string;
  needsIssuer: boolean;
  mintNow: number;
  lines: CostLine[];
  /** XLM the creator's wallet pays (0 = no transaction needed) */
  totalXlm: number;
  spendableXlm: number;
  ok: boolean;
  problems: string[];
};

/** What creating an item will cost the creator in XLM, and whether it can go through. */
export async function quoteCreateItem(db: DbClient, creatorId: string, { code, mintNow, limit }: { code: string; mintNow: number; limit: number | null }): Promise<CreateItemQuote> {
  const problems: string[] = [];
  const issuer = await issuerFor(db, creatorId);
  const [creatorAcc, creator, taken] = await Promise.all([
    loadAccount(creatorId),
    db.creator.findUnique({ where: { id: creatorId }, select: { storagePub: true } }),
    code ? db.asset.findFirst({ where: { code: { equals: code, mode: "insensitive" }, issuer: issuer.publicKey }, select: { id: true } }) : null,
  ]);
  const issuerOnChain = issuer.active || Boolean(await loadAccount(issuer.publicKey));
  if (!issuer.active && issuerOnChain) await db.creatorIssuer.update({ where: { creatorId }, data: { active: true } });

  if (taken) problems.push(`You already have an item with the code ${code.toUpperCase()}. Pick another code.`);
  if (limit != null && mintNow > limit) problems.push(`You can't mint more than the supply (${limit}).`);
  if (mintNow > 0 && !(creator?.storagePub && (await loadAccount(creator.storagePub)))) problems.push("Your storage account isn't set up yet, so copies can't be minted now. Choose “Mint later”.");

  const needsIssuer = !issuerOnChain;
  const ops = (needsIssuer ? 2 : 0) + (mintNow > 0 ? 3 : 0);
  const lines: CostLine[] = [];
  if (needsIssuer) lines.push({ label: "Issuer account", amount: ISSUER_STARTING_XLM, hint: "One time — opens the account all your items are minted from" });
  if (mintNow > 0) lines.push({ label: "Storage reserve", amount: BASE_RESERVE, hint: "Lets your storage hold this item; stays in your storage" });
  if (ops > 0) lines.push({ label: "Network fee", amount: FEE_XLM(1) });
  const totalXlm = lines.reduce((s, l) => s + l.amount, 0);

  const spendable = creatorAcc ? spendableXlm(creatorAcc) : 0;
  if (totalXlm > 0 && !creatorAcc) problems.push("Your wallet isn't active on Stellar yet.");
  else if (totalXlm > spendable) problems.push(`You need ${totalXlm} XLM available; you have ${Math.floor(spendable * 1e7) / 1e7} XLM.`);

  return { issuerPublicKey: issuer.publicKey, needsIssuer, mintNow, lines, totalXlm, spendableXlm: spendable, ok: problems.length === 0, problems };
}

// ── create + confirm ─────────────────────────────────────────────────────────

export type CreateItemInput = {
  name: string;
  description: string;
  code: string;
  mediaType: "IMAGE" | "VIDEO" | "MUSIC" | "THREE_D";
  mediaUrl: string;
  thumbnail: string;
  price: number;
  priceUSD: number;
  limit: number | null;
  royaltyPercent: number;
  mintNow: number;
  privacy: "PUBLIC" | "PRIVATE" | "TIER";
  tierId?: number;
};

/**
 * Saves the item and its listing. Returns a transaction to sign only when the
 * issuer must be opened or copies are minted now; `confirmCreateItem` then
 * settles it (and removes the item if it failed).
 */
export async function createItem(ctx: Ctx, input: CreateItemInput) {
  const creatorId = ctx.session.user.id;
  const code = input.code.toUpperCase();
  const q = await quoteCreateItem(ctx.db, creatorId, { code, mintNow: input.mintNow, limit: input.limit });
  if (!q.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: q.problems[0] ?? "This item can't be created." });

  const asset = await ctx.db.asset.create({
    data: {
      code,
      issuer: q.issuerPublicKey,
      name: input.name,
      description: input.description,
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      thumbnail: input.thumbnail,
      limit: input.limit,
      royaltyPercent: input.royaltyPercent,
      privacy: input.privacy,
      tierId: input.tierId,
      creatorId,
      platformId: ctx.platform.id,
      marketItems: { create: { price: input.price, priceUSD: input.priceUSD, placerId: creatorId, privacy: input.privacy, type: "FAN", platformId: ctx.platform.id } },
    },
    select: { id: true },
  });

  if (q.totalXlm === 0) return { assetId: asset.id, txId: null, xdr: null };

  const issuerRow = await ctx.db.creatorIssuer.findUniqueOrThrow({ where: { creatorId } });
  const issuerKp = Keypair.fromSecret(decryptSecret(issuerRow.secretEncrypted));
  const creatorAcc = await horizon().loadAccount(creatorId);
  const tx = new TransactionBuilder(creatorAcc, { fee: TrxBaseFee, networkPassphrase }).setTimeout(TX_TIMEOUT_SECONDS);
  const signers: Keypair[] = [];

  if (q.needsIssuer) {
    tx.addOperation(Operation.createAccount({ destination: issuerKp.publicKey(), startingBalance: amt(ISSUER_STARTING_XLM) }));
    tx.addOperation(Operation.setOptions({ source: issuerKp.publicKey(), homeDomain: env.NEXT_PUBLIC_HOME_DOMAIN }));
    signers.push(issuerKp);
  }
  if (input.mintNow > 0) {
    const creator = await ctx.db.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { storagePub: true, storageSecret: true } });
    const storageKp = Keypair.fromSecret(creator.storageSecret);
    const stellarAsset = new Asset(code, issuerKp.publicKey());
    tx.addOperation(Operation.payment({ destination: creator.storagePub, asset: Asset.native(), amount: amt(BASE_RESERVE) }));
    tx.addOperation(Operation.changeTrust({ source: creator.storagePub, asset: stellarAsset }));
    tx.addOperation(Operation.payment({ source: issuerKp.publicKey(), destination: creator.storagePub, asset: stellarAsset, amount: amt(input.mintNow) }));
    if (!signers.includes(issuerKp)) signers.push(issuerKp);
    signers.push(storageKp);
  }
  const built = tx.build();
  built.sign(...signers);

  const row = await ctx.db.assetTransaction.create({
    data: {
      type: input.mintNow > 0 ? "MINT_TO_STORAGE" : "ISSUER_SETUP",
      assetId: asset.id,
      creatorId,
      quantity: Math.max(1, input.mintNow),
      minted: input.mintNow,
      method: "XLM",
      currency: "XLM",
      reserveCost: (q.needsIssuer ? ISSUER_STARTING_XLM : 0) + (input.mintNow > 0 ? BASE_RESERVE : 0),
      networkFee: FEE_XLM(1),
      total: q.totalXlm,
      txHash: built.hash().toString("hex"),
      expiresAt: new Date(Date.now() + TX_TIMEOUT_SECONDS * 1000),
      platformId: ctx.platform.id,
    },
  });
  const xdr = await WithSing({ xdr: built.toXDR(), signWith: signerFor(ctx.session) });
  return { assetId: asset.id, txId: row.id, xdr };
}

async function txSucceeded(hash: string): Promise<boolean | null> {
  try {
    const t = await horizon().transactions().transaction(hash).call();
    return t.successful;
  } catch {
    return null; // not on the ledger (yet)
  }
}

/** After signing: record the result. Success marks the issuer active and counts minted copies; failure removes the item. */
export async function confirmCreateItem(db: DbClient, creatorId: string, txId: string) {
  const row = await db.assetTransaction.findFirst({ where: { id: txId, creatorId } });
  if (!row?.txHash) throw new TRPCError({ code: "NOT_FOUND" });
  if (row.status !== "PENDING") return { status: row.status };

  let ok: boolean | null = null;
  for (let i = 0; i < 6 && ok === null; i++) {
    ok = await txSucceeded(row.txHash);
    if (ok === null) await new Promise((r) => setTimeout(r, 1500));
  }
  if (ok === null && row.expiresAt && row.expiresAt > new Date()) return { status: "PENDING" as const };

  if (ok) {
    await db.$transaction([
      db.assetTransaction.update({ where: { id: row.id }, data: { status: "SUCCESS", error: null } }),
      db.creatorIssuer.update({ where: { creatorId }, data: { active: true } }),
      ...(row.assetId && row.minted > 0 ? [db.asset.update({ where: { id: row.assetId }, data: { mintedCount: { increment: row.minted } } })] : []),
    ]);
    return { status: "SUCCESS" as const };
  }
  await db.assetTransaction.update({ where: { id: row.id }, data: { status: "FAILED", error: "The transaction didn't go through on Stellar." } });
  if (row.assetId) await db.asset.delete({ where: { id: row.assetId } }).catch(() => undefined);
  return { status: "FAILED" as const };
}

/** The creator cancelled signing: remove the unconfirmed item. */
export async function cancelCreateItem(db: DbClient, creatorId: string, txId: string) {
  const row = await db.assetTransaction.findFirst({ where: { id: txId, creatorId, status: "PENDING" } });
  if (!row) return;
  // still could have landed — only delete if Stellar doesn't know it
  if (row.txHash && (await txSucceeded(row.txHash)) === true) return confirmCreateItem(db, creatorId, txId);
  await db.assetTransaction.update({ where: { id: row.id }, data: { status: "FAILED", error: "Cancelled before signing." } });
  if (row.assetId) await db.asset.delete({ where: { id: row.assetId } }).catch(() => undefined);
}
