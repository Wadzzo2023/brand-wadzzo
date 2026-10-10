/**
 * Carries out a change the map agent proposed, once the person confirmed it.
 *
 * Nothing the agent wrote is trusted here: every action is re-checked against
 * the brand it acts for (ids must be the brand's own), the person's card edits
 * are validated, and the same input rules as the normal forms apply.
 */
import { PinType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { circleAround } from "~/components/map-kit/geo";
import { hotspotClient } from "~/lib/express/hotspotClient-sdk";
import { taskClient } from "~/lib/express/taskClient-sdk";
import { UNLIMITED_COLLECTIONS, type ActionEdits, type PinDefaults, type ProposedAction } from "~/lib/agent/contract";
import { AnnouncementInput, EventInput, announcementData, eventData } from "~/server/api/routers/events";
import type { Db } from "~/server/db";
import { createOptimizedImage } from "~/server/image-optimizer";
import { BADWORDS } from "~/utils/banned-word";

export type ActingBrand = { creatorId: string; platformId: string };
export type ActionResult = { message: string; pinJobId?: string; id?: string };

const DAY = 86_400_000;
const bad = (text: string) => (BADWORDS.some((w) => text.toLowerCase().includes(w.toLowerCase())) ? text : null);
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const day = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "Not a date");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// ─── Card edits ──────────────────────────────────────────────────────────────

