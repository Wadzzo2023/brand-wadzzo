import { EmbedGesture, EmbedPinSource, EmbedTheme, PinType } from "@prisma/client";
import type { Db } from "~/server/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";

/**
 * Website map embeds (`MapEmbed`). The map itself is served by wadzzoAR at
 * `/embed/[id]`; this router only manages the saved settings and reads the
 * daily counters wadzzoAR writes. Every write is scoped to the caller's own
 * creator row.
 */

const httpUrl = z
  .string()
  .trim()
  .url("Enter a full link starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) links are allowed");

/** "https://www.Example.gov/path" → "example.gov". Mirrors wadzzoAR's normalizeDomain. */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(host) ? host : null;
}

export const EmbedInput = z.object({
  name: z.string().trim().min(1, "Name the embed").max(80),
  enabled: z.boolean().default(true),
  centerLat: z.number().min(-85).max(85),
  centerLng: z.number().min(-180).max(180),
  zoom: z.number().min(2).max(18),
  userLocation: z.boolean(),
  gestureMode: z.nativeEnum(EmbedGesture),
  theme: z.nativeEnum(EmbedTheme),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
  pinSource: z.nativeEnum(EmbedPinSource),
  pinTypes: z.array(z.nativeEnum(PinType)).max(6),
  showFilterChips: z.boolean(),
  showSearch: z.boolean(),
  showNearby: z.boolean(),
  showMurals: z.boolean(),
  eventsLabel: z.string().trim().min(1).max(40),
  eventsUrl: httpUrl.nullable(),
  bountiesLabel: z.string().trim().min(1).max(40),
  bountiesUrl: httpUrl.nullable(),
  allowedDomains: z
    .array(z.string())
    .max(20)
    .transform((list, ctx) => {
      const out: string[] = [];
      for (const raw of list) {
        if (!raw.trim()) continue;
        const d = normalizeDomain(raw);
        if (!d) {
          ctx.addIssue({ code: "custom", message: `"${raw}" isn't a website address` });
          return z.NEVER;
        }
        if (!out.includes(d)) out.push(d);
      }
      return out;
    }),
});

async function creatorIdOf(db: Db, userId: string) {
  const c = await db.creator.findUnique({ where: { id: userId }, select: { id: true } });
  if (!c) throw new TRPCError({ code: "FORBIDDEN", message: "Only brands can create map embeds" });
  return c.id;
}

async function own(db: Db, creatorId: string, id: string) {
  const row = await db.mapEmbed.findFirst({ where: { id, creatorId } });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Embed not found" });
  return row;
}

const utcDay = (daysAgo: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - daysAgo));
};

type Totals = { views: number; pinTaps: number; openClicks: number; eventsClicks: number; bountiesClicks: number };
const ZERO: Totals = { views: 0, pinTaps: 0, openClicks: 0, eventsClicks: 0, bountiesClicks: 0 };

export const embedsRouter = createTRPCRouter({
  list: creatorProcedure.query(async ({ ctx }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    const rows = await ctx.db.mapEmbed.findMany({
      where: { creatorId },
      orderBy: { createdAt: "desc" },
      include: { stats: { where: { day: { gte: utcDay(29) } } } },
    });
    const since7 = utcDay(6).getTime();
    return rows.map(({ stats, ...row }) => {
      const sum = (days: typeof stats) =>
        days.reduce<Totals>(
          (t, d) => ({
            views: t.views + d.views,
            pinTaps: t.pinTaps + d.pinTaps,
            openClicks: t.openClicks + d.openClicks,
            eventsClicks: t.eventsClicks + d.eventsClicks,
            bountiesClicks: t.bountiesClicks + d.bountiesClicks,
          }),
          ZERO,
        );
      return {
        ...row,
        last7: sum(stats.filter((d) => d.day.getTime() >= since7)),
        last30: sum(stats),
      };
    });
  }),

  get: creatorProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    return own(ctx.db, creatorId, input.id);
  }),

  /** Daily counters for the last `days` days, oldest first, gaps filled with zeros. */
  stats: creatorProcedure
    .input(z.object({ id: z.string(), days: z.number().int().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await own(ctx.db, creatorId, input.id);
      const rows = await ctx.db.mapEmbedDailyStat.findMany({
        where: { embedId: input.id, day: { gte: utcDay(input.days - 1) } },
      });
      const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
      return Array.from({ length: input.days }, (_, i) => {
        const day = utcDay(input.days - 1 - i).toISOString().slice(0, 10);
        const r = byDay.get(day);
        return { day, ...(r ? { views: r.views, pinTaps: r.pinTaps, openClicks: r.openClicks, eventsClicks: r.eventsClicks, bountiesClicks: r.bountiesClicks } : ZERO) };
      });
    }),

  create: creatorProcedure.input(EmbedInput).mutation(async ({ ctx, input }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    return ctx.db.mapEmbed.create({ data: { ...input, creatorId }, select: { id: true } });
  }),

  update: creatorProcedure
    .input(z.object({ id: z.string(), data: EmbedInput }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await own(ctx.db, creatorId, input.id);
      return ctx.db.mapEmbed.update({ where: { id: input.id }, data: input.data, select: { id: true } });
    }),

  setEnabled: creatorProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await own(ctx.db, creatorId, input.id);
      return ctx.db.mapEmbed.update({ where: { id: input.id }, data: { enabled: input.enabled }, select: { id: true, enabled: true } });
    }),

  duplicate: creatorProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = await own(ctx.db, creatorId, input.id);
    return ctx.db.mapEmbed.create({
      data: { ...rest, name: `${rest.name} (copy)`.slice(0, 80) },
      select: { id: true },
    });
  }),

  delete: creatorProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    await own(ctx.db, creatorId, input.id);
    await ctx.db.mapEmbed.delete({ where: { id: input.id } });
    return { deleted: true };
  }),
});
