import "server-only";

import { TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import type { Platform } from "@prisma/client";

import { networkPassphrase } from "~/lib/stellar/constant";
import type { db as Db } from "~/server/db";
import { notifyFan } from "~/server/notify";

import { horizon } from "./creator-items";

type DbClient = typeof Db;

const hashOf = (tx: Transaction) => {
  const h = tx.hash() as unknown;
  return typeof h === "string" ? h : Buffer.from(h as Uint8Array).toString("hex");
};

/** Who a gift transaction is for, and what: its payment, or its claimable balance. */
function giftOf(tx: Transaction) {
  for (const op of tx.operations) {
    if (op.type === "payment" && op.asset.getCode() !== "XLM") {
      return { to: op.destination, code: op.asset.getCode(), amount: Number(op.amount) };
    }
    if (op.type === "createClaimableBalance" && !op.asset.isNative()) {
      const claimant = op.claimants[0];
      if (claimant) return { to: claimant.destination, code: op.asset.getCode(), amount: Number(op.amount) };
    }
  }
  return null;
}

/**
 * Page-token and platform-token gifts are signed and submitted in the browser, so the server
 * never sees the result. After the brand's wallet submitted one, this checks it on Stellar,
 * records it, and tells the fan — once. Only gifts to the brand's own followers count.
 */
export async function confirmTokenGift(db: DbClient, creatorId: string, xdr: string, platformId: Platform["id"]) {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, networkPassphrase) as Transaction;
  } catch {
    return { status: "INVALID" as const };
  }
  const gift = giftOf(tx);
  if (!gift) return { status: "INVALID" as const };
  const follower = await db.follow.findUnique({ where: { userId_creatorId: { userId: gift.to, creatorId } }, select: { id: true } });
  if (!follower) return { status: "INVALID" as const };

  const txHash = hashOf(tx);
  let ok: boolean | null = null;
  for (let i = 0; i < 6 && ok === null; i++) {
    try {
      ok = (await horizon().transactions().transaction(txHash).call()).successful;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (ok === null) return { status: "PENDING" as const };
  if (!ok) return { status: "FAILED" as const };

  // Already recorded (a second confirm of the same gift): nothing more to do, and no second notification.
  if (await db.assetTransaction.findUnique({ where: { txHash }, select: { id: true } })) return { status: "SUCCESS" as const };
  try {
    await db.assetTransaction.create({
      data: {
        type: "TRANSFER",
        status: "SUCCESS",
        buyerId: creatorId, // the sender
        sellerId: gift.to, // the recipient
        quantity: Math.max(1, Math.floor(gift.amount)),
        method: "PLATFORM_ASSET",
        currency: gift.code,
        price: gift.amount,
        total: gift.amount,
        txHash,
        platformId,
      },
    });
  } catch {
    return { status: "SUCCESS" as const };
  }
  await notifyFan(db, { actorId: creatorId, type: "GIFT_RECEIVED", entityId: 0, userId: gift.to, meta: { item: gift.code, assetId: 0, qty: Math.floor(gift.amount), amount: gift.amount, currency: gift.code } });
  return { status: "SUCCESS" as const };
}

