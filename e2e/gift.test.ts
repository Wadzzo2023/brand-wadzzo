import { createCipheriv, randomBytes } from "crypto";

import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

process.loadEnvFile(".env.development");

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fund(kp: Keypair) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  expect(r.ok).toBe(true);
  for (let i = 0; i < 20; i++) {
    try {
      await server.loadAccount(kp.publicKey());
      return;
    } catch {
      await sleep(1500);
    }
  }
}

async function send(source: Keypair, build: (tx: TransactionBuilder) => void, extra: Keypair[] = []) {
  const acc = await server.loadAccount(source.publicKey());
  const tx = new TransactionBuilder(acc, { fee: "1000", networkPassphrase: Networks.TESTNET }).setTimeout(60);
  build(tx);
  const built = tx.build();
  built.sign(source, ...extra);
  return server.submitTransaction(built);
}

function encrypt(secret: string) {
  const raw = process.env.ISSUER_ENCRYPTION_KEY!;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

const bal = async (id: string, code: string, issuer: string) => {
  const a = await server.loadAccount(id);
  const l = a.balances.find((b) => "asset_code" in b && b.asset_code === code && b.asset_issuer === issuer);
  return Number(l && "balance" in l ? l.balance : 0);
};

describe("gift an item (testnet)", () => {
  it("mints on demand, delivers directly or as a claimable gift, and uses stock first", async () => {
    const { db } = await import("~/server/db");
    const { PLATFORM_ASSET } = await import("~/lib/stellar/constant");
    const { quoteGiftItem, prepareGiftItem, confirmGiftItem, giftableItems } = await import("~/server/stellar/gift-item");

    const brand = Keypair.random(), storage = Keypair.random(), issuer = Keypair.random(), fan = Keypair.random();
    await Promise.all([brand, storage, issuer, fan].map(fund));

    // the brand needs Wadzzo for the fees: trust it, then the platform sends some
    await send(brand, (t) => t.addOperation(Operation.changeTrust({ asset: PLATFORM_ASSET })));
    const mother = Keypair.fromSecret(process.env.MOTHER_SECRET!);
    await send(mother, (t) => t.addOperation(Operation.payment({ destination: brand.publicKey(), asset: PLATFORM_ASSET, amount: "500" })));

    const code = ("E" + Math.random().toString(36).slice(2, 8)).toUpperCase();
    const item = new Asset(code, issuer.publicKey());
    const sfx = Math.random().toString(36).slice(2, 8);
    await db.user.createMany({ data: [
      { id: brand.publicKey(), name: `e2e-brand-${sfx}`, email: `e2e-brand-${sfx}@example.test` },
      { id: fan.publicKey(), name: `e2e-fan-${sfx}`, email: `e2e-fan-${sfx}@example.test` },
    ] });
    await db.creator.create({ data: { id: brand.publicKey(), name: `E2E brand ${sfx}`, storagePub: storage.publicKey(), storageSecret: storage.secret(), aprovalSend: true, approved: true, platformId: "wadzzo" } });
    await db.creatorIssuer.create({ data: { creatorId: brand.publicKey(), publicKey: issuer.publicKey(), secretEncrypted: encrypt(issuer.secret()), active: true } });
    const asset = await db.asset.create({
      data: { code, issuer: issuer.publicKey(), name: `E2E ${sfx}`, description: "e2e", mediaType: "IMAGE", mediaUrl: "https://example.test/a.png", thumbnail: "https://example.test/a.png", limit: null, creatorId: brand.publicKey(), platformId: "wadzzo" },
    });
    await db.follow.create({ data: { userId: fan.publicKey(), creatorId: brand.publicKey() } });

    const session = { user: { id: brand.publicKey(), walletType: "frieghter", email: null } } as never;
    const ctx = { db, platform: { id: "wadzzo" }, session };
    const submit = async (xdr: string) => {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
      tx.sign(brand); // the brand signs its fee payment
      return server.submitTransaction(tx);
    };

    try {
      // listed as giftable with nothing in stock
      const listed = (await giftableItems(db, brand.publicKey())).find((i) => i.id === asset.id);
      console.log("LISTED", JSON.stringify(listed));
      expect(listed?.giftable).toBe(true);

      // A. the fan doesn't hold it: a claimable gift of 2 minted copies
      const qa = await quoteGiftItem(db, brand.publicKey(), { assetId: asset.id, pubkey: fan.publicKey(), quantity: 2 });
      console.log("QUOTE A", JSON.stringify({ ok: qa.ok, delivery: qa.delivery, toMint: qa.toMint, fromStock: qa.fromStock, total: qa.total, lines: qa.lines.map((l) => `${l.label}=${l.amount}`), problems: qa.problems }));
      expect(qa.ok).toBe(true);
      expect(qa.delivery).toBe("claimable");
      const pa = await prepareGiftItem(ctx, { assetId: asset.id, pubkey: fan.publicKey(), quantity: 2 });
      await submit(pa.xdr);
      expect((await confirmGiftItem(db, brand.publicKey(), pa.txId)).status).toBe("SUCCESS");
      const cbs = await server.claimableBalances().claimant(fan.publicKey()).call();
      console.log("CLAIMABLE", cbs.records.map((r) => `${r.amount} ${r.asset.split(":")[0]}`));
      expect(cbs.records.some((r) => r.asset === `${code}:${issuer.publicKey()}` && Number(r.amount) === 2)).toBe(true);
      expect((await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).mintedCount).toBe(2);
      expect(await db.notification.count({ where: { notifierId: fan.publicKey() } })).toBeGreaterThan(0);

      // B. the fan trusts the item: a direct gift of 1 (minted straight to them)
      await send(fan, (t) => t.addOperation(Operation.changeTrust({ asset: item })));
      const qb = await quoteGiftItem(db, brand.publicKey(), { assetId: asset.id, pubkey: fan.publicKey(), quantity: 1 });
      expect(qb.delivery).toBe("direct");
      const pb = await prepareGiftItem(ctx, { assetId: asset.id, pubkey: fan.publicKey(), quantity: 1 });
      await submit(pb.xdr);
      expect((await confirmGiftItem(db, brand.publicKey(), pb.txId)).status).toBe("SUCCESS");
      expect(await bal(fan.publicKey(), code, issuer.publicKey())).toBe(1);
      expect(await db.user_Asset.count({ where: { userId: fan.publicKey(), assetId: asset.id } })).toBe(1);

      // C. stock first: put 3 copies in storage, then gift 2 (direct)
      await send(storage, (t) => t.addOperation(Operation.changeTrust({ asset: item })));
      await send(issuer, (t) => t.addOperation(Operation.payment({ destination: storage.publicKey(), asset: item, amount: "3" })));
      const qc = await quoteGiftItem(db, brand.publicKey(), { assetId: asset.id, pubkey: fan.publicKey(), quantity: 2 });
      console.log("QUOTE C", JSON.stringify({ ok: qc.ok, fromStock: qc.fromStock, toMint: qc.toMint, problems: qc.problems }));
      expect(qc.fromStock).toBe(2);
      expect(qc.toMint).toBe(0);
      const pc = await prepareGiftItem(ctx, { assetId: asset.id, pubkey: fan.publicKey(), quantity: 2 });
      await submit(pc.xdr);
      expect((await confirmGiftItem(db, brand.publicKey(), pc.txId)).status).toBe("SUCCESS");
      expect(await bal(fan.publicKey(), code, issuer.publicKey())).toBe(3);
      expect(await bal(storage.publicKey(), code, issuer.publicKey())).toBe(1);

      // E. a platform-token gift (signed in the browser): confirming it records it and tells the fan once
      const { sendGitfAsPlatformAsset } = await import("~/lib/stellar/fan/send_gift");
      const { confirmTokenGift } = await import("~/server/stellar/token-gift");
      await send(fan, (t) => t.addOperation(Operation.changeTrust({ asset: PLATFORM_ASSET })));
      const giftXdr = await sendGitfAsPlatformAsset({ reciver: fan.publicKey(), creatorId: brand.publicKey(), amount: 5, assetCode: PLATFORM_ASSET.code, assetIssuer: PLATFORM_ASSET.issuer, signWith: undefined });
      await submit(giftXdr);
      const before = await db.notification.count({ where: { notifierId: fan.publicKey() } });
      expect((await confirmTokenGift(db, brand.publicKey(), giftXdr, "wadzzo")).status).toBe("SUCCESS");
      expect((await confirmTokenGift(db, brand.publicKey(), giftXdr, "wadzzo")).status).toBe("SUCCESS"); // again: no second notification
      expect(await db.notification.count({ where: { notifierId: fan.publicKey() } })).toBe(before + 1);
      expect(await bal(fan.publicKey(), PLATFORM_ASSET.code, PLATFORM_ASSET.issuer)).toBe(5);

      // D. not a follower
      const stranger = Keypair.random();
      const qd = await quoteGiftItem(db, brand.publicKey(), { assetId: asset.id, pubkey: stranger.publicKey(), quantity: 1 });
      expect(qd.ok).toBe(false);
      console.log("QUOTE D", qd.problems);
    } finally {
      await db.notification.deleteMany({ where: { notifierId: fan.publicKey() } });
      await db.notificationObject.deleteMany({ where: { actorId: brand.publicKey() } });
      await db.assetTransaction.deleteMany({ where: { creatorId: brand.publicKey() } });
      await db.user_Asset.deleteMany({ where: { userId: fan.publicKey() } });
      await db.follow.deleteMany({ where: { creatorId: brand.publicKey() } });
      await db.asset.deleteMany({ where: { creatorId: brand.publicKey() } });
      await db.creatorIssuer.deleteMany({ where: { creatorId: brand.publicKey() } });
      await db.creator.deleteMany({ where: { id: brand.publicKey() } });
      await db.user.deleteMany({ where: { id: { in: [brand.publicKey(), fan.publicKey()] } } });
    }
  });
});
