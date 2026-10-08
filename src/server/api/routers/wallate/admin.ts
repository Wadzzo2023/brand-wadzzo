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
        // A Wadzzo admin has full control on every platform's site.
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
      // A platform's admins add admins to their own platform; a Wadzzo admin can add to any.
      if (!ctx.isSuperAdmin && !inPlatformScope(ctx, platformId)) throw new TRPCError({ code: "FORBIDDEN", message: "You can only add admins to your own platform." });
      if (!(await ctx.db.platform.findUnique({ where: { id: platformId }, select: { id: true } }))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown platform." });
      }
      const user = await ctx.db.user.findUnique({ where: { id: input.pubkey }, select: { id: true } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No account has that public key — they need to sign in once first." });
      const existing = await ctx.db.admin.findUnique({ where: { id: input.pubkey }, select: { platformId: true } });
      if (existing) {
        if (existing.platformId === platformId) throw new TRPCError({ code: "CONFLICT", message: "That account is already an admin." });
        // An account is an admin of one platform. Only Wadzzo can move one to another (e.g. promote a
        // Clinton County admin to Wadzzo admin); a platform's own admins can't take another's.
        if (!ctx.isSuperAdmin) throw new TRPCError({ code: "CONFLICT", message: `That account is already an admin of ${existing.platformId}.` });
        if (input.pubkey === ctx.session.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't change your own admin platform." });
        await ctx.db.admin.update({ where: { id: input.pubkey }, data: { platformId } });
        await logAudit(ctx, { action: "admin.move", entityType: "Admin", entityId: input.pubkey, targetPlatformId: platformId, meta: { from: existing.platformId, to: platformId } });
        return { moved: true as const, from: existing.platformId };
      }
      await ctx.db.admin.create({ data: { id: input.pubkey, platformId } });
      await logAudit(ctx, { action: "admin.add", entityType: "Admin", entityId: input.pubkey, targetPlatformId: platformId });
      return { moved: false as const, from: null };
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
      if (!target || (!ctx.isSuperAdmin && !inPlatformScope(ctx, target.platformId))) throw new TRPCError({ code: "NOT_FOUND", message: "Admin not found." });
      if ((await ctx.db.admin.count({ where: { platformId: target.platformId } })) <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "There must always be at least one admin." });
      }
      const removed = await ctx.db.admin.delete({ where: { id: input } });
      await logAudit(ctx, { action: "admin.remove", entityType: "Admin", entityId: input, targetPlatformId: target.platformId });
      return removed;
    }),
});
