import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createTRPCRouter, superAdminProcedure } from "~/server/api/trpc";

/**
 * Admin › Audit log: Wadzzo's oversight of every platform (sign-ups, platform joins,
 * admin actions). Partner platforms' admins don't see it.
 */
export const auditRouter = createTRPCRouter({
  list: superAdminProcedure
    .input(
      z.object({
        platformId: z.string().optional(),
        /** prefix, e.g. "brand." or "user.signup" */
        action: z.string().trim().max(60).optional(),
        actorId: z.string().trim().max(56).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const platformId = input.platformId;
      const where: Prisma.AuditLogWhereInput = {
        ...(platformId ? { OR: [{ platformId }, { targetPlatformId: platformId }] } : {}),
        ...(input.action ? { action: { startsWith: input.action } } : {}),
        ...(input.actorId ? { actorId: input.actorId } : {}),
      };
      const rows = await ctx.db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { platform: { select: { name: true } } },
      });
      const more = rows.length > input.limit;
      const items = rows.slice(0, input.limit);

      // actorId has no FK (the log outlives accounts), so names are looked up.
      const actorIds = [...new Set(items.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
      const actors = await ctx.db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, image: true } });
      const byId = new Map(actors.map((a) => [a.id, a]));

      return {
        items: items.map((r) => ({ ...r, actor: r.actorId ? (byId.get(r.actorId) ?? null) : null })),
        nextCursor: more ? items[items.length - 1]!.id : undefined,
      };
    }),
});
