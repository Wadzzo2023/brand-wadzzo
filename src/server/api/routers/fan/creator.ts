import { User } from "lucide-react";
import { env } from "process";
import { z } from "zod";
import {
  getCreatorShopAssetBalance,
  sendAssetXDRForAsset,
  sendAssetXDRForNative,
} from "~/lib/stellar/fan/creator_pageasset_buy";
import {
  getAssetPriceByCoddenIssuer,
  getPlatformAssetPrice,
  getXLMPrice,
  getXlmUsdPrice,
} from "~/lib/stellar/fan/get_token_price";
import {
  createRedeemXDRAsset,
  createRedeemXDRNative,
} from "~/lib/stellar/fan/redeem";
import { AccountSchema } from "~/lib/stellar/fan/utils";
import {
  createOrRenewVanitySubscription,
  getVanitySubscriptionXDR,
  vanityPrice,
  vanityState,
  verifyVanityPayment,
} from "~/lib/stellar/fan/vanity-url";
import { getAssetBalance } from "~/lib/stellar/marketplace/test/acc";
import { StellarAccount } from "~/lib/stellar/marketplace/test/Account";
import { SignUser } from "~/lib/stellar/utils";
import { BLANK_KEYWORD } from "~/lib/utils";
import { createCircularImage } from "~/server/circular-image";
import {
  adminProcedure,
  createTRPCRouter,
  creatorProcedure,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { platformScope } from "~/server/platform";
import { BADWORDS } from "~/utils/banned-word";
import { truncateString } from "~/utils/string";
import { PaymentMethodEnum } from "../bounty/bounty";
import axios from "axios";
import { TRPCError } from "@trpc/server";
import { RequestBrandCreateFormSchema } from "~/types/brand-onboarding";
import { creatorExtraFiledsSchema } from "~/types/creator";
/** A vanity URL is free to claim if nobody else has it. */
async function assertVanityFree(db: typeof import("~/server/db").db, vanityURL: string, creatorId: string) {
  const taken = await db.creator.findUnique({ where: { vanityURL }, select: { id: true } });
  if (taken && taken.id !== creatorId) throw new Error("That URL is taken. Try another.");
}

export const brandCreateRequestSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().max(500, "Bio must be 500 characters or less"),
  pageAssetName: z
    .string()
    .min(1, "Page asset name is required")
    .max(12, "Page asset name must be 12 characters or less")
    .regex(/^[^\s]+$/, "Page asset name cannot contain spaces"),
  vanityUrl: z
    .string()
    .min(2, "Vanity URL must be 2 characters or more")
    .max(30, "Vanity URL must be 30 characters or less")
    .regex(/^[^\s]+$/, "Vanity URL cannot contain spaces"),
  profileUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  assetThumbnail: z.string().url().optional(),
});
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
export const creatorRouter = createTRPCRouter({
  getCreator: protectedProcedure
    .input(z.object({ id: z.string() }).optional())
    .query(async ({ input, ctx }) => {
      let id = ctx.session.user.id;
      if (input) {
        id = input.id;
      }
      const creator = await ctx.db.creator.findFirst({
        where: { id: id },
        include: {
          pageAsset: {
            select: {
              code: true,
              issuer: true,
              price: true,
              priceUSD: true,
              thumbnail: true,
            },
          },
        },
      });
      if (creator) {
        return creator;
      }
    }),
  getCreatorPackages: protectedProcedure
    .input(z.object({ id: z.string() }).optional())
    .query(async ({ ctx, input }) => {
      let id = ctx.session.user.id;
      if (input) {
        id = input.id;
      }
      const creator = await ctx.db.creator.findUnique({
        where: { id: id },
      });
      if (!creator) {
        throw new Error("Creator not found");
      }
      const packages = await ctx.db.subscription.findMany({
        where: { creatorId: creator.id },
      });
      return packages;
    }),
  deleteCreatorSubscription: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const creator = await ctx.db.creator.findUnique({
        where: { id: ctx.session.user.id },
      });
      if (!creator) {
        throw new Error("Creator not found");
      }
      const feature = await ctx.db.subscription.delete({
        where: { id: input.id, creatorId: creator.id },
      });
      return feature;
    }),

  requestForBrandCreation: protectedProcedure
    .input(RequestBrandCreateFormSchema)
    .mutation(async ({ ctx, input }) => {
      const creator = await ctx.db.creator.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (creator) {
        throw new Error("Creator already exists");
      }
      const circularProfileUrl = input.profileUrl
        ? await createCircularImage(input.profileUrl)
        : undefined;

      if (input.assetType === "custom") {
        await ctx.db.creator.create({
          data: {
            id: ctx.session.user.id,
            platformId: ctx.platform.id,
            profileUrl: input.profileUrl,
            circularProfileUrl,
            coverUrl: input.coverUrl,
            bio: input.bio,
            storagePub: BLANK_KEYWORD,
            storageSecret: BLANK_KEYWORD,
            name: input.displayName,
            aprovalSend: true,
            customPageAssetCodeIssuer: `${input.assetCode}-${input.issuer}`,
          },
        });
      }
      if (input.assetType === "new") {
        await ctx.db.creator.create({
          data: {
            id: ctx.session.user.id,
            platformId: ctx.platform.id,
            profileUrl: input.profileUrl,
            circularProfileUrl,
            coverUrl: input.coverUrl,
            bio: input.bio,
            storagePub: BLANK_KEYWORD,
            storageSecret: BLANK_KEYWORD,
            name: input.displayName,
            aprovalSend: true,
            pageAsset: {
              create: {
                code: input.assetName,
                issuer: BLANK_KEYWORD,
                thumbnail: input.assetImage,
                limit: 0,
              },
            },
          },
        });
      }

      // await createOrRenewVanitySubscription({
      //   creatorId: ctx.session.user.id,
      //   isChanging: false,
      //   amount: 0,
      //   vanityURL: input.vanityUrl.toLocaleLowerCase(),
      // });
    }),
  getMeCreator: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.creator.findFirst({
      where: { user: { id: ctx.session.user.id } },
      include: {
        pageAsset: {
          select: {
            code: true,
            thumbnail: true,
          },
        },
      },
    });
  }),

  getCreatorPageAsset: protectedProcedure.query(async ({ ctx }) => {
    const pageAsset = await ctx.db.creatorPageAsset.findFirst({
      where: { creatorId: ctx.session.user.id },
      select: {
        code: true,
        issuer: true,
        creatorId: true,
        price: true,
        priceUSD: true,
        thumbnail: true,
      },
    });

    if (!pageAsset) {
      const creator = await ctx.db.creator.findUniqueOrThrow({
        where: { id: ctx.session.user.id },
      });
      const customAsset = creator.customPageAssetCodeIssuer;
      console.log("custom asset", customAsset);
      if (customAsset) {
        const [code, issuer, asset, usd] = customAsset.split("-");

        return {
          code,
          issuer,
          creatorId: creator.id,
          price: Number(asset),
          priceUSD: Number(usd),
          thumbnail: "https://app.wadzzo.com/images/loading.png",
        };
      }
    }
    return pageAsset;
  }),

  meCreator: protectedProcedure.query(async ({ ctx }) => {
    const creator = await ctx.db.creator.findFirst({
      where: { user: { id: ctx.session.user.id } },
      include: {
        _count: {
          select: {
            followers: true,
            assets: true,
            posts: true,
          },
        },
        pageAsset: true,
        platform: { select: { id: true, name: true } },
      },
    });
    // A brand belongs to one platform; on any other one it is read-only context, not a working account.
    return creator && { ...creator, onThisPlatform: creator.platformId === ctx.platform.id };
  }),
  /** Everything the brand profile page header needs, in one call (no secrets). */
  profileOverview: protectedProcedure.query(async ({ ctx }) => {
    const id = ctx.session.user.id;
    const creator = await ctx.db.creator.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bio: true,
        profileUrl: true,
        coverUrl: true,
        vanityURL: true,
        joinedAt: true,
        approved: true,
        customPageAssetCodeIssuer: true,
        vanitySubscription: true,
        pageAsset: { select: { code: true, issuer: true, thumbnail: true, price: true, priceUSD: true } },
        _count: { select: { followers: true, posts: true, Bounty: true } },
      },
    });
    if (!creator) return null;

    const [pins, hotspots, storeItems, recentPins] = await Promise.all([
      ctx.db.locationGroup.count({ where: { creatorId: id, hotspotId: null } }),
      ctx.db.hotspot.count({ where: { creatorId: id, hidden: false } }),
      ctx.db.marketAsset.count({ where: { asset: { creatorId: id, song: null } } }),
      ctx.db.locationGroup.findMany({
        where: { creatorId: id, hotspotId: null },
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
          locations: { select: { id: true }, take: 1 },
          _count: { select: { locations: true } },
        },
      }),
    ]);

    const custom = creator.customPageAssetCodeIssuer?.split("-");
    const pageAsset = creator.pageAsset
      ? {
          code: creator.pageAsset.code,
          issuer: creator.pageAsset.issuer,
          thumbnail: creator.pageAsset.thumbnail,
          custom: false,
          // Created but not issued on Stellar yet (an admin issues it).
          pending: creator.pageAsset.issuer === BLANK_KEYWORD,
          price: creator.pageAsset.price,
          priceUSD: creator.pageAsset.priceUSD,
        }
      : custom?.[0] && custom[1]
        ? {
            code: custom[0],
            issuer: custom[1],
            thumbnail: null,
            custom: true,
            pending: false,
            price: custom[2] ? Number(custom[2]) : null,
            priceUSD: custom[3] ? Number(custom[3]) : null,
          }
        : null;

    const { customPageAssetCodeIssuer: _c, _count, ...rest } = creator;
    return {
      ...rest,
      pageAsset,
      counts: { followers: _count.followers, posts: _count.posts, bounties: _count.Bounty, pins, hotspots, storeItems },
      recentPins,
    };
  }),

  vanitySubscription: protectedProcedure.query(async ({ ctx }) => {
    const creator = ctx.db.creator.findFirst({
      where: { user: { id: ctx.session.user.id } },
      include: {
        vanitySubscription: true,
      },
    });
    return creator;
  }),


  makeMeCreator: protectedProcedure
    .input(AccountSchema)
    .mutation(async ({ ctx, input: i }) => {
      const id = ctx.session.user.id;
      const data = await ctx.db.creator.create({
        data: {
          name: truncateString(id),
          aprovalSend: true,
          bio: id,

          user: { connect: { id: id } },
          platform: { connect: { id: ctx.platform.id } },
          storagePub: i.publicKey,
          storageSecret: i.secretKey,
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

  getAllCreator: protectedProcedure
    .input(
      z.object({
        limit: z.number(),
        // cursor is a reference to the last item in the previous batch
        // it's used to fetch the next batch
        cursor: z.string().nullish(),
        skip: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { limit, skip, cursor } = input;
      const items = await ctx.db.creator.findMany({
        take: limit + 1,
        skip: skip,
        cursor: cursor ? { id: cursor } : undefined,
        where: { approved: { equals: true } },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); // return the last item from the array
        nextCursor = nextItem?.id;
      }

      return {
        items,
        nextCursor,
      };
    }),
  // Admin brand pickers. Never return whole rows: Creator holds storageSecret.
  getCreators: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.creator.findMany({
      where: { approved: { equals: true }, ...platformScope(ctx) },
      select: { id: true, name: true, profileUrl: true },
      orderBy: { name: "asc" },
    });
  }),

  // getLatest: protectedProcedure.query(({ ctx }) => {
  //   return ctx.db.post.findFirst({
  //     orderBy: { createdAt: "desc" },
  //     where: { createdBy: { id: ctx.session.user.id } },
  //   });
  // }),

  changeCreatorProfilePicture: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const circularProfileUrl = await createCircularImage(input);
      await ctx.db.creator.update({
        data: { profileUrl: input, circularProfileUrl },
        where: { id: ctx.session.user.id },
      });
    }),

  changeCreatorBackgroundSVG: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const url = input;
      await ctx.db.creator.update({
        data: { backgroundSVG: url },
        where: { id: ctx.session.user.id },
      });
    }),

  changeCreatorCoverPicture: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.creator.update({
        data: { coverUrl: input },
        where: { id: ctx.session.user.id },
      });
    }),

  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),

  search: publicProcedure
    .input(
      z.object({
        limit: z.number(),
        // cursor is a reference to the last item in the previous batch
        // it's used to fetch the next batch
        cursor: z.string().nullish(),
        skip: z.number().optional(),
        searchInput: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { limit, skip, cursor, searchInput } = input;

      const items = await ctx.db.creator.findMany({
        take: limit + 1,
        skip: skip,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          ...platformScope(ctx),
          OR: [
            {
              name: {
                contains: searchInput,
                mode: "insensitive",
              },
            },
            {
              bio: {
                contains: searchInput,
                mode: "insensitive",
              },
            },
          ],
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); // return the last item from the array
        nextCursor = nextItem?.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  getCreatorPageAssetBalance: protectedProcedure.query(
    async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;

      const creator = await ctx.db.creator.findUniqueOrThrow({
        where: { id: creatorId },
        include: { pageAsset: true },
      });

      const creatorStoragePub = creator.storagePub;
      const creatorPageAsset = creator.pageAsset;

      const storageAcc = await StellarAccount.create(creatorStoragePub);

      if (creatorPageAsset) {
        const bal = storageAcc.getTokenBalance(
          creatorPageAsset.code,
          creatorPageAsset.issuer,
        );
        if (bal) {
          return {
            balance: bal,
            assetCode: creatorPageAsset.code,
            assetIssuer: creatorPageAsset.issuer,
          };
        } else {
          return {
            balance: 0,
            assetCode: creatorPageAsset.code,
            assetIssuer: creatorPageAsset.issuer,
          };
        }
      } else {
        if (creator.customPageAssetCodeIssuer) {
          const [code, issuer] = creator.customPageAssetCodeIssuer.split("-");

          const assetCode = z.string().max(12).min(1).parse(code);
          const assetIssuer = z.string().length(56).safeParse(issuer);

          if (assetIssuer.success === false) throw new Error("invalid issuer");

          console.log("storage Acc", storageAcc);

          const bal = storageAcc.getTokenBalance(assetCode, assetIssuer.data);

          if (bal >= 0) {
            return {
              balance: bal,
              assetCode: assetCode,
              assetIssuer: assetIssuer.data,
            };
          } else {
            throw new Error("Invalid asset code or issuer");
          }
        } else return null; // no page asset yet — a normal state, not an error
      }
    },
  ),
  getCreatorShopAssetBalance: creatorProcedure.query(async ({ ctx }) => {
    const creator = await ctx.db.creator.findUnique({
      where: { id: ctx.session.user.id },
    });

    if (!creator) {
      throw new Error("Creator not found");
    }

    const creatorStoragePub = creator.storagePub;

    return await getCreatorShopAssetBalance({
      creatorStoragePub,
    });
  }),
  getFansList: protectedProcedure.query(async ({ ctx }) => {
    const creatorId = ctx.session.user.id;
    return ctx.db.follow.findMany({
      where: { creatorId: creatorId },
      include: { user: true },
    });
  }),
  getCreatorAllAssets: protectedProcedure
    .input(z.object({ creatorId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { creatorId } = input;
      const creator = await ctx.db.creator.findUnique({
        where: { id: creatorId },
      });

      if (!creator) {
        throw new Error("Creator not found");
      }
      const storagePubKey = creator.storagePub;

      const Asset = await ctx.db.asset.findMany({
        where: { creatorId },
        select: {
          id: true,
          code: true,
          issuer: true,
          name: true,
          limit: true,
          Redeem: {
            select: {
              totalRedeemable: true,
              code: true,
              redeemConsumers: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      const acc = await StellarAccount.create(storagePubKey);

      const assetsWithRemaining = Asset.map((asset) => ({
        ...asset,
        limit: acc.getTokenBalance(asset.code, asset.issuer),
        Redeem: asset.Redeem.map((redeem) => ({
          ...redeem,
          remaining: redeem.totalRedeemable - redeem.redeemConsumers.length, // Calculate remaining redemptions
        })),
      }));
      return assetsWithRemaining;
    }),
  generateRedeemCode: protectedProcedure
    .input(
      z.object({
        redeemCode: z.string(),
        assetId: z.number(),
        maxRedeems: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { redeemCode, assetId, maxRedeems } = input;
      const creatorId = ctx.session.user.id;
      const creator = await ctx.db.creator.findUnique({
        where: { id: creatorId },
        include: { pageAsset: true },
      });
      if (!creator) {
        throw new Error("Creator not found");
      }
      const asset = await ctx.db.asset.findUnique({
        where: { id: assetId },
      });
      if (!asset) {
        throw new Error("Asset not found");
      }
      const findRedeem = await ctx.db.redeem.findUnique({
        where: { code: redeemCode },
      });
      if (findRedeem) {
        throw new Error("Redeem code already exists");
      }
      const code = await ctx.db.redeem.create({
        data: {
          totalRedeemable: maxRedeems,
          code: redeemCode.toLocaleUpperCase(),
          assetRedeemId: assetId,
          platformId: ctx.platform.id,
        },
      });
      return { code: redeemCode };
    }),
  checkCustomAssetValidity: protectedProcedure
    .input(z.object({ assetCode: z.string(), issuer: z.string() }))
    .mutation(async ({ ctx, input }) => {
      console.log("input", input);
      console.log(
        "process.env.NEXT_PUBLIC_STELLAR_PUBNET",
        process.env.NEXT_PUBLIC_STELLAR_PUBNET,
      );

      const isPubnet = process.env.NEXT_PUBLIC_STELLAR_PUBNET === "true"; // Explicit comparison

      const url = `https://api.stellar.expert/explorer/${isPubnet ? "public" : "testnet"}/asset/${input.assetCode}-${input.issuer}`;

      console.log("Generated URL:", url);

      console.log("url", url);
      const response = await axios.get(url);
      console.log("response", response.data);
      return response.status === 200;
    }),

  getXDRForCreatorRedeem: creatorProcedure
    .input(
      z.object({
        assetId: z.number(),
        maxRedeems: z.number(),
        redeemCode: z.string(),
        signWith: SignUser,
        paymentMethod: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { assetId, maxRedeems, signWith, redeemCode, paymentMethod } =
        input;

      const creatorId = ctx.session.user.id;

      const creator = await ctx.db.creator.findUnique({
        where: { id: creatorId },
        include: { pageAsset: true },
      });

      if (!creator) {
        throw new Error("Creator not found");
      }

      const asset = await ctx.db.asset.findUnique({
        where: { id: assetId },
      });

      if (!asset) {
        throw new Error("Asset not found");
      }

      const findRedeem = await ctx.db.redeem.findUnique({
        where: { code: redeemCode },
      });

      if (findRedeem) {
        throw new Error("Redeem code founded!");
      }

      if (paymentMethod === "xlm") {
        return await createRedeemXDRNative({
          creatorId: creatorId,
          maxRedeems,
          signWith,
        });
      } else if (paymentMethod === "asset") {
        return await createRedeemXDRAsset({
          creatorId: creatorId,
          maxRedeems,
          signWith,
        });
      }
    }),

  // Vanity URL Section

  // Step 1: the payment to sign. The price comes from the server.
  updateVanityURL: protectedProcedure
    .input(
      z.object({
        vanityURL: z.string().min(2).max(30).optional().nullable(),
        isChanging: z.boolean().optional(),
        signWith: SignUser,
        cost: z.number().optional(), // ignored; kept so older clients still validate
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const creator = await ctx.db.creator.findUnique({
        where: { id: userId },
        include: { vanitySubscription: true },
      });

      if (!creator) {
        throw new Error("Creator not found");
      }
      const state = vanityState(creator.vanitySubscription);
      if (state !== "expired" && input.vanityURL) await assertVanityFree(ctx.db, input.vanityURL, userId);
      return getVanitySubscriptionXDR({
        amount: vanityPrice(state),
        signWith: input.signWith,
        userPubKey: userId,
      });
    }),

  // Step 2: after paying, save the URL — only once the payment is on the network.
  createOrUpdateVanityURL: protectedProcedure
    .input(
      z.object({
        vanityURL: z.string().min(2).max(30),
        txHash: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid transaction"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const creator = await ctx.db.creator.findUnique({
        where: { id: userId },
        include: { vanitySubscription: true },
      });

      if (!creator) {
        throw new Error("Creator not found");
      }
      const state = vanityState(creator.vanitySubscription);
      const amount = vanityPrice(state);
      // Renewing keeps the current URL; setting or changing claims a new one.
      const vanityURL = state === "expired" && creator.vanityURL ? creator.vanityURL : input.vanityURL;
      if (state !== "expired") await assertVanityFree(ctx.db, vanityURL, userId);

      await verifyVanityPayment({
        txHash: input.txHash.toLowerCase(),
        creatorId: userId,
        amount,
        after: creator.vanitySubscription?.lastPaymentDate,
      });

      return createOrRenewVanitySubscription({
        creatorId: userId,
        isChanging: state === "active",
        amount,
        vanityURL,
      });
    }),

  checkVanityURLAvailability: protectedProcedure
    .input(z.object({ vanityURL: z.string().min(2).max(30) }))
    .query(async ({ ctx, input }) => {
      const existingCreator = await ctx.db.creator.findUnique({
        where: { vanityURL: input.vanityURL },
      });
      const userId = ctx.session.user.id;
      const isOwner = existingCreator?.id === userId;
      const canClaim = isOwner || !existingCreator;

      return { isAvailable: canClaim };
    }),

  checkVanityURLAvailabilityMutation: protectedProcedure
    .input(z.object({ vanityURL: z.string().min(2).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const existingCreator = await ctx.db.creator.findUnique({
        where: { vanityURL: input.vanityURL },
      });

      const exixt = BADWORDS.includes(input.vanityURL) || existingCreator;

      return { isAvailable: !exixt };
    }),
  getAssetPriceByCodeIssuser: protectedProcedure
    .input(
      z.object({
        code: z.string().optional(),
        issuer: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { code, issuer } = input;
      if (!code || !issuer) {
        throw new Error("Code and issuer are required");
      }

      const priceUSDAsset = await getAssetPriceByCoddenIssuer({
        code,
        issuer,
      });

      const priceXLMUSD = await getXLMPrice();
      const platformAssetUSD = await getPlatformAssetPrice();
      return {
        xlmInUSD: priceXLMUSD,
        AssetInUSD: priceUSDAsset,
        platformAssetInUSD: platformAssetUSD,
      };
    }),
  /**
   * Give an existing brand a page asset from Settings. A new asset waits for an
   * admin to issue it (same step as brand approval); an existing Stellar asset
   * is connected once we've confirmed it exists.
   */
  setupPageAsset: protectedProcedure
    .input(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("new"),
          code: z.string().regex(/^[A-Za-z0-9]{4,12}$/, "4–12 letters or numbers"),
          thumbnail: z.string().url().optional(),
        }),
        z.object({
          type: z.literal("custom"),
          code: z.string().regex(/^[A-Za-z0-9]{1,12}$/, "Up to 12 letters or numbers"),
          issuer: z.string().regex(/^G[A-Z2-7]{55}$/, "That isn't a Stellar account address"),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const creator = await ctx.db.creator.findUnique({
        where: { id: creatorId },
        select: { customPageAssetCodeIssuer: true, pageAsset: { select: { code: true } } },
      });
      if (!creator) throw new TRPCError({ code: "NOT_FOUND", message: "Set up your brand first" });
      if (creator.pageAsset ?? creator.customPageAssetCodeIssuer)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your brand already has a page asset" });

      if (input.type === "new") {
        await ctx.db.creatorPageAsset.create({
          data: { creatorId, code: input.code, issuer: BLANK_KEYWORD, thumbnail: input.thumbnail, limit: 0 },
        });
        return { status: "pending" as const };
      }

      const network = process.env.NEXT_PUBLIC_STELLAR_PUBNET === "true" ? "public" : "testnet";
      const exists = await axios
        .get(`https://api.stellar.expert/explorer/${network}/asset/${input.code}-${input.issuer}`)
        .then((r) => r.status === 200)
        .catch(() => false);
      if (!exists) throw new TRPCError({ code: "BAD_REQUEST", message: `We couldn't find ${input.code} from that issuer on Stellar` });

      await ctx.db.creator.update({
        where: { id: creatorId },
        data: { customPageAssetCodeIssuer: `${input.code}-${input.issuer}` },
      });
      return { status: "connected" as const };
    }),

  updatePageAssetPrice: protectedProcedure
    .input(
      z.object({
        price: z.number().nonnegative(),
        priceUSD: z.number().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const creator = await ctx.db.creator.findUnique({
        where: { id: creatorId },
        select: {
          customPageAssetCodeIssuer: true,
          pageAsset: true,
        },
      });

      if (!creator) {
        throw new Error("Creator not found");
      }

      const { price, priceUSD } = input;

      if (creator.pageAsset) {
        await ctx.db.creatorPageAsset.update({
          data: {
            price,
            priceUSD,
          },
          where: { creatorId: creatorId },
        });
      } else if (creator.customPageAssetCodeIssuer) {
        const [code, issuer] = creator.customPageAssetCodeIssuer.split("-");
        await ctx.db.creator.update({
          data: {
            customPageAssetCodeIssuer: `${code}-${issuer}-${price}-${priceUSD}`,
          },
          where: { id: creatorId },
        });
      }
      return { success: true };
    }),
  getSendAssetXDR: protectedProcedure
    .input(
      z.object({
        code: z.string(),
        issuer: z.string(),
        price: z.number(),
        signWith: SignUser,
        creatorId: z.string(),
        method: PaymentMethodEnum,
        priceInXLM: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { code, issuer, price, signWith, creatorId, method, priceInXLM } =
        input;

      const currentUser = ctx.session.user.id;
      const creator = await ctx.db.creator.findUnique({
        where: { id: creatorId },
        select: {
          storagePub: true,
          customPageAssetCodeIssuer: true,
          pageAsset: true,
          storageSecret: true,
        },
      });

      if (!creator) {
        throw new Error("Creator not found");
      }

      const acc = await StellarAccount.create(creator.storagePub);

      const getTotalToken = acc.getTokenBalance(code, issuer);

      if (method === "xlm") {
        return await sendAssetXDRForNative({
          creatorId: creatorId,
          priceInXLMWithCost: priceInXLM,
          code: code,
          issuer: issuer,
          totoalTokenToSend: getTotalToken,
          storageSecret: creator.storageSecret,
          signWith,
          userPublicKey: currentUser,
        });
      } else if (method === "asset") {
        return await sendAssetXDRForAsset({
          creatorId: creatorId,
          priceWithCost: price,
          code: code,
          issuer: issuer,
          totoalTokenToSend: getTotalToken,
          storageSecret: creator.storageSecret,
          signWith,
          userPublicKey: currentUser,
        });
      }
    }),

  requestBrandCreate: protectedProcedure
    .input(
      z.object({
        data: brandCreateRequestSchema,
        action: z.enum(["create", "update", "page_asset"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log(input);
      const { data, action } = input;
      console.log(data);
      const circularProfileUrl = data.profileUrl
        ? await createCircularImage(data.profileUrl)
        : undefined;

      if (action === "page_asset") {
        await ctx.db.creator.update({
          data: {
            profileUrl: data.profileUrl,
            circularProfileUrl,
            coverUrl: data.coverUrl,
            bio: data.bio,
            name: data.displayName,
            aprovalSend: true,
            vanityURL: data.vanityUrl.toLocaleLowerCase(),
          },
          where: { id: ctx.session.user.id },
        });

        await ctx.db.creatorPageAsset.create({
          data: {
            code: data.pageAssetName,
            thumbnail: data.assetThumbnail,
            creatorId: ctx.session.user.id,
            issuer: BLANK_KEYWORD,
            limit: 0,
          },
        });
      } else if (action === "create") {
        await ctx.db.creator.create({
          data: {
            id: ctx.session.user.id,
            platformId: ctx.platform.id,
            profileUrl: data.profileUrl,
            circularProfileUrl,
            coverUrl: data.coverUrl,
            bio: data.bio,
            storagePub: BLANK_KEYWORD,
            storageSecret: BLANK_KEYWORD,
            name: data.displayName,
            aprovalSend: true,
            pageAsset: {
              create: {
                code: data.pageAssetName,
                issuer: BLANK_KEYWORD,
                thumbnail: data.assetThumbnail,
                limit: 0,
              },
            },
          },
        });
        await createOrRenewVanitySubscription({
          creatorId: ctx.session.user.id,
          isChanging: false,
          amount: 0,
          vanityURL: data.vanityUrl.toLocaleLowerCase(),
        });
      } else if (action === "update") {
        await ctx.db.creator.update({
          data: {
            profileUrl: data.profileUrl,
            circularProfileUrl,
            coverUrl: data.coverUrl,
            vanityURL: data.vanityUrl.toLocaleLowerCase(),
            bio: data.bio,
            name: data.displayName,
            aprovalSend: true,
            pageAsset: {
              update: {
                where: { creatorId: ctx.session.user.id },
                data: {
                  code: data.pageAssetName,
                  thumbnail: data.assetThumbnail,
                },
              },
            },
          },
          where: { id: ctx.session.user.id },
        });
      }
    }),

  /**
   * For a creator row that exists but never entered the approval queue
   * (`aprovalSend: false`, `approved: null`) — e.g. one made outside the join
   * flow. Puts it in the admin queue; leaves decided rows alone.
   */
  requestApproval: protectedProcedure.mutation(async ({ ctx }) => {
    // Sends this platform's brand for review. A brand an admin already approved (but that was never
    // submitted) just becomes active; one that was refused (approved: false) stays refused.
    const res = await ctx.db.creator.updateMany({
      where: {
        id: ctx.session.user.id,
        platformId: ctx.platform.id,
        aprovalSend: false,
        OR: [{ approved: null }, { approved: true }],
      },
      data: { aprovalSend: true },
    });
    return { requested: res.count > 0 };
  }),

  getPermissionData: creatorProcedure.query(async ({ ctx, input }) => {
    const creator = await ctx.db.creator.findFirstOrThrow({
      where: { id: ctx.session.user.id },
    });

    const navPermission = creatorExtraFiledsSchema.parse(creator.extraFields);
    return navPermission?.navPermission ?? false;
  }),
});
