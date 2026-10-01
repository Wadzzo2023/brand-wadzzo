import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  publicProcedure,
} from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
  checkAdmin: protectedProcedure.query(async ({ input, ctx }) => {
    const admin = await ctx.db.admin.findUnique({
      where: { id: ctx.session.user.id },
    });
    if (admin) {
      return admin;
    }
  }),
  makeAdmin: adminProcedure
    .input(z.string().trim().length(56))
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input }, select: { id: true } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No Wadzzo account has that public key — they need to sign in once first." });
      const existing = await ctx.db.admin.findUnique({ where: { id: input }, select: { id: true } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "That account is already an admin." });
      await ctx.db.admin.create({ data: { id: input } });
    }),

  admins: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.admin.findMany({
      orderBy: { joinedAt: "asc" },
      select: { id: true, joinedAt: true, user: { select: { name: true, email: true, image: true } } },
    });
  }),
  deleteAdmin: adminProcedure
    .input(z.string().length(56))
    .mutation(async ({ input, ctx }) => {
      // Never lock the platform out: not yourself, and never the last admin.
      if (input === ctx.session.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own admin access." });
      if ((await ctx.db.admin.count()) <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "There must always be at least one admin." });
      return await ctx.db.admin.delete({ where: { id: input } });
    }),
});
