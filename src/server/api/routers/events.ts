import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import type { PrismaClient } from "@prisma/client";

/**
 * Creator side of Events & Announcements. Fans see them in wadzzoAR and the
 * mobile app (`events` router there). Everything is public and goes live on
 * save — there is no approval step.
 *
 * `creatorProcedure` also lets admins through, but events hang off a Creator
 * row, so every mutation resolves the caller's own creator first.
 */

const httpUrl = z
  .string()
  .trim()
  .url("Enter a full link, starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) links are allowed");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const EventInput = z
  .object({
    title: z.string().trim().min(3, "Give the event a title").max(120),
    description: z.string().trim().min(1, "Describe the event").max(5000),
    coverImage: httpUrl.nullish(),
    startDate: z.date(),
    endDate: z.date(),
    venueName: optionalText(120),
    address: optionalText(300),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    link: httpUrl.nullish(),
    linkLabel: optionalText(40),
    capacity: z.number().int().min(1).max(1_000_000).nullish(),
    pinIds: z.array(z.string()).max(20).default([]),
    bountyIds: z.array(z.number().int()).max(20).default([]),
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ["endDate"],
    message: "End must be after the start",
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    path: ["latitude"],
    message: "Pick the venue on the map",
  });

export const AnnouncementInput = z
  .object({
    title: z.string().trim().min(3, "Give the post a title").max(120),
    body: z.string().trim().min(1, "Write something").max(5000),
    images: z.array(httpUrl).max(6).default([]),
    pinned: z.boolean().default(false),
    ctaLabel: optionalText(40),
    ctaUrl: httpUrl.nullish(),
    expiresAt: z.date().nullish(),
  })
  .refine((v) => !v.ctaLabel || v.ctaUrl, {
    path: ["ctaUrl"],
    message: "Add the link the button opens",
  });

async function creatorIdOf(db: PrismaClient, userId: string) {
  const creator = await db.creator.findUnique({ where: { id: userId }, select: { id: true } });
  if (!creator) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only brands can post events" });
  }
  return creator.id;
}

/** Linked pins and bounties must be the brand's own. */
async function assertOwnLinks(
  db: PrismaClient,
  creatorId: string,
  pinIds: string[],
  bountyIds: number[],
) {
  if (pinIds.length) {
    const n = await db.locationGroup.count({ where: { id: { in: pinIds }, creatorId } });
    if (n !== new Set(pinIds).size) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can only link your own pins" });
    }
  }
  if (bountyIds.length) {
    const n = await db.bounty.count({ where: { id: { in: bountyIds }, creatorId } });
    if (n !== new Set(bountyIds).size) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can only link your own bounties" });
    }
  }
}

async function ownEvent(db: PrismaClient, creatorId: string, id: string) {
  const row = await db.creatorEvent.findFirst({ where: { id, creatorId }, select: { id: true } });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  return row;
}

async function ownAnnouncement(db: PrismaClient, creatorId: string, id: string) {
  const row = await db.creatorAnnouncement.findFirst({ where: { id, creatorId }, select: { id: true } });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Announcement not found" });
  return row;
}

function eventData(input: z.infer<typeof EventInput>) {
  return {
    title: input.title,
    description: input.description,
    coverImage: input.coverImage ?? null,
    startDate: input.startDate,
    endDate: input.endDate,
    venueName: input.venueName,
    address: input.address,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    link: input.link ?? null,
    linkLabel: input.link ? input.linkLabel : null,
    capacity: input.capacity ?? null,
  };
}

function announcementData(input: z.infer<typeof AnnouncementInput>) {
  return {
    title: input.title,
    body: input.body,
    images: input.images,
    pinned: input.pinned,
    ctaLabel: input.ctaUrl ? input.ctaLabel : null,
    ctaUrl: input.ctaUrl ?? null,
    expiresAt: input.expiresAt ?? null,
  };
}

const userSelect = { select: { id: true, name: true, image: true } } as const;

