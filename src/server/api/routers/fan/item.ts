import { MediaType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import { cancelCreateItem, confirmCreateItem, createItem, quoteCreateItem } from "~/server/stellar/creator-items";
import { BADWORDS } from "~/utils/banned-word";

const MAX_ROYALTY = 50;

const code = z
  .string()
  .trim()
  .min(4, { message: "4–12 letters" })
  .max(12, { message: "4–12 letters" })
  .regex(/^[a-zA-Z]+$/, { message: "Letters only (A–Z)" });

const name = z
  .string()
  .trim()
  .min(1, { message: "Give it a name" })
  .max(60)
  .refine((v) => !BADWORDS.some((w) => v.toLowerCase().includes(w)), { message: "That name isn't allowed" });

/** Who can see / buy it in the store: everyone, followers, or a membership tier. */
const access = z.union([z.literal("public"), z.literal("private"), z.string().regex(/^\d+$/)]);

const createInput = z.object({
  name,
  description: z.string().trim().max(2000).default(""),
  code,
  mediaType: z.nativeEnum(MediaType),
  mediaUrl: z.string().url({ message: "Upload the content" }),
  thumbnail: z.string().url({ message: "Upload a thumbnail" }),
  price: z.number().nonnegative(),
  priceUSD: z.number().nonnegative(),
  /** null = open edition */
  limit: z.number().int().positive().nullable(),
  royaltyPercent: z.number().min(0).max(MAX_ROYALTY),
  /** copies minted into the creator's storage now; 0 = all minted on demand */
  mintNow: z.number().int().nonnegative(),
  access,
});

const privacyOf = (a: z.infer<typeof access>) =>
  a === "public" ? { privacy: "PUBLIC" as const } : a === "private" ? { privacy: "PRIVATE" as const } : { privacy: "TIER" as const, tierId: Number(a) };

/** A brand's own items: create (lazy mint), confirm the creation transaction, edit. */
export const itemRouter = createTRPCRouter({
  quote: creatorProcedure
    .input(z.object({ code: z.string().trim().max(12), mintNow: z.number().int().nonnegative(), limit: z.number().int().positive().nullable() }))
    .query(({ ctx, input }) => quoteCreateItem(ctx.db, ctx.session.user.id, input)),

  create: creatorProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    if (input.limit != null && input.mintNow > input.limit) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't mint more than the supply." });
    if (input.access !== "public" && input.access !== "private") {
      const tier = await ctx.db.subscription.findFirst({ where: { id: Number(input.access), creatorId: ctx.session.user.id }, select: { id: true } });
      if (!tier) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick one of your own tiers." });
    }
    const { access: a, ...rest } = input;
    return createItem(ctx, { ...rest, ...privacyOf(a) });
  }),

  confirm: creatorProcedure.input(z.object({ txId: z.string() })).mutation(({ ctx, input }) => confirmCreateItem(ctx.db, ctx.session.user.id, input.txId)),

  cancel: creatorProcedure.input(z.object({ txId: z.string() })).mutation(({ ctx, input }) => cancelCreateItem(ctx.db, ctx.session.user.id, input.txId)),

  /**
   * Edit an item the brand created: display details, the price of its own
   * listing, supply (never below copies already minted) and royalty (future
   * resales).
   */
  update: creatorProcedure
    .input(
      z.object({
        assetId: z.number().int(),
        name,
        description: z.string().trim().max(2000),
        thumbnail: z.string().url(),
        price: z.number().nonnegative(),
        priceUSD: z.number().nonnegative(),
        limit: z.number().int().positive().nullable(),
        royaltyPercent: z.number().min(0).max(MAX_ROYALTY),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const asset = await ctx.db.asset.findFirst({ where: { id: input.assetId, creatorId }, select: { id: true, mintedCount: true } });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      if (input.limit != null && input.limit < asset.mintedCount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${asset.mintedCount} copies already exist, so the supply can't go below that.` });
      }
      await ctx.db.$transaction([
        ctx.db.asset.update({
          where: { id: asset.id },
          data: { name: input.name, description: input.description, thumbnail: input.thumbnail, limit: input.limit, royaltyPercent: input.royaltyPercent },
        }),
        ctx.db.marketAsset.updateMany({ where: { assetId: asset.id, placerId: creatorId }, data: { price: input.price, priceUSD: input.priceUSD } }),
      ]);
    }),

  /** One of my items, for the edit page. */
  get: creatorProcedure.input(z.object({ assetId: z.number().int() })).query(async ({ ctx, input }) => {
    const creatorId = ctx.session.user.id;
    const asset = await ctx.db.asset.findFirst({
      where: { id: input.assetId, creatorId },
      select: {
        id: true,
        name: true,
        description: true,
        code: true,
        thumbnail: true,
        mediaType: true,
        limit: true,
        mintedCount: true,
        royaltyPercent: true,
        privacy: true,
        tier: { select: { name: true } },
        marketItems: { where: { placerId: creatorId }, select: { id: true, price: true, priceUSD: true }, take: 1 },
      },
    });
    if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
    const { marketItems, ...rest } = asset;
    return { ...rest, listing: marketItems[0] ?? null };
  }),
});
