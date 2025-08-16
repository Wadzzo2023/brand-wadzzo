import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { getBlurData } from "~/utils/serverUtils";
export const AdminAssetFormSchema = z.object({
  logoUrl: z.string().url(),
  code: z
    .string()
    .min(4, { message: "Must be a minimum of 4 characters" })
    .max(12, { message: "Must be a maximum of 12 characters" }),
  issuer: z.string(),
  description: z.string(),
  link: z.string().url(),
  tags: z.string(),

  litemint: z.string().optional(),
  stellarx: z.string().optional(),
  stellarterm: z.string().optional(),
});

export const assetRouter = createTRPCRouter({
  getBancoinAssets: protectedProcedure
    .input(
      z.object({
        tag: z.string().optional(),
        limit: z.number(),
        // cursor is a reference to the last item in the previous batch
        // it's used to fetch the next batch
        cursor: z.number().nullish(),
        skip: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, skip, cursor } = input;

      let whereClause = {};

      if (input.tag) {
        whereClause = {
          tags: {
            some: {
              tagName: input.tag,
            },
          },
        };
      }

      const items = await ctx.db.adminAsset.findMany({
        take: limit + 1,
        skip: skip,
        cursor: cursor ? { id: cursor } : undefined,
        include: { tags: { select: { tagName: true } } },
        where: whereClause,
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); // return the last item from the array
        nextCursor = nextItem?.id;
      }

      return {
        assets: items,
        nextCursor,
      };
    }),
  addAsset: protectedProcedure
    .input(AdminAssetFormSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        code,
        tags,
        description,
        link,
        logoUrl,
        issuer,
        litemint,
        stellarterm,
        stellarx,
      } = input;

      const tagsArr = tags.split(",");
      const color = "red";
      const blurData = await getBlurData(logoUrl);

      // adding all the tags
      await Promise.all(
        tagsArr.map(async (tagItem) => {
          const existingRecord = await ctx.db.tag.findUnique({
            where: { name: tagItem },
          });

          if (!existingRecord) {
            await ctx.db.tag.create({
              data: {
                name: tagItem,
              },
            });
          }
        }),
      );

      await ctx.db.adminAsset.create({
        data: {
          code,
          color,
          logoBlueData: blurData,
          tags: {
            createMany: {
              data: tagsArr.map((el) => ({ tagName: el })),
              skipDuplicates: true,
            },
          },

          codeIssuer: issuer,
          adminId: ctx.session.user.id,
          description,
          link,
          logoUrl,
          Litemint: litemint,
          StellarX: stellarx,
          StellarTerm: stellarterm,
        },
      });
    }),

  deleteAsset: adminProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.adminAsset.delete({
        where: {
          id: input,
        },
      });
    }),
});