export const eventsRouter = createTRPCRouter({
  // ── Events ───────────────────────────────────────────────────────────────

  myEvents: creatorProcedure
    .input(z.object({ when: z.enum(["upcoming", "past"]).default("upcoming") }))
    .query(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      const now = new Date();
      return ctx.db.creatorEvent.findMany({
        where: { creatorId, endDate: input.when === "upcoming" ? { gte: now } : { lt: now } },
        orderBy: { startDate: input.when === "upcoming" ? "asc" : "desc" },
        include: {
          pins: { select: { id: true, title: true } },
          bounties: { select: { id: true, title: true } },
          _count: { select: { rsvps: true, comments: true } },
        },
      });
    }),

  createEvent: creatorProcedure.input(EventInput).mutation(async ({ ctx, input }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    await assertOwnLinks(ctx.db, creatorId, input.pinIds, input.bountyIds);
    return ctx.db.creatorEvent.create({
      data: {
        ...eventData(input),
        creatorId,
        pins: { connect: input.pinIds.map((id) => ({ id })) },
        bounties: { connect: input.bountyIds.map((id) => ({ id })) },
      },
      select: { id: true },
    });
  }),

  updateEvent: creatorProcedure
    .input(z.object({ id: z.string(), data: EventInput }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await ownEvent(ctx.db, creatorId, input.id);
      await assertOwnLinks(ctx.db, creatorId, input.data.pinIds, input.data.bountyIds);
      return ctx.db.creatorEvent.update({
        where: { id: input.id },
        data: {
          ...eventData(input.data),
          pins: { set: input.data.pinIds.map((id) => ({ id })) },
          bounties: { set: input.data.bountyIds.map((id) => ({ id })) },
        },
        select: { id: true },
      });
    }),

  deleteEvent: creatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await ownEvent(ctx.db, creatorId, input.id);
      await ctx.db.creatorEvent.delete({ where: { id: input.id } });
      return { deleted: true };
    }),

  attendees: creatorProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await ownEvent(ctx.db, creatorId, input.id);
      return ctx.db.eventRsvp.findMany({
        where: { eventId: input.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, user: userSelect },
      });
    }),

  /** Pickers for linking: the brand's own live pins and bounties. */
  linkOptions: creatorProcedure.query(async ({ ctx }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    const [pins, bounties] = await Promise.all([
      ctx.db.locationGroup.findMany({
        where: { creatorId, hidden: false, endDate: { gte: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, image: true, approved: true },
        take: 200,
      }),
      ctx.db.bounty.findMany({
        where: { creatorId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true },
        take: 200,
      }),
    ]);
    return { pins, bounties };
  }),

  // ── Announcements ────────────────────────────────────────────────────────

  myAnnouncements: creatorProcedure.query(async ({ ctx }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    return ctx.db.creatorAnnouncement.findMany({
      where: { creatorId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { comments: true } } },
    });
  }),

  createAnnouncement: creatorProcedure.input(AnnouncementInput).mutation(async ({ ctx, input }) => {
    const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
    return ctx.db.creatorAnnouncement.create({
      data: { ...announcementData(input), creatorId },
      select: { id: true },
    });
  }),

  updateAnnouncement: creatorProcedure
    .input(z.object({ id: z.string(), data: AnnouncementInput }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await ownAnnouncement(ctx.db, creatorId, input.id);
      return ctx.db.creatorAnnouncement.update({
        where: { id: input.id },
        data: announcementData(input.data),
        select: { id: true },
      });
    }),

  setPinned: creatorProcedure
    .input(z.object({ id: z.string(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await ownAnnouncement(ctx.db, creatorId, input.id);
      return ctx.db.creatorAnnouncement.update({
        where: { id: input.id },
        data: { pinned: input.pinned },
        select: { id: true, pinned: true },
      });
    }),

  deleteAnnouncement: creatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      await ownAnnouncement(ctx.db, creatorId, input.id);
      await ctx.db.creatorAnnouncement.delete({ where: { id: input.id } });
      return { deleted: true };
    }),

  // ── Comment moderation ───────────────────────────────────────────────────

  comments: creatorProcedure
    .input(z.object({ kind: z.enum(["event", "announcement"]), id: z.string() }))
    .query(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      if (input.kind === "event") {
        await ownEvent(ctx.db, creatorId, input.id);
        return ctx.db.eventComment.findMany({
          where: { eventId: input.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, content: true, createdAt: true, user: userSelect },
        });
      }
      await ownAnnouncement(ctx.db, creatorId, input.id);
      return ctx.db.announcementComment.findMany({
        where: { announcementId: input.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true, createdAt: true, user: userSelect },
      });
    }),

  deleteComment: creatorProcedure
    .input(z.object({ kind: z.enum(["event", "announcement"]), commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = await creatorIdOf(ctx.db, ctx.session.user.id);
      const owned =
        input.kind === "event"
          ? await ctx.db.eventComment.count({
              where: { id: input.commentId, event: { creatorId } },
            })
          : await ctx.db.announcementComment.count({
              where: { id: input.commentId, announcement: { creatorId } },
            });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      if (input.kind === "event") {
        await ctx.db.eventComment.delete({ where: { id: input.commentId } });
      } else {
        await ctx.db.announcementComment.delete({ where: { id: input.commentId } });
      }
      return { deleted: true };
    }),
});
