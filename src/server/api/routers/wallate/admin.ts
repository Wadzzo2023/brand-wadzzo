import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getPlatformAdmin } from "~/server/api/access";
import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit";
import { inPlatformScope, platformScope } from "~/server/platform";

export const adminRouter = createTRPCRouter({
  /** The caller's admin access on this deployment (undefined when not an admin here). */
  checkAdmin: protectedProcedure.query(async ({ ctx }) => {
    const admin = await getPlatformAdmin(ctx);
    if (admin) {
      return {
        ...admin,
        isSuperAdmin: admin.platform.isRoot,
        platform: { id: ctx.platform.id, name: ctx.platform.name, isRoot: ctx.platform.isRoot },
      };
    }
  }),
  makeAdmin: adminProcedure
    .input(
      z.object({
        pubkey: z.string().trim().length(56),
        /** Wadzzo admins may add an admin to another platform; defaults to this one. */
        platformId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const platformId = input.platformId ?? ctx.platform.id;
      if (!inPlatformScope(ctx, platformId)) throw new TRPCError({ code: "FORBIDDEN", message: "You can only add admins to your own platform." });
      if (!(await ctx.db.platform.findUnique({ where: { id: platformId }, select: { id: true } }))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown platform." });
      }
      const user = await ctx.db.user.findUnique({ where: { id: input.pubkey }, select: { id: true } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No account has that public key — they need to sign in once first." });
      const existing = await ctx.db.admin.findUnique({ where: { id: input.pubkey }, select: { platformId: true } });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: existing.platformId === platformId ? "That account is already an admin." : `That account is already an admin of ${existing.platformId}.`,
        });
      }
      await ctx.db.admin.create({ data: { id: input.pubkey, platformId } });
      await logAudit(ctx, { action: "admin.add", entityType: "Admin", entityId: input.pubkey, targetPlatformId: platformId });
    }),

  admins: adminProcedure
    .input(z.object({ platformId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.admin.findMany({
        where: platformScope(ctx, input?.platformId),
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          joinedAt: true,
          platformId: true,
          platform: { select: { name: true } },
          user: { select: { name: true, email: true, image: true } },
        },
      });
    }),
  deleteAdmin: adminProcedure
    .input(z.string().length(56))
    .mutation(async ({ input, ctx }) => {
      // Never lock a platform out: not yourself, and never its last admin.
      if (input === ctx.session.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own admin access." });
      const target = await ctx.db.admin.findUnique({ where: { id: input }, select: { platformId: true } });
      if (!target || !inPlatformScope(ctx, target.platformId)) throw new TRPCError({ code: "NOT_FOUND", message: "Admin not found." });
      if ((await ctx.db.admin.count({ where: { platformId: target.platformId } })) <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "There must always be at least one admin." });
      }
      const removed = await ctx.db.admin.delete({ where: { id: input } });
      await logAudit(ctx, { action: "admin.remove", entityType: "Admin", entityId: input, targetPlatformId: target.platformId });
      return removed;
    }),
});
