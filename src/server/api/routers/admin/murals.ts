import type { MuralStatus, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, superAdminProcedure } from "~/server/api/trpc";
import { logAudit } from "~/server/audit";
import type { Db } from "~/server/db";
import { platformScope, type PlatformCtx } from "~/server/platform";

/**
 * Admin › Mural review (wadzzoAR/docs/murals/plan.md §9).
 *
 * Murals are discovered by users in wadzzoAR, never created here. A mural
 * reaches PENDING once `confirmationsNeeded` different people have scanned
 * it; this router approves (shown on every map), rejects, edits, merges
 * duplicates, and owns the global MuralSettings row.
 *
 * Coins: rejecting as FRAUD takes back what each user earned from that mural,
 * never below 0 (plan §12.2). Moving it out of FRAUD gives back what was
 * taken, so undo is exact.
 */

type Tx = Prisma.TransactionClient;

/** Flags shown on review rows (plan §9). */
const NEW_ACCOUNT_DAYS = 7;
const QUICK_CONFIRM_MS = 2 * 60_000;
const DUPLICATE_RADIUS_M = 50;
const SCREEN_OBJECTS = ["laptop", "computer monitor", "television", "mobile phone", "tablet computer", "computer", "display device"];

function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function boxAround(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { latitude: { gte: lat - dLat, lte: lat + dLat }, longitude: { gte: lng - dLng, lte: lng + dLng } };
}