export const ActionEditsInput = z.object({
  keep: z.array(z.string()).max(200).optional(),
  defaults: z
    .object({
      type: z.nativeEnum(PinType),
      startDate: day,
      endDate: day,
      autoCollect: z.boolean(),
      pinNumber: z.number().int().min(1).max(200),
      radius: z.number().min(0).max(5000),
      collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS),
      grouping: z.enum(["per-location", "single-group"]),
    })
    .partial()
    .optional(),
  draft: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<ActionEdits>;

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function executeAction(db: Db, brand: ActingBrand, action: ProposedAction, edits: ActionEdits = {}): Promise<ActionResult> {
  switch (action.type) {
    case "create_pins":
      return createPins(db, brand, action.items, { ...action.defaults, ...edits.defaults }, edits.keep);
    case "update_pins":
      return updatePins(db, brand, action.pins.map((p) => p.id), action.changes);
    case "hide_pins": {
      const { count } = await db.locationGroup.updateMany({ where: { id: { in: action.pins.map((p) => p.id) }, creatorId: brand.creatorId }, data: { hidden: true } });
      return { message: `Deleted ${plural(count, "pin")}.` };
    }
    case "hotspot_state":
      return hotspotState(db, brand, action.hotspot.id, action.op);
    case "update_hotspot": {
      await ownHotspot(db, brand, action.hotspot.id);
      const c = action.changes;
      await hotspotClient.update(brand.creatorId, action.hotspot.id, {
        hotspotStartDate: c.startDate && new Date(c.startDate).toISOString(),
        hotspotEndDate: c.endDate && new Date(c.endDate).toISOString(),
        dropEveryDays: c.dropEveryDays,
        pinDurationDays: c.pinDurationDays,
        autoCollect: c.autoCollect,
        scope: "future_drops",
      });
      return { message: `Updated hotspot “${action.hotspot.title}”.` };
    }
    case "create_hotspot":
      return createHotspot(brand, { ...action.hotspot, ...(edits.draft as object) });
    case "create_event":
      return createEvent(db, brand, { ...action.event, ...(edits.draft as object) });
    case "update_event":
      return updateEvent(db, brand, action.event.id, action.changes);
    case "delete_event": {
      const { count } = await db.creatorEvent.deleteMany({ where: { id: action.event.id, creatorId: brand.creatorId } });
      if (!count) throw new TRPCError({ code: "NOT_FOUND", message: "That event no longer exists" });
      return { message: `Deleted event “${action.event.title}”.` };
    }
    case "create_announcement":
      return createAnnouncement(db, brand, { ...action.announcement, ...(edits.draft as object) });
    case "update_announcement":
      return updateAnnouncement(db, brand, action.announcement.id, action.changes);
    case "delete_announcement": {
      const { count } = await db.creatorAnnouncement.deleteMany({ where: { id: action.announcement.id, creatorId: brand.creatorId } });
      if (!count) throw new TRPCError({ code: "NOT_FOUND", message: "That announcement no longer exists" });
      return { message: `Deleted announcement “${action.announcement.title}”.` };
    }
  }
}

// ─── Pins ────────────────────────────────────────────────────────────────────

async function createPins(
  db: Db,
  brand: ActingBrand,
  items: Extract<ProposedAction, { type: "create_pins" }>["items"],
  rawDefaults: PinDefaults,
  keep?: string[],
): Promise<ActionResult> {
  const defaults = ActionEditsInput.shape.defaults.unwrap().required().parse(rawDefaults);
  const start = new Date(defaults.startDate);
  const end = new Date(defaults.endDate);
  if (end <= start) throw badRequest("The pins must end after they start");

  const chosen = keep ? items.filter((i) => keep.includes(i.key)) : items;
  if (chosen.length === 0) throw badRequest("Pick at least one place");
  const banned = chosen.map((i) => bad(i.title)).find(Boolean);
  if (banned) throw badRequest(`“${banned}” contains a banned word. Untick it and try again.`);

  const pins = chosen.map((i) => {
    // Events keep their own dates; everything else uses the card's dates.
    const ownDates = i.kind === "event" && i.startDate && i.endDate;
    return {
      id: i.key,
      type: defaults.type,
      title: i.title.slice(0, 120),
      description: i.address ?? i.title,
      latitude: i.lat,
      longitude: i.lng,
      startDate: (ownDates ? new Date(i.startDate!) : start).toISOString(),
      endDate: (ownDates ? new Date(new Date(i.endDate!).getTime() + DAY - 1) : end).toISOString(),
      pinCollectionLimit: defaults.collectionLimit,
      radius: defaults.radius,
      url: i.url,
      image: i.image,
      gPlaceId: i.gPlaceId,
    };
  });
  const pinOptions = { autoCollect: defaults.autoCollect, groupingMode: defaults.grouping, pinNumber: defaults.pinNumber };

  const job = await db.locationGroupJob.create({
    data: {
      creatorId: brand.creatorId,
      status: "pending",
      total: pins.length,
      payload: { pins, pinOptions },
      redeemMode: defaults.grouping,
    },
    select: { id: true },
  });
  // One attempt: a retry after a partial run would create duplicate pins.
  await taskClient.enqueue("create_pins", brand.creatorId, { locationGroupJobId: job.id, creatorId: brand.creatorId, pins, pinOptions }, 1);
  return { message: `Creating ${plural(pins.length, "pin")}…`, pinJobId: job.id };
}

async function updatePins(db: Db, brand: ActingBrand, ids: string[], changes: Extract<ProposedAction, { type: "update_pins" }>["changes"]): Promise<ActionResult> {
  const pins = await db.locationGroup.findMany({
    where: { id: { in: ids }, creatorId: brand.creatorId, hidden: false },
    select: { id: true, image: true, startDate: true, endDate: true, limit: true, remaining: true },
  });
  if (pins.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Those pins no longer exist" });
  if (changes.title && (changes.title.trim().length < 3 || bad(changes.title))) throw badRequest("That title isn't allowed");
  for (const url of [changes.link, changes.image]) if (url && !/^https?:\/\//i.test(url)) throw badRequest("Links must start with http(s)://");

  const optimizedImage = changes.image ? await createOptimizedImage(changes.image).catch(() => null) : undefined;

  await db.$transaction(async (tx) => {
    for (const p of pins) {
      const start = changes.startDate ? new Date(changes.startDate) : p.startDate;
      const end = changes.endDate ? new Date(new Date(changes.endDate).getTime() + DAY - 1) : p.endDate;
      if (end <= start) throw badRequest("A pin would end before it starts");
      const collected = p.limit - p.remaining;
      await tx.locationGroup.update({
        where: { id: p.id },
        data: {
          title: changes.title?.trim(),
          description: changes.description,
          link: changes.link,
          ...(changes.image && { image: changes.image, optimizedImage }),
          startDate: changes.startDate ? start : undefined,
          endDate: changes.endDate ? end : undefined,
          ...(changes.collectionLimit && { limit: changes.collectionLimit, remaining: Math.max(0, changes.collectionLimit - collected) }),
        },
      });
    }
    if (changes.autoCollect !== undefined) {
      await tx.location.updateMany({ where: { locationGroupId: { in: pins.map((p) => p.id) } }, data: { autoCollect: changes.autoCollect } });
    }
  });
  return { message: `Updated ${plural(pins.length, "pin")}.` };
}

// ─── Hotspots ────────────────────────────────────────────────────────────────

async function ownHotspot(db: Db, brand: ActingBrand, id: string) {
  const h = await db.hotspot.findFirst({ where: { id, creatorId: brand.creatorId, hidden: false }, select: { id: true } });
  if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "That hotspot no longer exists" });
  return h;
}

async function hotspotState(db: Db, brand: ActingBrand, id: string, op: "pause" | "resume" | "delete"): Promise<ActionResult> {
  await ownHotspot(db, brand, id);
  if (op === "pause") await hotspotClient.pause(brand.creatorId, id);
  else if (op === "resume") await hotspotClient.resume(brand.creatorId, id);
  else await hotspotClient.delete(brand.creatorId, id);
  return { message: { pause: "Hotspot paused.", resume: "Hotspot resumed.", delete: "Hotspot deleted." }[op] };
}

const HotspotDraftInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().max(2000).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusMetres: z.number().min(50).max(50_000),
    type: z.nativeEnum(PinType),
    startDate: day,
    endDate: day,
    dropEveryDays: z.number().int().min(1).max(365),
    pinDurationDays: z.number().int().min(1).max(365),
    pinNumber: z.number().int().min(1).max(100),
    collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS),
    autoCollect: z.boolean(),
  })
  .refine((h) => new Date(h.endDate) > new Date(h.startDate), { message: "The hotspot must end after it starts" })
  .refine((h) => !bad(h.title), { message: "That title isn't allowed" });

