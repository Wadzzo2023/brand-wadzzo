// Collection reports: how pins are collected, by whom and when.
//
// One summary for both the brand's Reports page (its own pins) and Admin ›
// Collection reports (any brand, or all of them), a per-pin report, and a CSV
// export. Counting happens in SQL so long histories stay fast.

import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertOwnerOrAdmin, isAdmin } from "~/server/api/access";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { platformScope } from "~/server/platform";
import { fetchUsersByPublicKeys } from "~/utils/get-pubkey";

type Ctx = Parameters<typeof assertOwnerOrAdmin>[0];

/** "all" = every brand (admins only); a brand id = that brand (owner or admin); nothing = the caller's brand. */
const scopeInput = z.object({
  creatorId: z.union([z.literal("all"), z.string().min(1)]).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
});

/** One brand, or every brand of a platform (null = every platform, Wadzzo only). */
type Scope = { creatorId: string | null; platformId: string | null };

async function resolveScope(ctx: Ctx, creatorId: string | undefined): Promise<Scope> {
  if (creatorId === "all") {
    if (!(await isAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can see every brand" });
    return { creatorId: null, platformId: platformScope(ctx).platformId ?? null };
  }
  if (creatorId) {
    await assertOwnerOrAdmin(ctx, creatorId);
    return { creatorId, platformId: null };
  }
  const creator = await ctx.db.creator.findUnique({ where: { id: ctx.session.user.id }, select: { id: true } });
  if (!creator) throw new TRPCError({ code: "FORBIDDEN", message: "Only brands have collection reports" });
  return { creatorId: creator.id, platformId: null };
}

/** WHERE for collections of live (not deleted) pins, scoped to a brand (or platform) and a period. */
function collectionsWhere({ creatorId, platformId }: Scope, from?: Date, to?: Date) {
  return Prisma.sql`c.hidden = false AND l.hidden = false AND g.hidden = false
    ${creatorId ? Prisma.sql`AND g."creatorId" = ${creatorId}` : Prisma.empty}
    ${platformId ? Prisma.sql`AND g."platformId" = ${platformId}` : Prisma.empty}
    ${from ? Prisma.sql`AND c."createdAt" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND c."createdAt" <= ${to}` : Prisma.empty}`;
}
const FROM = Prisma.sql`"LocationConsumer" c
  JOIN "Location" l ON l.id = c."locationId"
  JOIN "LocationGroup" g ON g.id = l."locationGroupId"`;

type Totals = { collections: number; collectors: number; redeemed: number };
async function totals(ctx: Ctx, scope: Scope, from?: Date, to?: Date): Promise<Totals> {
  const [row] = await ctx.db.$queryRaw<Totals[]>`
    SELECT COUNT(*)::int AS collections, COUNT(DISTINCT c."userId")::int AS collectors,
           COUNT(*) FILTER (WHERE c."isRedeemed")::int AS redeemed
    FROM ${FROM} WHERE ${collectionsWhere(scope, from, to)}`;
  return row ?? { collections: 0, collectors: 0, redeemed: 0 };
}

export const reportRouter = createTRPCRouter({
  /** Totals (with the previous period for comparison), collections per day, every pin's numbers, top collectors. */
  summary: protectedProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx, input.creatorId);
    const { from, to } = input;
    const where = collectionsWhere(scope, from, to);

    // Same-length window right before this one, for "vs previous period".
    const prevTo = from ? new Date(from.getTime() - 1) : undefined;
    const prevFrom = from ? new Date(from.getTime() - ((to ?? new Date()).getTime() - from.getTime())) : undefined;

    const [now, previous, daily, perPin, collectors, pins] = await Promise.all([
      totals(ctx, scope, from, to),
      from ? totals(ctx, scope, prevFrom, prevTo) : Promise.resolve(null),
      ctx.db.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char(c."createdAt", 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
        FROM ${FROM} WHERE ${where} GROUP BY 1 ORDER BY 1`,
      ctx.db.$queryRaw<{ gid: string; n: number; users: number; last: Date }[]>`
        SELECT g.id AS gid, COUNT(*)::int AS n, COUNT(DISTINCT c."userId")::int AS users, MAX(c."createdAt") AS last
        FROM ${FROM} WHERE ${where} GROUP BY g.id`,
      ctx.db.$queryRaw<{ id: string; name: string | null; image: string | null; n: number; last: Date }[]>`
        SELECT u.id, u.name, u.image, COUNT(*)::int AS n, MAX(c."createdAt") AS last
        FROM ${FROM} JOIN "User" u ON u.id = c."userId"
        WHERE ${where} GROUP BY u.id, u.name, u.image ORDER BY n DESC, last DESC LIMIT 10`,
      ctx.db.locationGroup.findMany({
        where: {
          hidden: false,
          ...(scope.creatorId ? { creatorId: scope.creatorId } : {}),
          ...(scope.platformId ? { platformId: scope.platformId } : {}),
        },
        select: {
          id: true,
          title: true,
          image: true,
          type: true,
          approved: true,
          startDate: true,
          endDate: true,
          limit: true,
          remaining: true,
          createdAt: true,
          creator: { select: { id: true, name: true, profileUrl: true } },
          _count: { select: { locations: { where: { hidden: false } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const byPin = new Map(perPin.map((p) => [p.gid, p]));
    return {
      totals: now,
      previous,
      daily,
      collectors,
      pins: pins.map((g) => {
        const s = byPin.get(g.id);
        return { ...g, locations: g._count.locations, collected: s?.n ?? 0, collectors: s?.users ?? 0, lastCollected: s?.last ?? null };
      }),
    };
  }),

  /** One pin (by group id, or the id of one of its locations): details, map, per-day numbers and who collected it. */
  pin: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const group = await ctx.db.locationGroup.findFirst({
      where: { OR: [{ id: input }, { locations: { some: { id: input } } }] },
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        type: true,
        link: true,
        approved: true,
        hidden: true,
        startDate: true,
        endDate: true,
        limit: true,
        remaining: true,
        creatorId: true,
        creator: { select: { id: true, name: true, profileUrl: true } },
        locations: {
          where: { hidden: false },
          select: { id: true, latitude: true, longitude: true, autoCollect: true, _count: { select: { consumers: { where: { hidden: false } } } } },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
    await assertOwnerOrAdmin(ctx, group.creatorId);

    const [daily, consumers] = await Promise.all([
      ctx.db.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char(c."createdAt", 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
        FROM "LocationConsumer" c JOIN "Location" l ON l.id = c."locationId"
        WHERE l."locationGroupId" = ${group.id} AND c.hidden = false AND l.hidden = false
        GROUP BY 1 ORDER BY 1`,
      ctx.db.locationConsumer.findMany({
        where: { hidden: false, location: { locationGroupId: group.id, hidden: false } },
        select: {
          id: true,
          createdAt: true,
          claimedAt: true,
          isRedeemed: true,
          redeemedAt: true,
          locationId: true,
          user: { select: { id: true, name: true, image: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    ]);

    // Wallet sign-ins have no email here; the accounts service knows them.
    const missing = [...new Set(consumers.filter((c) => !c.user.email).map((c) => c.user.id))];
    const emails = missing.length ? new Map((await fetchUsersByPublicKeys(missing).catch(() => [])).map((u) => [u.publicKey, u.email])) : new Map<string, string>();

    return {
      ...group,
      daily,
      consumers: consumers.map((c) => ({ ...c, email: c.user.email ?? emails.get(c.user.id) ?? null })),
    };
  }),

  /** Every collection in the scope and period, one row each, for a CSV download. */
  export: protectedProcedure.input(scopeInput.extend({ pinId: z.string().optional() })).mutation(async ({ ctx, input }) => {
    let scope = await resolveScope(ctx, input.creatorId);
    if (input.pinId) {
      const g = await ctx.db.locationGroup.findUnique({ where: { id: input.pinId }, select: { creatorId: true } });
      if (!g) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
      await assertOwnerOrAdmin(ctx, g.creatorId);
      scope = { creatorId: g.creatorId, platformId: null };
    }
    const rows = await ctx.db.$queryRaw<
      { brand: string; pin: string; pinId: string; lat: number; lng: number; wallet: string; name: string | null; email: string | null; collectedAt: Date; redeemed: boolean }[]
    >`
      SELECT cr.name AS brand, g.title AS pin, g.id AS "pinId", l.latitude AS lat, l.longitude AS lng,
             u.id AS wallet, u.name, u.email, c."createdAt" AS "collectedAt", c."isRedeemed" AS redeemed
      FROM ${FROM} JOIN "User" u ON u.id = c."userId" JOIN "Creator" cr ON cr.id = g."creatorId"
      WHERE ${collectionsWhere(scope, input.from, input.to)}
        ${input.pinId ? Prisma.sql`AND g.id = ${input.pinId}` : Prisma.empty}
      ORDER BY c."createdAt" DESC LIMIT 50000`;

    const missing = [...new Set(rows.filter((r) => !r.email).map((r) => r.wallet))];
    const emails = missing.length ? new Map((await fetchUsersByPublicKeys(missing).catch(() => [])).map((u) => [u.publicKey, u.email])) : new Map<string, string>();
    return rows.map((r) => ({ ...r, email: r.email ?? emails.get(r.wallet) ?? "" }));
  }),
});