function getSettings(db: Db | Tx) {
  return db.muralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

type VisionJson = {
  skipped?: boolean;
  screens?: { name: string; score: number; area: number }[];
  webFullMatches?: number;
  clip?: { score: number }[];
};

/** Something Cloud Vision saw but didn't reject on — worth a human look. */
function borderline(vision: unknown) {
  const v = (vision ?? {}) as VisionJson;
  if (v.skipped) return false;
  const screen = (v.screens ?? []).some((o) => SCREEN_OBJECTS.includes(o.name.toLowerCase()));
  const weakArt = (v.clip ?? []).every((c) => c.score < 0.7);
  return screen || weakArt;
}

/**
 * Coins live in one balance per (user, platform): the platform they were
 * earned on. Adjustments go back to the balance the coins came from.
 */
async function adjust(tx: Tx, userId: string, platformId: string, amount: number, reason: "MURAL_REVOKE" | "ADMIN_ADJUST", muralId: string, note: string) {
  await tx.coinLedger.create({ data: { userId, amount, reason, muralId, note, platformId } });
  await tx.coinBalance.upsert({
    where: { userId_platformId: { userId, platformId } },
    update: { balance: { increment: amount } },
    create: { userId, platformId, balance: Math.max(0, amount) },
  });
}

/**
 * Per user and platform balance: what they earned from this mural and what's
 * currently left of it after earlier revokes/restores.
 */
async function coinPosition(tx: Db | Tx, muralId: string) {
  const rows = await tx.coinLedger.groupBy({ by: ["userId", "platformId", "reason"], where: { muralId }, _sum: { amount: true } });
  const by = new Map<string, { userId: string; platformId: string; earned: number; net: number }>();
  for (const r of rows) {
    const key = `${r.userId}:${r.platformId}`;
    const p = by.get(key) ?? { userId: r.userId, platformId: r.platformId, earned: 0, net: 0 };
    const amount = r._sum.amount ?? 0;
    if (r.reason === "MURAL_SCAN" || r.reason === "MURAL_DISCOVERY") p.earned += amount;
    p.net += amount;
    by.set(key, p);
  }
  return [...by.values()];
}

/** FRAUD: take back each user's remaining coins from the mural, floored at their balance. */
async function revoke(tx: Tx, muralId: string) {
  const users = new Set<string>();
  let coins = 0;
  for (const p of await coinPosition(tx, muralId)) {
    const { userId, platformId } = p;
    if (p.net <= 0) continue;
    const bal = await tx.coinBalance.findUnique({ where: { userId_platformId: { userId, platformId } } });
    const take = Math.min(p.net, Math.max(0, bal?.balance ?? 0));
    const note = take < p.net ? `Rejected as fraud (balance covered ${take} of ${p.net})` : "Rejected as fraud";
    // Only what was actually taken moves the balance; a later restore gives
    // back exactly that (earned − net). The shortfall is noted, not owed.
    await adjust(tx, userId, platformId, -take, "MURAL_REVOKE", muralId, note);
    if (take < p.net) await tx.coinLedger.create({ data: { userId, amount: 0, reason: "MURAL_REVOKE", muralId, note: `Uncollectable ${p.net - take}`, platformId } });
    users.add(userId);
    coins += take;
  }
  return { users: users.size, coins };
}

/** Undo of a FRAUD reject: give back what was actually taken. */
async function restore(tx: Tx, muralId: string) {
  for (const p of await coinPosition(tx, muralId)) {
    const taken = p.earned - p.net;
    if (taken > 0) await adjust(tx, p.userId, p.platformId, taken, "ADMIN_ADJUST", muralId, "Restored — fraud rejection undone");
  }
}

const statusInput = z.enum(["DISCOVERED", "PENDING", "APPROVED", "REJECTED"]);

/** Every id must be a mural this deployment's platform may manage (NOT_FOUND otherwise). */
async function assertMuralsInScope(ctx: PlatformCtx & { db: Db }, ids: string[]) {
  const found = await ctx.db.mural.count({ where: { id: { in: ids }, ...platformScope(ctx) } });
  if (found !== new Set(ids).size) throw new TRPCError({ code: "NOT_FOUND", message: "Mural not found" });
}

export const muralsAdminRouter = createTRPCRouter({
  counts: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.mural.groupBy({ by: ["status"], where: { mergedIntoId: null, ...platformScope(ctx) }, _count: { _all: true } });
    const out: Record<MuralStatus, number> = { DISCOVERED: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  }),

  list: adminProcedure.input(z.object({ status: statusInput })).query(async ({ ctx, input }) => {
    const settings = await getSettings(ctx.db);
    const murals = await ctx.db.mural.findMany({
      where: { status: input.status, mergedIntoId: null, ...platformScope(ctx) },
      orderBy: input.status === "PENDING" ? { updatedAt: "asc" } : { updatedAt: "desc" },
      take: 500,
      include: {
        scans: {
          where: { discoveryRank: { not: null } },
          orderBy: { discoveryRank: "asc" },
          select: {
            createdAt: true,
            discoveryRank: true,
            vision: true,
            user: { select: { id: true, name: true, image: true, joinedAt: true } },
          },
        },
      },
    });

    // Possible duplicates: another live mural within 50 m.
    const live = await ctx.db.mural.findMany({
      where: { mergedIntoId: null, status: { not: "REJECTED" }, ...platformScope(ctx) },
      select: { id: true, latitude: true, longitude: true },
    });

    const now = Date.now();
    return {
      confirmationsNeeded: settings.confirmationsNeeded,
      murals: murals.map((m) => {
        const finders = m.scans;
        const newAccounts = finders.filter((s) => s.user.joinedAt && now - s.user.joinedAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000).length;
        const times = finders.map((s) => s.createdAt.getTime()).sort((a, b) => a - b);
        const quick = times.some((t, i) => i > 0 && t - times[i - 1]! < QUICK_CONFIRM_MS);
        const duplicates = live.filter((o) => o.id !== m.id && distanceM(m, o) <= DUPLICATE_RADIUS_M).length;
        return {
          id: m.id,
          title: m.title ?? m.autoTitle,
          autoTitled: !m.title,
          artist: m.artist,
          coverUrl: m.coverUrl,
          latitude: m.latitude,
          longitude: m.longitude,
          status: m.status,
          rejectReason: m.rejectReason,
          distinctScanners: m.distinctScanners,
          scanCount: m.scanCount,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          finders: finders.map((s) => ({ ...s.user, rank: s.discoveryRank, at: s.createdAt })),
          flags: {
            newAccounts,
            quickConfirm: quick,
            borderline: finders.some((s) => borderline(s.vision)),
            duplicates,
          },
        };
      }),
    };
  }),

  byId: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const mural = await ctx.db.mural.findUnique({
      where: { id: input.id },
      include: {
        discoverer: { select: { id: true, name: true, image: true } },
        scans: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, image: true, joinedAt: true } } },
        },
      },
    });
    if (!mural) throw new TRPCError({ code: "NOT_FOUND" });
    await assertMuralsInScope(ctx, [mural.id]);

    const nearby = await ctx.db.mural.findMany({
      where: { id: { not: mural.id }, mergedIntoId: null, ...platformScope(ctx), ...boxAround(mural.latitude, mural.longitude, DUPLICATE_RADIUS_M) },
      select: { id: true, title: true, autoTitle: true, coverUrl: true, status: true, latitude: true, longitude: true, scanCount: true },
    });
    const coins = await ctx.db.coinLedger.aggregate({ where: { muralId: mural.id, amount: { gt: 0 } }, _sum: { amount: true } });

    return {
      ...mural,
      coinsPaid: coins._sum.amount ?? 0,
      scans: mural.scans.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        keyframes: s.keyframes,
        platform: s.platform,
        latitude: s.latitude,
        longitude: s.longitude,
        accuracyM: s.accuracyM,
        discoveryRank: s.discoveryRank,
        coinsAwarded: s.coinsAwarded,
        borderline: borderline(s.vision),
        newAccount: Boolean(s.user.joinedAt && Date.now() - s.user.joinedAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000),
        vision: s.vision as VisionJson & { labels?: { description: string; score: number }[] },
        user: s.user,
      })),
      duplicates: nearby
        .map((n) => ({ ...n, title: n.title ?? n.autoTitle, distanceM: Math.round(distanceM(mural, n)) }))
        .filter((n) => n.distanceM <= DUPLICATE_RADIUS_M),
    };
  }),

  /** Coins a FRAUD rejection would take back — for the confirm dialog. */
  revokePreview: adminProcedure.input(z.object({ ids: z.array(z.string()).min(1).max(200) })).query(async ({ ctx, input }) => {
    await assertMuralsInScope(ctx, input.ids);
    const users = new Set<string>();
    let coins = 0;
    for (const id of input.ids) {
      for (const p of await coinPosition(ctx.db, id)) {
        if (p.net > 0) {
          users.add(p.userId);
          coins += p.net;
        }
      }
    }
    return { users: users.size, coins };
  }),

  decide: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(200),
        status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
        reason: z.enum(["NOT_A_MURAL", "FRAUD"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.status === "REJECTED" && !input.reason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a reason for rejecting" });
      }
      await assertMuralsInScope(ctx, input.ids);
      const adminId = ctx.session.user.id;
      let revoked = { users: 0, coins: 0 };
      await ctx.db.$transaction(
        async (tx) => {
          for (const id of input.ids) {
            const m = await tx.mural.findUnique({ where: { id }, select: { status: true, rejectReason: true } });
            if (!m) continue;
            const wasFraud = m.status === "REJECTED" && m.rejectReason === "FRAUD";
            const toFraud = input.status === "REJECTED" && input.reason === "FRAUD";
            if (wasFraud && !toFraud) await restore(tx, id);
            if (toFraud && !wasFraud) {
              const r = await revoke(tx, id);
              revoked = { users: revoked.users + r.users, coins: revoked.coins + r.coins };
            }
            await tx.mural.update({
              where: { id },
              data: {
                status: input.status,
                rejectReason: input.status === "REJECTED" ? input.reason : null,
                decidedAt: input.status === "PENDING" ? null : new Date(),
                decidedById: input.status === "PENDING" ? null : adminId,
              },
            });
          }
        },
        { timeout: 30_000 },
      );
      await logAudit(ctx, {
        action: `mural.${input.status.toLowerCase()}`,
        entityType: "Mural",
        entityId: input.ids.join(","),
        meta: { ids: input.ids, reason: input.reason ?? null, revoked },
      });
      return { revoked };
    }),

  edit: adminProcedure
    .input(
      z.object({
        id: z.string(),
        // "" clears it back to the auto title / no artist.
        title: z.string().trim().max(80).nullable().transform((v) => (v === "" ? null : v)),
        artist: z.string().trim().max(80).nullable().transform((v) => (v === "" ? null : v)),
        coverUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMuralsInScope(ctx, [input.id]);
      if (input.coverUrl) {
        // The cover must be one of this mural's own keyframes.
        const owns = await ctx.db.muralScan.findFirst({ where: { muralId: input.id, keyframes: { has: input.coverUrl } }, select: { id: true } });
        if (!owns) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a photo from this mural's scans" });
      }
      return ctx.db.mural.update({
        where: { id: input.id },
        data: {
          title: input.title,
          artist: input.artist,
          ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
        },
      });
    }),

  /** Fold a duplicate into the record that stays. Scans, references and coins move across. */
  merge: adminProcedure.input(z.object({ fromId: z.string(), intoId: z.string() })).mutation(async ({ ctx, input }) => {
    if (input.fromId === input.intoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a different mural" });
    await assertMuralsInScope(ctx, [input.fromId, input.intoId]);
    const result = await ctx.db.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const [from, into] = await Promise.all([
        tx.mural.findUnique({ where: { id: input.fromId } }),
        tx.mural.findUnique({ where: { id: input.intoId } }),
      ]);
      if (!from || !into || from.mergedIntoId || into.mergedIntoId) throw new TRPCError({ code: "NOT_FOUND", message: "Mural not found" });
      // Each platform's murals, scans and coins stay on that platform.
      if (from.platformId !== into.platformId) throw new TRPCError({ code: "BAD_REQUEST", message: "Murals on different platforms can't be merged" });

      await tx.muralScan.updateMany({ where: { muralId: from.id }, data: { muralId: into.id } });
      await tx.muralEmbedding.updateMany({ where: { muralId: from.id }, data: { muralId: into.id } });
      await tx.coinLedger.updateMany({ where: { muralId: from.id }, data: { muralId: into.id } });

      const scanners = await tx.muralScan.findMany({ where: { muralId: into.id }, distinct: ["userId"], select: { userId: true } });
      const scanCount = await tx.muralScan.count({ where: { muralId: into.id } });
      const promote = into.status === "DISCOVERED" && scanners.length >= settings.confirmationsNeeded;
      await tx.mural.update({
        where: { id: into.id },
        data: {
          distinctScanners: scanners.length,
          scanCount,
          title: into.title ?? from.title,
          artist: into.artist ?? from.artist,
          ...(promote ? { status: "PENDING" } : {}),
        },
      });
      await tx.mural.update({ where: { id: from.id }, data: { mergedIntoId: into.id, distinctScanners: 0, scanCount: 0 } });
      return { intoId: into.id };
    });
    await logAudit(ctx, { action: "mural.merge", entityType: "Mural", entityId: input.fromId, meta: { into: input.intoId } });
    return result;
  }),

  /**
   * Insights tab: volume, acceptance, Cloud Vision spend, coins, reject
   * reasons and the accounts worth a look — all from MuralScanSession, which
   * records every attempt (accepted or not) with the Vision units it cost.
   * Wadzzo only: scan sessions aren't recorded per platform.
   */
  insights: superAdminProcedure.input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]) })).query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - input.days * 86_400_000);
    const where = { startedAt: { gte: since }, finishedAt: { not: null } };

    const [byOutcome, daily, coins, topUsers] = await Promise.all([
      ctx.db.muralScanSession.groupBy({ by: ["outcome"], where, _count: { _all: true }, _sum: { costUnits: true } }),
      ctx.db.$queryRaw<{ day: Date; accepted: bigint; rejected: bigint }[]>`
        SELECT date_trunc('day', "startedAt") AS day,
               count(*) FILTER (WHERE outcome = 'accepted') AS accepted,
               count(*) FILTER (WHERE outcome <> 'accepted') AS rejected
        FROM "MuralScanSession"
        WHERE "startedAt" >= ${since} AND "finishedAt" IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      ctx.db.coinLedger.groupBy({ by: ["reason"], where: { createdAt: { gte: since } }, _sum: { amount: true } }),
      ctx.db.muralScanSession.groupBy({
        by: ["userId"],
        where,
        _count: { _all: true },
        _sum: { costUnits: true },
        orderBy: { _count: { userId: "desc" } },
        take: 15,
      }),
    ]);

    // Per-user breakdown for the top accounts only.
    const ids = topUsers.map((u) => u.userId);
    const [users, perOutcome, earned] = await Promise.all([
      ctx.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, image: true, joinedAt: true } }),
      ctx.db.muralScanSession.groupBy({ by: ["userId", "outcome"], where: { ...where, userId: { in: ids } }, _count: { _all: true } }),
      ctx.db.coinLedger.groupBy({ by: ["userId"], where: { userId: { in: ids }, createdAt: { gte: since }, amount: { gt: 0 } }, _sum: { amount: true } }),
    ]);

    const attempts = byOutcome.reduce((n, r) => n + r._count._all, 0);
    const accepted = byOutcome.find((r) => r.outcome === "accepted")?._count._all ?? 0;
    const units = byOutcome.reduce((n, r) => n + (r._sum.costUnits ?? 0), 0);
    const sum = (reason: string) => coins.find((c) => c.reason === reason)?._sum.amount ?? 0;

    // Fill empty days so the chart's x-axis is continuous.
    const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
    const days = Array.from({ length: input.days }, (_, i) => {
      const key = new Date(Date.now() - (input.days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const d = byDay.get(key);
      return { day: key, accepted: Number(d?.accepted ?? 0), rejected: Number(d?.rejected ?? 0) };
    });

    const now = Date.now();
    return {
      days: input.days,
      totals: {
        attempts,
        accepted,
        acceptRate: attempts ? accepted / attempts : 0,
        visionUnits: units,
        // List prices after the free tier: tier 1 (label + safe search) is
        // one unit at $1.50/1k; tier 2 averages ~$2.75/1k per unit.
        estVisionUsd: Math.round(units * 0.0025 * 100) / 100,
        coinsIssued: sum("MURAL_SCAN") + sum("MURAL_DISCOVERY") + sum("ADMIN_ADJUST"),
        coinsRevoked: -sum("MURAL_REVOKE"),
      },
      daily: days,
      reasons: byOutcome
        .filter((r) => r.outcome && r.outcome !== "accepted")
        .map((r) => ({ code: r.outcome!, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      users: topUsers.map((u) => {
        const info = users.find((x) => x.id === u.userId);
        const mine = perOutcome.filter((o) => o.userId === u.userId);
        const count = (codes: string[]) => mine.filter((o) => o.outcome && codes.includes(o.outcome)).reduce((n, o) => n + o._count._all, 0);
        return {
          id: u.userId,
          name: info?.name ?? null,
          image: info?.image ?? null,
          newAccount: Boolean(info?.joinedAt && now - info.joinedAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000),
          attempts: u._count._all,
          accepted: count(["accepted"]),
          spoofLike: count(["SCREEN", "WEB_COPY", "GPS_WEAK"]),
          visionUnits: u._sum.costUnits ?? 0,
          coins: earned.find((e) => e.userId === u.userId)?._sum.amount ?? 0,
        };
      }),
    };
  }),

  settings: adminProcedure.query(({ ctx }) => getSettings(ctx.db)),

  // One settings row drives every platform's mural coins, so only Wadzzo admins change it.
  updateSettings: superAdminProcedure
    .input(
      z.object({
        coinsPerScan: z.number().int().min(0).max(10_000),
        discoveryBonus: z.number().int().min(0).max(100_000),
        dailyScansPerMural: z.number().int().min(1).max(50),
        confirmationsNeeded: z.number().int().min(1).max(20),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.muralSettings.upsert({
        where: { id: 1 },
        update: { ...input, updatedById: ctx.session.user.id },
        create: { id: 1, ...input, updatedById: ctx.session.user.id },
      }),
    ),
});
