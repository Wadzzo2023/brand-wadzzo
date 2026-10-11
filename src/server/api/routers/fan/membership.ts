import { NotificationType } from "@prisma/client";
import { z } from "zod";
import { AccountSchema } from "~/lib/stellar/fan/utils";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { MAX_ASSET_LIMIT } from "../admin/creator";
import { BADWORDS } from "~/utils/banned-word";
/** Palette names the fan apps map to theme-safe classes. */
export const TIER_COLORS = ["green", "blue", "purple", "gold", "rose", "slate"] as const;

/** A membership tier: what it's called, what it costs to hold, what members get. */
export const TierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "At least 2 characters" })
    .max(24, { message: "At most 24 characters" })
    .refine((v) => !BADWORDS.some((w) => v.toLowerCase().includes(w)), { message: "That name isn't allowed" }),
  description: z.string().trim().max(160, { message: "Keep it under 160 characters" }).default(""),
  features: z
    .array(z.string().trim().min(1).max(80, { message: "Keep each perk under 80 characters" }))
    .min(1, { message: "Add at least one perk" })
    .max(8, { message: "Up to 8 perks" }),
  color: z.enum(TIER_COLORS).default("green"),
  popular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  price: z
    .number({ required_error: "Price must be entered as a number", invalid_type_error: "Price must be entered as a number" })
    .min(1, { message: "Price must be at least 1" }),
});

export const EditTierSchema = TierSchema.extend({ id: z.number() });

export const CreatorAboutShema = z.object({
  description: z
    .string()
    .max(100, { message: "Bio must be lass than 101 character" })
    .nullable(),
  name: z
    .string()
    .min(3, { message: "Name must be between 3 to 98 characters" })
    .max(98, { message: "Name must be between 3 to 98 characters" }),
  profileUrl: z.string().nullable().optional(),
});
export const CreatorPageAssetSchema = z.object({
  code: z
    .string()
    .min(4, { message: "Must be a minimum of 4 characters" })
    .max(12, { message: "Must be a maximum of 12 characters" })
    .refine(
      (value) => {
        // Check if the input is a single word
        return /^\w+$/.test(value);
      },
      {
        message: "Input must be a single word",
      },
    ),
  limit: z
    .number({
      required_error: "Limit must be entered as a number",
      invalid_type_error: "Limit must be entered as a number",
    })
    .min(1, { message: "Limit must be greater than 0" })
    .max(MAX_ASSET_LIMIT, {
      message: `Limit must be less than ${MAX_ASSET_LIMIT} `,
    })
    .nonnegative(),
  price: z
    .number({
      required_error: "Price must be entered as a number",
      invalid_type_error: "Price must be entered as a number",
    })
    .nonnegative().min(.01, {
      message: "Price must be greater than 0"
    }).default(2),
  priceUSD: z
    .number({
      required_error: "Price must be entered as a number",
      invalid_type_error: "Price must be entered as a number",
    })
    .nonnegative().min(.01, {
      message: "Price must be greater than 0"
    })
    .default(1),

  thumbnail: z.string(),
});
const selectedColumn = {
  name: true,
  description: true,
  price: true,
  features: true,
  color: true,
  popular: true,
  isActive: true,
  createdAt: true,
  id: true,
  creatorId: true,
  creator: {
    select: {
      pageAsset: {
        select: {
          code: true,
        },
      },
      customPageAssetCodeIssuer: true,
    }
  }
};

