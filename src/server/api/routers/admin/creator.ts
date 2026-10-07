import { z } from "zod";
import { creatorAprovalTrx } from "~/lib/stellar/fan/creator-aproval";
import { AccountSchema, type AccountType } from "~/lib/stellar/fan/utils";
import { assertCreatorInScope } from "~/server/api/access";
import {
  adminProcedure,
  createTRPCRouter,
  creatorProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit";
import { platformScope } from "~/server/platform";
import { creatorExtraFiledsSchema } from "~/types/creator";
import { urlToIpfsHash } from "~/utils/ipfs";
export const MAX_ASSET_LIMIT = Number("922337203685");

export const creatorRouter = createTRPCRouter({
  // Only what the admin table shows — never storage or issuer secrets.
  // Scoped to this platform; on Wadzzo, every platform (optionally one, via `platformId`).
  getCreators: adminProcedure
    .input(z.object({ platformId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const creators = await ctx.db.creator.findMany({
      select: {
        platformId: true,
        platform: { select: { name: true } },
        id: true,
        name: true,
        profileUrl: true,
        joinedAt: true,
        approved: true,
        extraFields: true,
        customPageAssetCodeIssuer: true,
        vanityURL: true,
        pageAsset: { select: { code: true, thumbnail: true, issuer: true } },
        _count: { select: { followers: true, LocationGroup: true, posts: true } },
      },
      where: { aprovalSend: true, ...platformScope(ctx, input?.platformId) },
      orderBy: { joinedAt: "desc" },
    });
    return creators;
  }),

  // One brand for the admin detail page. Explicit fields: no storage or
  // issuer secrets ever leave the server.
  getCreator: adminProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      await assertCreatorInScope(ctx, input);
      const creator = await ctx.db.creator.findUniqueOrThrow({
        where: { id: input },
        select: {
          id: true,
          platformId: true,
          platform: { select: { name: true } },
          name: true,
          bio: true,
          profileUrl: true,
          coverUrl: true,
          vanityURL: true,
          joinedAt: true,
          approved: true,
          aprovalSend: true,
          extraFields: true,
          storagePub: true,
          customPageAssetCodeIssuer: true,
          user: { select: { email: true } },
          pageAsset: { select: { code: true, issuer: true, thumbnail: true, price: true, priceUSD: true } },
          _count: { select: { followers: true, posts: true, Bounty: true, LocationGroup: true, hotspots: true, assets: true } },
          LocationGroup: {
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              id: true,
              title: true,
              image: true,
              type: true,
              startDate: true,
              endDate: true,
              approved: true,
              _count: { select: { locations: true } },
            },
          },
        },
      });
      const collected = await ctx.db.locationConsumer.count({ where: { location: { locationGroup: { creatorId: input } } } });
      return { ...creator, collected };
    }),

  deleteCreator: adminProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const platformId = await assertCreatorInScope(ctx, input);
      const deleted = await ctx.db.creator.delete({ where: { id: input } });
      await logAudit(ctx, { action: "brand.delete", entityType: "Creator", entityId: input, targetPlatformId: platformId });
      return deleted;
    }),

  creatorAction: adminProcedure
    .input(
      z.object({
        action: z.enum(["approve", "ban", "unban"]),
        creatorId: z.string(),
        storage: AccountSchema.optional(),
        escrow: AccountSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { action, creatorId } = input;
      const platformId = await assertCreatorInScope(ctx, creatorId);

      if (action == "approve" && input.escrow) {
        // here storage account also created
        if (input.storage) {
          await ctx.db.creator.update({
            where: { id: creatorId },
            data: {
              approved: true,
              storagePub: input.storage.publicKey,
              storageSecret: input.storage.secretKey,

              pageAsset: {
                update: {
                  issuer: input.escrow.publicKey,
                  issuerPrivate: input.escrow.secretKey,
                },
              },
            },
          });
        } else {
          // here storage account already created
          await ctx.db.creator.update({
            where: { id: creatorId },
            data: {
              approved: true,
              pageAsset: {
                update: {
                  issuer: input.escrow.publicKey,
                  issuerPrivate: input.escrow.secretKey,
                },
              },
            },
          });
        }
      } else if (action == "ban") {
        await ctx.db.creator.update({
          where: { id: creatorId },
          data: {
            approved: false,
          },
        });
      } else if (action == "unban") {
        await ctx.db.creator.update({
          where: { id: creatorId },
          data: {
            approved: true,
          },
        });
      }
      await logAudit(ctx, { action: `brand.${action}`, entityType: "Creator", entityId: creatorId, targetPlatformId: platformId });
    }),

  creatorRequestXdr: adminProcedure
    .input(z.object({ creatorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // here two type of request will be made
      // 1. create storage account
      // 2. create escrow account
      await assertCreatorInScope(ctx, input.creatorId);

      const creator = await ctx.db.creator.findUniqueOrThrow({
        where: { id: input.creatorId },
        include: {
          pageAsset: true,
        },
        omit: { storageSecret: false }, // signs with the storage account below
      });

      // storageAlready created
      const validStorage = creator.storagePub.length === 56;
      const storage: AccountType = {
        publicKey: creator.storagePub,
        secretKey: creator.storageSecret,
      };

      const pageAsset = creator.pageAsset;

      if (pageAsset) {
        const thumbnail = pageAsset.thumbnail;
        const ipfs = urlToIpfsHash(thumbnail) ?? "ipfs";
        return await creatorAprovalTrx({
          storage: validStorage ? storage : undefined,
          pageAsset: {
            code: pageAsset.code,
            ipfs: ipfs,
            limit: MAX_ASSET_LIMIT.toString(),
          },
        });
      }
    }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
  creatorIDfromVanityURL: creatorProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      const creator = await ctx.db.creator.findUnique({
        where: { vanityURL: input },
        include: {
          vanitySubscription: true,
        },
      });
      return creator;
    }),
  updateNavPermission: adminProcedure
    .input(
      z.object({
        creatorId: z.string(),
        navPermission: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const platformId = await assertCreatorInScope(ctx, input.creatorId);
      const creator = await ctx.db.creator.findUnique({
        where: { id: input.creatorId },
      });
      await logAudit(ctx, {
        action: "brand.nav_permission",
        entityType: "Creator",
        entityId: input.creatorId,
        targetPlatformId: platformId,
        meta: { navPermission: input.navPermission },
      });

      const currentExtraFields = creatorExtraFiledsSchema.parse(
        creator?.extraFields,
      );

      return await ctx.db.creator.update({
        where: { id: input.creatorId },
        data: {
          extraFields: {
            ...currentExtraFields,
            navPermission: input.navPermission,
          },
        },
      });
    }),

});