async function createHotspot(brand: ActingBrand, raw: unknown): Promise<ActionResult> {
  const h = parse(HotspotDraftInput, raw);
  const { hotspotId } = await hotspotClient.create(brand.creatorId, {
    title: h.title,
    description: h.description,
    type: h.type,
    dropEveryDays: h.dropEveryDays,
    pinDurationDays: h.pinDurationDays,
    hotspotStartDate: new Date(h.startDate).toISOString(),
    hotspotEndDate: new Date(h.endDate).toISOString(),
    pinNumber: h.pinNumber,
    pinCollectionLimit: h.collectionLimit,
    autoCollect: h.autoCollect,
    hotspotShape: "circle",
    geoJson: circleAround({ lat: h.lat, lng: h.lng }, h.radiusMetres),
    creatorId: brand.creatorId,
  });
  return { message: `Hotspot “${h.title}” created.`, id: hotspotId };
}

// ─── Events & announcements (same rules as the Events pages) ─────────────────

const toEventInput = (e: Record<string, unknown>) =>
  parse(EventInput, {
    title: e.title,
    description: e.description,
    coverImage: e.coverImage ?? null,
    startDate: e.startDate ? new Date(e.startDate as string) : undefined,
    endDate: e.endDate ? new Date(e.endDate as string) : undefined,
    venueName: e.venueName ?? null,
    address: e.address ?? null,
    latitude: e.lat ?? e.latitude ?? null,
    longitude: e.lng ?? e.longitude ?? null,
    link: e.link ?? null,
    linkLabel: e.linkLabel ?? null,
    capacity: e.capacity ?? null,
    pinIds: [],
    bountyIds: [],
  });

async function createEvent(db: Db, brand: ActingBrand, draft: Record<string, unknown>): Promise<ActionResult> {
  const input = toEventInput(draft);
  const row = await db.creatorEvent.create({ data: { ...eventData(input), creatorId: brand.creatorId, platformId: brand.platformId }, select: { id: true } });
  return { message: `Event “${input.title}” created.`, id: row.id };
}

async function updateEvent(db: Db, brand: ActingBrand, id: string, changes: Record<string, unknown>): Promise<ActionResult> {
  const current = await db.creatorEvent.findFirst({ where: { id, creatorId: brand.creatorId } });
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "That event no longer exists" });
  const input = toEventInput({ ...current, ...changes });
  // Linked pins and bounties are left as they are.
  await db.creatorEvent.update({ where: { id }, data: eventData(input) });
  return { message: `Updated event “${input.title}”.`, id };
}

const toAnnouncementInput = (a: Record<string, unknown>) =>
  parse(AnnouncementInput, {
    title: a.title,
    body: a.body,
    images: a.images ?? [],
    pinned: a.pinned ?? false,
    ctaLabel: a.ctaLabel ?? null,
    ctaUrl: a.ctaUrl ?? null,
    expiresAt: a.expiresAt ? new Date(a.expiresAt as string) : null,
  });

async function createAnnouncement(db: Db, brand: ActingBrand, draft: Record<string, unknown>): Promise<ActionResult> {
  const input = toAnnouncementInput(draft);
  const row = await db.creatorAnnouncement.create({ data: { ...announcementData(input), creatorId: brand.creatorId, platformId: brand.platformId }, select: { id: true } });
  return { message: `Announcement “${input.title}” posted.`, id: row.id };
}

async function updateAnnouncement(db: Db, brand: ActingBrand, id: string, changes: Record<string, unknown>): Promise<ActionResult> {
  const current = await db.creatorAnnouncement.findFirst({ where: { id, creatorId: brand.creatorId } });
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "That announcement no longer exists" });
  const input = toAnnouncementInput({ ...current, ...changes });
  await db.creatorAnnouncement.update({ where: { id }, data: announcementData(input) });
  return { message: `Updated announcement “${input.title}”.`, id };
}

/** Validates with a form schema, turning its first problem into a readable error. */
function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw badRequest(issue ? `${issue.path.join(".") || "Input"}: ${issue.message}` : "Invalid input");
  }
  return r.data as z.infer<T>;
}
