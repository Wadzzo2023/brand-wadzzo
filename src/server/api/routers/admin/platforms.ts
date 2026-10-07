import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, superAdminProcedure } from "~/server/api/trpc";
import { logAudit } from "~/server/audit";

const PlatformInput = z.object({
  /** slug; must equal the deployment's PLATFORM_SLUG */
  id: z.string().regex(/^[a-z0-9-]{2,40}$/, "Lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(80),
  webUrl: z.string().url(),
  brandUrl: z.string().url(),
  assetCode: z.string().trim().max(12).nullable(),
  assetIssuer: z.string().trim().length(56).nullable(),
  active: z.boolean(),
});

const count = (rows: { platformId: string; _count: { _all: number } }[]) =>
  new Map(rows.map((r) => [r.platformId, r._count._all]));

/** White-label platforms (wadzzo + sub-platforms such as clintoncounty). */
export const platformsRouter = createTRPCRouter({
  /** This deployment's platform, for the shell (name, whether it's the root). */
  current: adminProcedure.query(({ ctx }) => ({
    id: ctx.platform.id,
    name: ctx.platform.name,
    isRoot: ctx.platform.isRoot,
    isSuperAdmin: ctx.isSuperAdmin,
  })),

  /** Platform picker for the Wadzzo admin filters. */
  options: superAdminProcedure.query(({ ctx }) =>
    ctx.db.platform.findMany({ select: { id: true, name: true, isRoot: true }, orderBy: [{ isRoot: "desc" }, { name: "asc" }] }),
  ),

  /** Every platform with its headline numbers. */
  list: superAdminProcedure.query(async ({ ctx }) => {
    const [platforms, users, brands, pins, claims, admins] = await Promise.all([
      ctx.db.platform.findMany({ orderBy: [{ isRoot: "desc" }, { createdAt: "asc" }] }),
      ctx.db.userPlatform.groupBy({ by: ["platformId"], _count: { _all: true } }),
      ctx.db.creator.groupBy({ by: ["platformId"], where: { aprovalSend: true }, _count: { _all: true } }),
      ctx.db.locationGroup.groupBy({ by: ["platformId"], where: { hidden: false }, _count: { _all: true } }),
      // collections are counted on the platform they were made on
      ctx.db.locationConsumer.groupBy({ by: ["platformId"], _count: { _all: true } }),
      ctx.db.admin.groupBy({ by: ["platformId"], _count: { _all: true } }),
    ]);
    const [u, b, p, c, a] = [users, brands, pins, claims, admins].map(count);
    return platforms.map((pl) => ({
      ...pl,
      stats: {
        users: u!.get(pl.id) ?? 0,
        brands: b!.get(pl.id) ?? 0,
        pins: p!.get(pl.id) ?? 0,
        claims: c!.get(pl.id) ?? 0,
        admins: a!.get(pl.id) ?? 0,
      },
    }));
  }),

  /** Create or edit a platform. The root platform's slug and root flag never change. */
  save: superAdminProcedure.input(PlatformInput.extend({ isNew: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { isNew, id, ...data } = input;
    const existing = await ctx.db.platform.findUnique({ where: { id }, select: { id: true } });
    if (isNew && existing) throw new TRPCError({ code: "CONFLICT", message: "A platform with that slug already exists" });
    if (!isNew && !existing) throw new TRPCError({ code: "NOT_FOUND", message: "Platform not found" });

    const platform = isNew
      ? await ctx.db.platform.create({ data: { id, ...data } })
      : await ctx.db.platform.update({ where: { id }, data });
    await logAudit(ctx, {
      action: isNew ? "platform.create" : "platform.update",
      entityType: "Platform",
      entityId: id,
      targetPlatformId: id,
      meta: data,
    });
    return platform;
  }),
});
