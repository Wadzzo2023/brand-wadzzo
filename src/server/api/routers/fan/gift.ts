import { z } from "zod";

import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import { confirmGiftItem, giftableItems, prepareGiftItem, quoteGiftItem } from "~/server/stellar/gift-item";

const target = z.object({ assetId: z.number().int(), pubkey: z.string().length(56), quantity: z.number().int().min(1).max(500) });

/** Gifting a brand's items to followers: stock first, minted on demand, the brand pays. */
export const giftRouter = createTRPCRouter({
  /** The brand's items with how many copies it could give away right now. */
  items: creatorProcedure.query(({ ctx }) => giftableItems(ctx.db, ctx.session.user.id)),

  quote: creatorProcedure.input(target).query(({ ctx, input }) => quoteGiftItem(ctx.db, ctx.session.user.id, input)),

  prepare: creatorProcedure.input(target).mutation(({ ctx, input }) => prepareGiftItem(ctx, input)),

  /** After the brand signed: settle the gift from Stellar. */
  confirm: creatorProcedure.input(z.object({ txId: z.string() })).mutation(({ ctx, input }) => confirmGiftItem(ctx.db, ctx.session.user.id, input.txId)),
});