export const membershipRouter = createTRPCRouter({
  createMembership: protectedProcedure
    .input(TierSchema)
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      await ctx.db.$transaction(async (tx) => {
        // only one tier is highlighted as "most popular"
        if (input.popular) await tx.subscription.updateMany({ where: { creatorId }, data: { popular: false } });
        await tx.subscription.create({ data: { ...input, creatorId, platformId: ctx.platform.id } });
      });
    }),

  createCreatePageAsset: protectedProcedure
    .input(CreatorPageAssetSchema.extend({ issuer: AccountSchema }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;

      const { code: code, price, priceUSD, issuer, limit, thumbnail } = input;

      if (thumbnail) {
        await ctx.db.creatorPageAsset.create({
          data: {
            creatorId,
            limit: limit,
            code,
            thumbnail: thumbnail,
            price,
            priceUSD,
            issuer: issuer.publicKey,
            issuerPrivate: issuer.secretKey,
          },
        });
      } else {
        await ctx.db.creatorPageAsset.create({
          data: {
            creatorId,
            limit: limit,
            code,
            price,
            priceUSD,
            issuer: issuer.publicKey,
            issuerPrivate: issuer.secretKey,
          },
        });
      }
    }),

  createCustomPageAsset: protectedProcedure
    .input(z.object({ code: z.string(), issuer: z.string(), price: z.number(), priceUSD: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const { code, issuer, price, priceUSD } = input;
      const assetIssuer = `${code}-${issuer}-${price}-${priceUSD}`;

      const creator = await ctx.db.creator.update({
        data: { customPageAssetCodeIssuer: assetIssuer },
        where: { id: creatorId },
      });

      return creator;
    }),

  editTierModal: protectedProcedure
    .input(EditTierSchema)
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const { id, ...data } = input;
      await ctx.db.$transaction(async (tx) => {
        if (data.popular) await tx.subscription.updateMany({ where: { creatorId, NOT: { id } }, data: { popular: false } });
        // Only the brand's own tier.
        await tx.subscription.update({ data, where: { id, creatorId } });
      });
    }),

  deleteTier: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      return await ctx.db.subscription.delete({
        where: {
          id: input.id,
          creatorId: creatorId,
        },
      });
    }),

  updateCreatorProfile: protectedProcedure
    .input(CreatorAboutShema)
    .mutation(async ({ ctx, input }) => {
      const { name, description } = input;
      await ctx.db.creator.update({
        data: { name, bio: description },
        where: { id: ctx.session.user.id },
      });
    }),

  getCreatorMembership: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return await ctx.db.subscription.findMany({
        where: { creatorId: input },
        select: selectedColumn,
      });
    }),

  // aCraatorSubscribedToken: protectedProcedure
  //   .input(z.object({ creatorId: z.string() }))
  //   .query(async ({ ctx, input }) => {
  //     return await ctx.db.user_Subscription.findFirst({
  //       where: {
  //         userId: ctx.session.user.id,
  //         subscription: {
  //           creatorId: input.creatorId,
  //         },
  //       },
  //       include: { subscription: true },
  //     });
  //   }),
  getAllMembership: protectedProcedure.input(z.object(
    {
      creatorId: z.string().optional(),
    }
  )).query(async ({ ctx, input }) => {
    return await ctx.db.subscription.findMany({
      where: { creatorId: input.creatorId ?? ctx.session.user.id },
      select: selectedColumn,
    });
  }),

  // getUserSubcribed: protectedProcedure.query(async ({ ctx }) => {
  //   return await ctx.db.user_Subscription.findMany({
  //     where: {
  //       AND: [
  //         { userId: ctx.session.user.id },
  //         // here i have to check not expired highest subscriptin.
  //         { subcriptionEndDate: { gte: new Date() } },
  //       ],
  //     },
  //     include: {
  //       subscription: {
  //         include: {
  //           creator: true,
  //         },
  //       },
  //     },
  //   });
  // }),

  // subscribe: protectedProcedure
  //   .input(
  //     z.object({
  //       subscriptionId: z.number(),
  //       creatorId: z.string(),
  //       days: z.number(),
  //     }),
  //   )
  //   .mutation(async ({ ctx, input }) => {
  //     const currentDate = new Date();
  //     // Add 10 days to the current date
  //     currentDate.setDate(currentDate.getDate() + input.days);
  //     const subscription = await ctx.db.user_Subscription.create({
  //       data: {
  //         userId: ctx.session.user.id,
  //         subscriptionId: input.subscriptionId,
  //         subcriptionEndDate: currentDate,
  //       },
  //     });
  //     await ctx.db.notificationObject.create({
  //       data: {
  //         actorId: ctx.session.user.id,
  //         entityType: NotificationType.SUBSCRIPTION,
  //         entityId: input.subscriptionId,
  //         Notification: { create: [{ notifierId: input.creatorId }] },
  //       },
  //     });
  //     return subscription;
  //   }),

  // userSubscriptions: protectedProcedure.query(async ({ ctx, input }) => {
  //   const subscriptiosn = await ctx.db.user_Subscription.findMany({
  //     where: { userId: ctx.session.user.id },
  //   });
  //   return subscriptiosn;
  // }),

  isFollower: protectedProcedure
    .input(z.object({ creatorId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isFollower = await ctx.db.follow.findUnique({
        where: {
          userId_creatorId: {
            creatorId: input.creatorId,
            userId: ctx.session.user.id,
          },
        },
      });
      return Boolean(isFollower);
    }),

  followCreator: protectedProcedure
    .input(z.object({ creatorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (userId === input.creatorId) {
        throw new Error("You can't follow yourself");
      }
      const fol = await ctx.db.follow.create({
        data: { creatorId: input.creatorId, userId },
      });

      await ctx.db.notificationObject.create({
        data: {
          actorId: ctx.session.user.id,
          entityType: NotificationType.FOLLOW,
          entityId: fol.id,
          isUser: false,
          Notification: {
            create: [
              {
                notifierId: input.creatorId,
                isCreator: true, // Notification for the creator
              },
            ],
          },
        },
      });
    }),

  unFollowCreator: protectedProcedure
    .input(z.object({ creatorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (userId === input.creatorId) {
        throw new Error("You can't unfollow yourself");
      }
      const fol = await ctx.db.follow.findFirst({
        where: { creatorId: input.creatorId, userId },
      });

      if (!fol) {
        throw new Error("You are not following this creator");
      }

      // delete his follow
      await ctx.db.follow.delete({
        where: { id: fol.id },
      });
    }),
});
