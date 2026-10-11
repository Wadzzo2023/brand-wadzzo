import { Horizon, NotFoundError } from "@stellar/stellar-sdk";
import { z } from "zod";

import { PLATFORM_ASSET, STELLAR_URL } from "~/lib/stellar/constant";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Db } from "~/server/db";

const horizon = () => new Horizon.Server(STELLAR_URL);
export type HistoryRow = {
  id: string;
  at: string;
  hash: string;
  kind: "created" | "received" | "sent";
  amount: number;
  code: string;
  issuer: string | null;
  counterparty: string;
};
const isKey = (s: string | null | undefined): s is string => Boolean(s && /^G[A-Z2-7]{55}$/.test(s));
const BASE_RESERVE = 0.5;

/** The brand's storage account: where its stock of items sits until fans buy or claim it. */
async function storageKey(db: Db, userId: string) {
  const c = await db.creator.findUnique({ where: { id: userId }, select: { storagePub: true } });
  return isKey(c?.storagePub) ? c.storagePub : null;
}

export const storageRouter = createTRPCRouter({
  /** Balances of the storage account, with item names where an asset is one of the brand's items. */
  account: protectedProcedure.query(async ({ ctx }) => {
    const publicKey = await storageKey(ctx.db, ctx.session.user.id);
    if (!publicKey) return null;

    let acc: Awaited<ReturnType<Horizon.Server["loadAccount"]>>;
    try {
      acc = await horizon().loadAccount(publicKey);
    } catch (e) {
      if (e instanceof NotFoundError) return { publicKey, active: false as const, xlm: 0, spendableXlm: 0, reserved: 0, tokens: [] };
      throw e;
    }

    const native = acc.balances.find((b) => b.asset_type === "native");
    const xlm = Number(native?.balance ?? 0);
    const selling = Number((native as { selling_liabilities?: string } | undefined)?.selling_liabilities ?? 0);
    const { num_sponsoring = 0, num_sponsored = 0 } = acc as unknown as { num_sponsoring?: number; num_sponsored?: number };
    const reserved = (2 + acc.subentry_count + num_sponsoring - num_sponsored) * BASE_RESERVE;

    const lines = acc.balances.flatMap((b) =>
      b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12" ? [{ code: b.asset_code, issuer: b.asset_issuer, balance: Number(b.balance) }] : [],
    );
    const items = lines.length
      ? await ctx.db.asset.findMany({
          where: { OR: lines.map((l) => ({ code: l.code, issuer: l.issuer })) },
          select: { id: true, code: true, issuer: true, name: true, thumbnail: true },
        })
      : [];
    const tokens = lines
      .map((l) => {
        const item = items.find((i) => i.code === l.code && i.issuer === l.issuer);
        const platform = l.code === PLATFORM_ASSET.code && l.issuer === PLATFORM_ASSET.issuer;
        return { ...l, platform, item: item ? { id: item.id, name: item.name, thumbnail: item.thumbnail } : null };
      })
      .sort((a, b) => Number(b.platform) - Number(a.platform) || b.balance - a.balance);

    return { publicKey, active: true as const, xlm, spendableXlm: Math.max(0, xlm - reserved - selling), reserved, tokens };
  }),

  /** What moved through the storage account, newest first (payments in and out, account creation). */
  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20), cursor: z.string().nullish() }))
    .query(async ({ ctx, input }) => {
      const publicKey = await storageKey(ctx.db, ctx.session.user.id);
      if (!publicKey) return { items: [], nextCursor: null };

      let page;
      try {
        let call = horizon().payments().forAccount(publicKey).order("desc").limit(input.limit);
        if (input.cursor) call = call.cursor(input.cursor);
        page = await call.call();
      } catch (e) {
        if (e instanceof NotFoundError) return { items: [], nextCursor: null };
        throw e;
      }

      const items = page.records.flatMap((r): HistoryRow[] => {
        const base = { id: r.id, at: r.created_at, hash: r.transaction_hash };
        const type: string = r.type;
        if (type === "create_account") {
          const account = r as unknown as { funder: string; account: string; starting_balance: string };
          return [{ ...base, kind: "created" as const, amount: Number(account.starting_balance), code: "XLM", issuer: null, counterparty: account.funder }];
        }
        if (type === "payment" || type === "path_payment_strict_send" || type === "path_payment_strict_receive") {
          const p = r as unknown as { from: string; to: string; amount: string; asset_type: string; asset_code?: string; asset_issuer?: string };
          const incoming = p.to === publicKey;
          return [
            {
              ...base,
              kind: incoming ? ("received" as const) : ("sent" as const),
              amount: Number(p.amount),
              code: p.asset_type === "native" ? "XLM" : (p.asset_code ?? "?"),
              issuer: p.asset_issuer ?? null,
              counterparty: incoming ? p.from : p.to,
            },
          ];
        }
        return [];
      });

      // item names for the asset codes shown
      const assets = items.filter((i) => i.issuer).map((i) => ({ code: i.code, issuer: i.issuer! }));
      const named = assets.length
        ? await ctx.db.asset.findMany({ where: { OR: assets }, select: { code: true, issuer: true, name: true } })
        : [];
      const last = page.records.at(-1);
      return {
        items: items.map((i) => ({ ...i, label: named.find((n) => n.code === i.code && n.issuer === i.issuer)?.name ?? null })),
        nextCursor: page.records.length === input.limit && last ? last.paging_token : null,
      };
    }),
});
