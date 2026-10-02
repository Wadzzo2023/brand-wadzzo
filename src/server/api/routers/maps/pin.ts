// ~/server/api/routers/pin.ts
//
// tRPC router for pin + hotspot management.
//
// Architecture:
//   Hotspot mutations  → hotspotClient  → Express /hotspots  → node-cron scheduler
//   Pin mutations      → Prisma DB directly (unchanged)
//   Agent queries      → taskClient.enqueue("agent_run", ...) → Express job queue
//
// QStash has been removed entirely.

import { ItemPrivacy } from "@prisma/client";
import { PinType } from "@prisma/client";
import type { db as PrismaDb } from "~/server/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertOwnerOrAdmin, isAdmin as checkIsAdmin } from "~/server/api/access";
import { createOptimizedImage } from "~/server/image-optimizer";
import { createHotspotFormSchema } from "~/types/hotspot";
import { updateMapFormSchema } from "~/types/pin-edit";
import { hotspotClient } from "~/lib/express/hotspotClient-sdk";
import { buildPinScanUrl, renderPinQR } from "~/lib/qr-generator";

import {
  adminProcedure,
  createTRPCRouter,
  creatorProcedure,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { type PinLocation } from "~/types/pin";
import { BADWORDS } from "~/utils/banned-word";
import { fetchUsersByPublicKeys } from "~/utils/get-pubkey";
import {
  randomLocation as getLocationInLatLngRad,
} from "~/utils/map";

export type LocationWithConsumers = {
  title: string;
  description?: string;
  image?: string;
  startDate: Date;
  endDate: Date;
  approved?: boolean;
  latitude: number;
  longitude: number;
  consumers: number;
  autoCollect: boolean;
  id: string;
};

const PAGE_SIZE = 10;

export const createPinFormSchema = z.object({
  lat: z
    .number({ message: "Latitude is required" })
    .min(-180)
    .max(180),
  lng: z
    .number({ message: "Longitude is required" })
    .min(-180)
    .max(180),
  description: z.string(),
  title: z
    .string()
    .min(3)
    .refine((value) => !BADWORDS.some((word) => value.includes(word)), {
      message: "Input contains banned words.",
    }),
  image: z.string().url().optional(),
  startDate: z.date(),
  endDate: z
    .date()
    .min(new Date(new Date().setHours(0, 0, 0, 0)))
    .transform((date) => new Date(date.setHours(23, 59, 59, 999))),
  url: z.string().url().optional(),
  autoCollect: z.boolean(),
  token: z.number().optional(),
  tokenAmount: z.number().nonnegative().optional(),
  pinNumber: z.number().nonnegative().min(1),
  radius: z.number().nonnegative(),
  pinCollectionLimit: z.number().min(0),
  tier: z.string().optional(),
  multiPin: z.boolean().optional(),
  creatorId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const PAGE_ASSET_NUM = -10;
export const NO_ASSET = -99;

/**
 * Ceiling on `generateDropQRs`. Every code is a base64 image in one response, so
 * this is really a payload guard — a hotspot that fans out to hundreds of
 * locations belongs on the hotspot page, not squeezed through a single drop.
 */
const MAX_QR_CODES_PER_DROP = 100;

/**
 * 1-based position of a location among its drop's live siblings, ordered by id —
 * the same order `generateDropQRs` renders in, so "Pin 3 of 12" on the sheet
 * matches the sticker the brand actually printed. Null if the location is hidden
 * or gone.
 *
 * A count rather than a fetch: the dialog only wants the ordinal, and ids are
 * cuid-like so a lexicographic comparison lines up with insertion order well
 * enough for a label. Cheaper than pulling every sibling row.
 */
async function locationOrdinal(db: typeof PrismaDb, locationId: string): Promise<number | null> {
  const self = await db.location.findUnique({
    where: { id: locationId },
    select: { id: true, locationGroupId: true },
  });
  if (!self) return null;
  const ahead = await db.location.count({
    where: {
      locationGroupId: self.locationGroupId,
      hidden: false,
      id: { lte: self.id },
    },
  });
  return ahead;
}

export const createAdminPinFormSchema = z.object({
  lat: z.number({ message: "Latitude is required" }).min(-180).max(180),
  lng: z.number({ message: "Longitude is required" }).min(-180).max(180),
  description: z.string(),
  title: z
    .string()
    .min(3)
    .refine((value) => !BADWORDS.some((word) => value.includes(word)), {
      message: "Input contains banned words.",
    }),
  image: z.string().url().optional(),
  startDate: z.date(),
  endDate: z.date().refine(
    (date) => {
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      return endOfDay >= new Date(new Date().setHours(0, 0, 0, 0));
    },
    { message: "End date must be today or later" }
  ),
  url: z.string().url().optional(),
  autoCollect: z.boolean(),
  token: z.number().optional(),
  tokenAmount: z.number().nonnegative().optional(),
  pinNumber: z.number().nonnegative().min(1),
  radius: z.number().nonnegative(),
  pinCollectionLimit: z.number().min(0),
  tier: z.string().optional(),
  multiPin: z.boolean().optional(),
  creatorId: z.string(),
  tags: z.array(z.string()).default([]),
});

type AuthCtx = Parameters<typeof assertOwnerOrAdmin>[0];

/** The hotspot, if the caller owns it or is an admin. */
async function manageableHotspot(ctx: AuthCtx, hotspotId: string) {
  const h = await ctx.db.hotspot.findUnique({ where: { id: hotspotId }, select: { id: true, creatorId: true, isActive: true } });
  if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Hotspot not found" });
  await assertOwnerOrAdmin(ctx, h.creatorId);
  return h;
}

/** What Admin › Pin review shows for each group. Kept to two queries — this list can be long. */
const reviewSelect = {
  id: true,
  title: true,
  description: true,
  image: true,
  type: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  latitude: true,
  longitude: true,
  creator: { select: { name: true, id: true, profileUrl: true } },
  _count: { select: { locations: { where: { hidden: false } } } },
  // No `locations` here, deliberately. Bulk QR work addresses a drop by its group
  // id, and the one place that needs a concrete location id (the preview drawer)
  // fetches the full list itself via `getReviewGroup`.
} as const;

export const pinRouter = createTRPCRouter({
  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),

  // ─── Hotspot mutations → Express task server ────────────────────────────────
  //
  // These no longer touch QStash or the cron scheduler directly.
  // They call hotspotClient which POSTs to the Express /hotspots API.
  // The Express server owns the node-cron scheduler lifecycle.

  createHotspot: creatorProcedure
    .input(createHotspotFormSchema.extend({ creatorId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = input.creatorId ?? ctx.session.user.id;
      // Creating a hotspot for another brand is an admin action.
      await assertOwnerOrAdmin(ctx, creatorId);
      if (input.hotspotEndDate <= input.hotspotStartDate)
        throw new TRPCError({ code: "BAD_REQUEST", message: "The hotspot must end after it starts" });

      try {
        const result = await hotspotClient.create(creatorId, {
          title: input.title,
          description: input.description,
          image: input.image ?? undefined,
          // The task server rejects "" as a URL: leave the link out when empty.
          url: input.url ?? undefined,
          type: input.type,
          dropEveryDays: input.dropEveryDays,
          pinDurationDays: input.pinDurationDays,
          hotspotStartDate: input.hotspotStartDate.toISOString(),
          hotspotEndDate: input.hotspotEndDate.toISOString(),
          pinNumber: input.pinNumber,
          pinCollectionLimit: input.pinCollectionLimit,
          autoCollect: input.autoCollect,
          multiPin: input.multiPin,
          hotspotShape: input.hotspotShape,
          geoJson: input.geoJson,
          token: input.token,
          tier: input.tier,
          creatorId,
        });

        return { hotspotId: result.hotspotId };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to create hotspot",
        });
      }
    }),

  myHotspots: creatorProcedure.query(async ({ ctx }) => {
    return ctx.db.hotspot.findMany({
      where: { creatorId: ctx.session.user.id, hidden: false },
      select: {
        id: true,
        creatorId: true,
        isActive: true,
        dropEveryDays: true,
        pinDurationDays: true,
        hotspotStartDate: true,
        hotspotEndDate: true,
        shape: true,
        geoJson: true,
        autoCollect: true,
        multiPin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getCreatorHotspots: adminProcedure
    .input(z.object({ creatorId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.hotspot.findMany({
        where: { creatorId: input.creatorId, hidden: false },
        select: {
          id: true,
          creatorId: true,
          isActive: true,
          dropEveryDays: true,
          pinDurationDays: true,
          hotspotStartDate: true,
          hotspotEndDate: true,
          shape: true,
          geoJson: true,
          autoCollect: true,
          multiPin: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getHotspot: creatorProcedure
    .input(z.object({ hotspotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const admin = await checkIsAdmin(ctx);
      const hotspot = await ctx.db.hotspot.findFirst({
        where: {
          id: input.hotspotId,
          ...(!admin ? { creatorId: ctx.session.user.id } : {}),
        },
        select: {
          id: true,
          creatorId: true,
          isActive: true,
          dropEveryDays: true,
          pinDurationDays: true,
          hotspotStartDate: true,
          hotspotEndDate: true,
          shape: true,
          geoJson: true,
          autoCollect: true,
          multiPin: true,
          createdAt: true,
          updatedAt: true,
          locationGroups: {
            where: { hidden: false },
            orderBy: { startDate: "desc" },
            include: {
              locations: { include: { consumers: true } },
            },
          },
        },
      });
      if (!hotspot) return null;
      await assertOwnerOrAdmin(ctx, hotspot.creatorId);

      let scheduleState = { hasSchedule: false, nextRunTime: null as string | null };
      try {
        const expressData = await hotspotClient.get(hotspot.creatorId, input.hotspotId);
        scheduleState = { hasSchedule: expressData.hasSchedule, nextRunTime: expressData.nextRunTime ?? null };
      } catch {
        // Express server unavailable — return hotspot without schedule state
      }

      return { ...hotspot, ...scheduleState };
    }),

  /** Everything the hotspot edit page needs: settings, the drop template (latest drop) and numbers. */
  hotspotForEdit: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const h = await ctx.db.hotspot.findFirst({
      where: { id: input, hidden: false },
      select: {
        id: true, creatorId: true, isActive: true, shape: true, geoJson: true,
        dropEveryDays: true, pinDurationDays: true, hotspotStartDate: true, hotspotEndDate: true,
        autoCollect: true, multiPin: true, createdAt: true,
        creator: { select: { name: true, profileUrl: true } },
      },
    });
    if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Hotspot not found" });
    await assertOwnerOrAdmin(ctx, h.creatorId);

    const now = new Date();
    const [template, drops, live, collected, pendingGroups] = await Promise.all([
      // Every new drop copies the latest one, so that's what "pin details" edits.
      ctx.db.locationGroup.findFirst({
        where: { hotspotId: h.id },
        orderBy: { startDate: "desc" },
        select: { id: true, title: true, description: true, image: true, link: true, type: true, limit: true },
      }),
      ctx.db.locationGroup.count({ where: { hotspotId: h.id, hidden: false } }),
      ctx.db.locationGroup.count({ where: { hotspotId: h.id, hidden: false, startDate: { lte: now }, endDate: { gte: now } } }),
      ctx.db.locationConsumer.count({ where: { location: { locationGroup: { hotspotId: h.id } } } }),
      ctx.db.locationGroup.findMany({ where: { hotspotId: h.id, hidden: true }, select: { startDate: true, createdAt: true } }),
    ]);
    // A first drop waiting for a future start (same rule as the task server).
    const started = !pendingGroups.some((g) => g.startDate.getTime() - g.createdAt.getTime() > 60_000) && h.hotspotStartDate <= now;
    return { ...h, template, stats: { drops, live, collected }, started };
  }),

  /** Change a hotspot: schedule and collection go through the task server (it reschedules); pin details edit the drops. */
  updateHotspot: protectedProcedure
    .input(
      z.object({
        hotspotId: z.string(),
        scope: z.enum(["future_drops", "all_drops"]).default("future_drops"),
        hotspotStartDate: z.date().optional(),
        hotspotEndDate: z.date().optional(),
        dropEveryDays: z.number().int().min(1).optional(),
        pinDurationDays: z.number().int().min(1).optional(),
        autoCollect: z.boolean().optional(),
        multiPin: z.boolean().optional(),
        details: z
          .object({
            title: z.string().trim().min(3).max(120),
            description: z.string().max(2000).nullable(),
            image: z.string().url().nullable(),
            link: z.string().url().nullable(),
            type: z.nativeEnum(PinType),
            limit: z.number().int().min(0),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const h = await manageableHotspot(ctx, input.hotspotId);
      const { hotspotId, scope, details, ...settings } = input;

      const hasSettings = Object.values(settings).some((v) => v !== undefined);
      if (hasSettings) {
        try {
          await hotspotClient.update(h.creatorId, hotspotId, {
            ...settings,
            hotspotStartDate: settings.hotspotStartDate?.toISOString(),
            hotspotEndDate: settings.hotspotEndDate?.toISOString(),
            scope,
          });
        } catch (err) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "The task server couldn't update the hotspot" });
        }
      }

      if (details) {
        const template = await ctx.db.locationGroup.findFirst({ where: { hotspotId }, orderBy: { startDate: "desc" }, select: { id: true, image: true } });
        if (template) {
          const optimizedImage = details.image && details.image !== template.image ? await createOptimizedImage(details.image).catch(() => null) : undefined;
          const content = {
            title: details.title,
            description: details.description,
            image: details.image,
            link: details.link,
            type: details.type,
            ...(optimizedImage !== undefined && { optimizedImage }),
          };
          // Content follows the scope; the collection limit only applies to drops yet to come.
          const now = new Date();
          await ctx.db.locationGroup.updateMany({
            where: { hotspotId, ...(scope === "future_drops" ? { OR: [{ id: template.id }, { startDate: { gte: now } }] } : {}) },
            data: content,
          });
          await ctx.db.locationGroup.update({ where: { id: template.id }, data: { limit: details.limit } });
        }
      }
      return { ok: true };
    }),

  pauseHotspotSchedule: protectedProcedure
    .input(z.object({ hotspotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const h = await manageableHotspot(ctx, input.hotspotId);

      try {
        return await hotspotClient.pause(h.creatorId, input.hotspotId);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to pause hotspot",
        });
      }
    }),

  resumeHotspotSchedule: protectedProcedure
    .input(z.object({ hotspotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const h = await manageableHotspot(ctx, input.hotspotId);

      try {
        return await hotspotClient.resume(h.creatorId, input.hotspotId);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to resume hotspot",
        });
      }
    }),

  deleteHotspotCascade: protectedProcedure
    .input(z.object({ hotspotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const h = await manageableHotspot(ctx, input.hotspotId);

      try {
        return await hotspotClient.delete(h.creatorId, input.hotspotId);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to delete hotspot",
        });
      }
    }),

  // ─── Pin mutations → Prisma DB directly (unchanged) ────────────────────────

  createPin: creatorProcedure
    .input(createPinFormSchema)
    .mutation(async ({ ctx, input }) => {
      const { pinNumber, pinCollectionLimit, token, tier, multiPin } = input;

      let tierId: number | undefined;
      let privacy: ItemPrivacy = ItemPrivacy.PUBLIC;
      if (!tier || tier === "public") privacy = ItemPrivacy.PUBLIC;
      else if (tier === "private") privacy = ItemPrivacy.PRIVATE;
      else { tierId = Number(tier); privacy = ItemPrivacy.TIER; }

      let assetId = token;
      let pageAsset = false;
      if (token === PAGE_ASSET_NUM) { assetId = undefined; pageAsset = true; }

      const locations = Array.from({ length: pinNumber }).map(() => {
        const loc = getLocationInLatLngRad(input.lat, input.lng, input.radius);
        return {
          autoCollect: input.autoCollect,
          latitude: loc.latitude,
          longitude: loc.longitude,
        };
      });

      const optimizedImage = input.image
        ? await createOptimizedImage(input.image).catch(() => null)
        : null;

      const targetCreatorId = input.creatorId ?? ctx.session.user.id;
      await assertOwnerOrAdmin(ctx, targetCreatorId);

      const locationGroup = await ctx.db.locationGroup.create({
        data: {
          creatorId: targetCreatorId,
          endDate: input.endDate,
          startDate: input.startDate,
          title: input.title,
          description: input.description,
          assetId,
          pageAsset,
          limit: pinCollectionLimit,
          image: input.image,
          optimizedImage,
          link: input.url,
          latitude: input.lat,
          longitude: input.lng,
          radius: input.radius,
          locations: { createMany: { data: locations } },
          subscriptionId: tierId,
          privacy,
          remaining: pinCollectionLimit,
          multiPin,
        },
      });
      if (input.tags && input.tags.length > 0) {
        await ctx.db.locationGroupTag.createMany({
          data: input.tags.map((tagId) => ({
            locationGroupId: locationGroup.id,
            tagId,
          })),
          skipDuplicates: true,
        })
      }
      return locationGroup;
    }),

  createForAdminPin: adminProcedure
    .input(createAdminPinFormSchema)
    .mutation(async ({ ctx, input }) => {
      const { pinNumber, pinCollectionLimit, token, tier, multiPin, creatorId } = input;

      const creator = await ctx.db.creator.findUnique({ where: { id: creatorId } });
      if (!creator) throw new Error("Creator not found");

      let tierId: number | undefined;
      let privacy: ItemPrivacy = ItemPrivacy.PUBLIC;
      if (!tier || tier === "public") privacy = ItemPrivacy.PUBLIC;
      else if (tier === "private") privacy = ItemPrivacy.PRIVATE;
      else { tierId = Number(tier); privacy = ItemPrivacy.TIER; }

      let assetId = token;
      let pageAsset = false;
      if (token === PAGE_ASSET_NUM) { assetId = undefined; pageAsset = true; }

      const locations = Array.from({ length: pinNumber }).map(() => {
        const loc = getLocationInLatLngRad(input.lat, input.lng, input.radius);
        return {
          autoCollect: input.autoCollect,
          latitude: loc.latitude,
          longitude: loc.longitude,
        };
      });

      const optimizedImage = input.image
        ? await createOptimizedImage(input.image).catch(() => null)
        : null;

      const locationGroup = await ctx.db.locationGroup.create({
        data: {
          creatorId,
          endDate: input.endDate,
          startDate: input.startDate,
          title: input.title,
          description: input.description,
          assetId,
          pageAsset,
          limit: pinCollectionLimit,
          image: input.image,
          optimizedImage,
          link: input.url,
          latitude: input.lat,
          longitude: input.lng,
          radius: input.radius,
          locations: { createMany: { data: locations } },
          subscriptionId: tierId,
          privacy,
          remaining: pinCollectionLimit,
          multiPin,
        },
      });
      if (input.tags && input.tags.length > 0) {
        await ctx.db.locationGroupTag.createMany({
          data: input.tags.map((tagId) => ({
            locationGroupId: locationGroup.id,
            tagId,
          })),
          skipDuplicates: true,
        })
      }
      return locationGroup;
    }),

  getPin: creatorProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const pin = await ctx.db.location.findUnique({
      where: { id: input },
      include: {
        locationGroup: {
          include: {
            creator: { select: { id: true, name: true, profileUrl: true } },
            locations: {
              select: {
                _count: { select: { consumers: true } },
              },
            },
          },
        },
      },
    });
    if (!pin) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
    if (!pin.locationGroup) throw new TRPCError({ code: "NOT_FOUND", message: "Location group not found" });

    await assertOwnerOrAdmin(ctx, pin.locationGroup.creatorId);

    const totalConsumers =
      pin.locationGroup.locations.reduce((n, l) => n + l._count.consumers, 0);

    return {
      id: pin.id,
      title: pin.locationGroup.title,
      description: pin.locationGroup.description,
      image: pin.locationGroup.image,
      startDate: pin.locationGroup.startDate,
      endDate: pin.locationGroup.endDate,
      url: pin.locationGroup.link,
      autoCollect: pin.autoCollect,
      latitude: pin.latitude,
      longitude: pin.longitude,
      totalConsumers,
      consumers: [],
    };
  }),

  getPinM: creatorProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const pin = await ctx.db.location.findUnique({
        where: { id: input },
        include: {
          locationGroup: {
            include: {
              creator: { select: { name: true, profileUrl: true } },
              _count: { select: { locations: true } },
            },
          },
        },
      });
      if (!pin) throw new Error("Pin not found");

      return {
        id: pin.id,
        title: pin.locationGroup?.title,
        description: pin.locationGroup?.description ?? undefined,
        image: pin.locationGroup?.image,
        startDate: pin.locationGroup?.startDate,
        endDate: pin.locationGroup?.endDate,
        url: pin.locationGroup?.link,
        pinCollectionLimit: pin.locationGroup?.limit,
        pinNumber: pin.locationGroup?._count.locations,
        autoCollect: pin.autoCollect,
        lat: pin.latitude,
        lng: pin.longitude,
        token: pin.locationGroup?.pageAsset
          ? PAGE_ASSET_NUM
          : (pin.locationGroup?.subscriptionId ?? NO_ASSET),
        tier: pin.locationGroup?.subscriptionId,
      };
    }),

  /** One of the brand's own pins, shaped for the edit page. Admins can view and edit any creator's pin. */
  myPinForEdit: creatorProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const admin = await checkIsAdmin(ctx);
    const pin = await ctx.db.location.findFirst({
      where: {
        OR: [{ id: input }, { locationGroupId: input }],
        ...(!admin ? { locationGroup: { creatorId: ctx.session.user.id } } : {}),
      },
      include: {
        locationGroup: {
          include: {
            creator: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    if (!pin?.locationGroup) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
    await assertOwnerOrAdmin(ctx, pin.locationGroup.creatorId);
    const g = pin.locationGroup;
    return {
      id: pin.id,
      creatorId: g.creatorId,
      creatorName: g.creator?.name ?? null,
      title: g.title,
      description: g.description ?? "",
      image: g.image ?? "",
      type: g.type,
      url: g.link ?? "",
      startDate: g.startDate,
      endDate: g.endDate,
      limit: g.limit,
      remaining: g.remaining,
      multiPin: g.multiPin,
      autoCollect: pin.autoCollect,
      lat: pin.latitude,
      lng: pin.longitude,
      approved: g.approved,
    };
  }),

  updatePin: protectedProcedure
    .input(updateMapFormSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        pinId, lat, lng, description, title, image,
        startDate, endDate, url, pinRemainingLimit, autoCollect, multiPin,
      } = input;

      try {
        const findLocation = await ctx.db.location.findFirst({
          where: {
            OR: [{ id: pinId }, { locationGroupId: pinId }],
          },
          include: { locationGroup: true },
        });
        if (!findLocation?.locationGroup) {
          throw new Error("Location or associated LocationGroup not found");
        }
        await assertOwnerOrAdmin(ctx, findLocation.locationGroup.creatorId);

        await ctx.db.location.update({
          where: { id: findLocation.id },
          data: { latitude: lat, longitude: lng, autoCollect },
        });

        let updatedLimit = findLocation.locationGroup.limit;
        let updatedRemainingLimit = findLocation.locationGroup.remaining;
        if (typeof pinRemainingLimit === "number") {
          const limitDiff = pinRemainingLimit - findLocation.locationGroup.remaining;
          updatedLimit = updatedLimit + limitDiff;
          updatedRemainingLimit = pinRemainingLimit;
        }

        const imageChanged = image !== undefined && image !== findLocation.locationGroup.image;
        const optimizedImage = imageChanged
          ? await createOptimizedImage(image).catch(() => null)
          : undefined;

        return await ctx.db.locationGroup.update({
          where: { id: findLocation.locationGroup.id },
          data: {
            title, description, image, startDate, endDate,
            ...(optimizedImage !== undefined && { optimizedImage }),
            limit: updatedLimit, remaining: updatedRemainingLimit,
            link: url, multiPin,
          },
        });
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        console.error("Error updating location group:", e);
        throw new Error("Failed to update location group");
      }
    }),

  getMyPins: creatorProcedure
    .input(z.object({ showExpired: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const { showExpired = false } = input;
      const dateCondition = showExpired
        ? { endDate: { lte: new Date() } }
        : { endDate: { gte: new Date() } };

      return ctx.db.location.findMany({
        where: {
          locationGroup: {
            hidden: false,
            creatorId: ctx.session.user.id,
            ...dateCondition,
            OR: [{ approved: true }, { approved: null }],
          },
          hidden: false,
        },
        include: {
          _count: { select: { consumers: true } },
          locationGroup: {
            include: {
              creator: { select: { profileUrl: true, name: true, coverUrl: true } },
              locations: {
                select: {
                  locationGroup: {
                    select: {
                      endDate: true, startDate: true, limit: true,
                      image: true, description: true, title: true,
                      link: true, multiPin: true, subscriptionId: true,
                      pageAsset: true, privacy: true, remaining: true, assetId: true,
                    },
                  },
                  latitude: true, longitude: true, id: true, autoCollect: true,
                },
              },
            },
          },
        },
      });
    }),

  getCreatorPins: adminProcedure
    .input(z.object({ creator_id: z.string(), showExpired: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const { showExpired = false, creator_id } = input;
      const dateCondition = showExpired
        ? { endDate: { lte: new Date() } }
        : { endDate: { gte: new Date() } };

      return ctx.db.location.findMany({
        where: {
          locationGroup: {
            creatorId: creator_id,
            ...dateCondition,
            OR: [{ approved: true }, { approved: null }],
          },
          hidden: false,
        },
        include: {
          _count: { select: { consumers: true } },
          locationGroup: {
            include: {
              creator: { select: { profileUrl: true, name: true, coverUrl: true } },
              locations: {
                select: {
                  locationGroup: {
                    select: {
                      endDate: true, startDate: true, limit: true,
                      image: true, description: true, title: true,
                      link: true, multiPin: true, subscriptionId: true,
                      pageAsset: true, privacy: true, remaining: true, assetId: true,
                    },
                  },
                  latitude: true, longitude: true, id: true, autoCollect: true,
                },
              },
            },
          },
        },
      });
    }),

  getRangePins: creatorProcedure
    .input(z.object({
      northLatitude: z.number(),
      southLatitude: z.number(),
      eastLongitude: z.number(),
      westLongitude: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { northLatitude, southLatitude, eastLongitude, westLongitude } = input;
      return ctx.db.location.findMany({
        where: {
          locationGroup: {
            creatorId: ctx.session.user.id,
            endDate: { gte: new Date() },
            approved: { equals: true },
            hidden: false,
          },
          latitude: { gte: southLatitude, lte: northLatitude },
          longitude: { gte: westLongitude, lte: eastLongitude },
          hidden: false,
        },
        include: {
          _count: { select: { consumers: true } },
          locationGroup: { include: { creator: { select: { profileUrl: true, name: true, coverUrl: true } } } },
        },
      });
    }),

  getAdminLocationGroups: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.locationGroup.findMany({
      where: { approved: { equals: null }, endDate: { gte: new Date() }, hidden: false },
      select: reviewSelect,
      orderBy: { createdAt: "desc" },
    });
  }),

  getApprovedLocationGroups: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.locationGroup.findMany({
      where: { approved: { equals: true }, endDate: { gte: new Date() }, hidden: false },
      select: reviewSelect,
      orderBy: { createdAt: "desc" },
    });
  }),

  /** One group's live locations, loaded when an admin opens it in Pin review. */
  getReviewLocations: adminProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return ctx.db.location.findMany({
      where: { locationGroupId: input, hidden: false },
      select: { id: true, latitude: true, longitude: true, autoCollect: true, _count: { select: { consumers: true } } },
      orderBy: { id: "asc" },
    });
  }),

  /** Everything Pin review's preview drawer shows for one group. */
  getReviewGroup: adminProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const g = await ctx.db.locationGroup.findUnique({
      where: { id: input },
      select: {
        id: true, title: true, description: true, image: true, type: true, link: true,
        startDate: true, endDate: true, createdAt: true, updatedAt: true,
        approved: true, hidden: true, privacy: true, limit: true, remaining: true, multiPin: true,
        creator: { select: { id: true, name: true, profileUrl: true } },
        asset: { select: { name: true, code: true, thumbnail: true } },
        locationGroupTags: { select: { tag: { select: { label: true } } } },
        locations: {
          where: { hidden: false },
          select: { id: true, latitude: true, longitude: true, autoCollect: true, _count: { select: { consumers: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!g) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
    return g;
  }),

  /** Review groups with at least one live location inside the box (west > east crosses the antimeridian). */
  reviewGroupsInArea: adminProcedure
    .input(z.object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() }))
    .query(async ({ ctx, input }) => {
      const lng = input.west <= input.east
        ? { longitude: { gte: input.west, lte: input.east } }
        : { OR: [{ longitude: { gte: input.west } }, { longitude: { lte: input.east } }] };
      const rows = await ctx.db.location.findMany({
        where: { hidden: false, latitude: { gte: input.south, lte: input.north }, ...lng, locationGroup: { hidden: false } },
        select: { locationGroupId: true },
        distinct: ["locationGroupId"],
      });
      return rows.flatMap((r) => (r.locationGroupId ? [r.locationGroupId] : []));
    }),

  /** Undo for deleteLocationGroupForAdmin. */
  restoreLocationGroupsForAdmin: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.locationGroup.updateMany({ where: { id: { in: input.ids } }, data: { hidden: false } });
      return { count };
    }),

  getPinsGrops: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.locationGroup.findMany({
      include: { locations: true },
    });
  }),

  approveLocationGroups: adminProcedure
    // approved: null sends pins back to review (used by undo and "Move back to review").
    .input(z.object({ locationGroupIds: z.array(z.string()).min(1).max(1000), approved: z.boolean().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.locationGroup.updateMany({
        where: { id: { in: input.locationGroupIds } },
        data: { approved: input.approved },
      });
    }),

  getAUserConsumedPin: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.locationConsumer.findMany({
      where: { userId: ctx.session.user.id },
      include: { location: { include: { locationGroup: true } } },
      orderBy: { createdAt: "desc" },
    });
  }),

  getCreatorPinThatConsumed: creatorProcedure.query(async ({ ctx }) => {
    return ctx.db.locationConsumer.findMany({
      where: { location: { locationGroup: { creatorId: ctx.session.user.id } } },
      include: {
        location: {
          select: {
            latitude: true, longitude: true,
            locationGroup: { select: { creator: true } },
          },
        },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getCreatorPinTConsumedByUser: protectedProcedure
    .input(z.object({
      day: z.number().optional(),
      creatorId: z.string().optional(),
      isAdmin: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Admins may look at any brand; a brand only ever sees its own report.
      let creatorId: string;
      if (input?.isAdmin) {
        const admin = await ctx.db.admin.findUnique({ where: { id: ctx.session.user.id } });
        if (!admin) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (!input.creatorId) return;
        creatorId = input.creatorId;
      } else {
        const creator = await ctx.db.creator.findUnique({ where: { id: ctx.session.user.id } });
        if (!creator) throw new TRPCError({ code: "UNAUTHORIZED" });
        creatorId = creator.id;
      }

      const consumedLocations = await ctx.db.locationGroup.findMany({
        where: {
          creatorId,
          hidden: false,
          createdAt: input?.day
            ? { gte: new Date(Date.now() - input.day * 86_400_000) }
            : {},
        },
        select: {
          locations: {
            select: {
              id: true, latitude: true, longitude: true, autoCollect: true,
              _count: { select: { consumers: true } },
              consumers: {
                select: {
                  user: { select: { name: true, id: true, email: true } },
                  claimedAt: true,
                },
              },
            },
          },
          startDate: true, endDate: true, title: true, id: true, creatorId: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const usersPublicKeys = Array.from(new Set(
        consumedLocations.flatMap((group) =>
          group.locations.flatMap((location) =>
            location.consumers.map((consumer) => consumer.user.id)
          )
        )
      ));

      if (usersPublicKeys.length > 0) {
        const usersEmails = await fetchUsersByPublicKeys(usersPublicKeys);
        if (usersEmails.length > 0) {
          consumedLocations.forEach((group) => {
            group.locations.forEach((location) => {
              location.consumers.forEach((consumer) => {
                const user = usersEmails.find((u) => u.publicKey === consumer.user.id);
                consumer.user.email = user?.email ?? consumer.user.email ?? "Unknown";
              });
            });
          });
        }
      }

      return consumedLocations;
    }),

  downloadCreatorPinTConsumedByUser: protectedProcedure
    .input(z.object({ day: z.number().optional(), creatorId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.creatorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Creator ID is required" });
      }
      // The export contains fans' names and emails: owner or admin only.
      await assertOwnerOrAdmin(ctx, input.creatorId);

      const consumedLocations = await ctx.db.locationGroup.findMany({
        where: {
          creatorId: input.creatorId,
          hidden: false,
          createdAt: input.day
            ? { gte: new Date(Date.now() - input.day * 86_400_000) }
            : {},
        },
        select: {
          locations: {
            select: {
              id: true, latitude: true, longitude: true, autoCollect: true,
              _count: { select: { consumers: true } },
              consumers: {
                select: {
                  user: { select: { name: true, id: true, email: true } },
                  claimedAt: true,
                },
              },
            },
          },
          creatorId: true, startDate: true, endDate: true, title: true, id: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (consumedLocations.length > 0) {
        const usersPublicKeys = Array.from(new Set(
          consumedLocations.flatMap((group) =>
            group.locations.flatMap((location) =>
              location.consumers.map((consumer) => consumer.user.id)
            )
          )
        ));
        const usersEmails = await fetchUsersByPublicKeys(usersPublicKeys);
        if (usersEmails.length > 0) {
          consumedLocations.forEach((group) => {
            group.locations.forEach((location) => {
              location.consumers.forEach((consumer) => {
                const user = usersEmails.find((u) => u.publicKey === consumer.user.id);
                consumer.user.email = user?.email ?? consumer.user.email ?? "Unknown";
              });
            });
          });
        }
      }

      return consumedLocations;
    }),

  getCreatorCreatedPin: creatorProcedure.query(async ({ ctx }) => {
    const locatoinGroups = await ctx.db.locationGroup.findMany({
      where: { creatorId: ctx.session.user.id, hidden: false },
      include: { locations: { include: { _count: { select: { consumers: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    return locatoinGroups.flatMap((group) =>
      group.locations.map((location) => ({
        title: group.title,
        description: group.description,
        image: group.image,
        startDate: group.startDate,
        endDate: group.endDate,
        approved: group.approved,
        ...location,
        consumers: location._count.consumers,
        createdAt: group.createdAt,
      } as LocationWithConsumers))
    );
  }),

  getAllConsumedLocation: adminProcedure
    .input(z.object({ day: z.number() }).optional())
    .query(async ({ ctx, input }) => {
      const consumedLocations = await ctx.db.locationConsumer.findMany({
        where: {
          createdAt: input
            ? { gte: new Date(Date.now() - input.day * 86_400_000) }
            : {},
        },
        include: {
          location: {
            select: {
              locationGroup: {
                select: {
                  title: true, creator: { select: { name: true } },
                  description: true, approved: true, id: true,
                },
              },
              latitude: true, longitude: true, id: true,
            },
          },
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return consumedLocations.map((consumer) => ({
        user: { name: consumer.user.name, email: consumer.user.email, id: consumer.user.id },
        location: {
          latitude: consumer.location.latitude,
          longitude: consumer.location.longitude,
          creator: { name: consumer.location.locationGroup?.creator.name },
          title: consumer.location.locationGroup?.title,
        },
        createdAt: consumer.createdAt,
        id: consumer.location.id,
      } as PinLocation));
    }),

  downloadAllConsumedLocation: creatorProcedure
    .input(z.object({ day: z.number() }).optional())
    .mutation(async ({ ctx, input }) => {
      const consumedLocations = await ctx.db.locationConsumer.findMany({
        where: {
          createdAt: input
            ? { gte: new Date(Date.now() - input.day * 86_400_000) }
            : {},
        },
        include: {
          location: {
            select: {
              locationGroup: {
                select: {
                  title: true, creator: { select: { name: true } },
                  description: true, approved: true, id: true,
                },
              },
              latitude: true, longitude: true, id: true,
            },
          },
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return consumedLocations.map((consumer) => ({
        user: { name: consumer.user.name, email: consumer.user.email, id: consumer.user.id },
        location: {
          latitude: consumer.location.latitude,
          longitude: consumer.location.longitude,
          creator: { name: consumer.location.locationGroup?.creator.name },
          title: consumer.location.locationGroup?.title,
        },
        createdAt: consumer.createdAt,
        id: consumer.location.id,
      } as PinLocation));
    }),

  downloadCreatorConsumedLocation: adminProcedure
    .input(z.object({ day: z.number() }).optional())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.locationConsumer.findMany({
        where: {
          createdAt: input
            ? { gte: new Date(Date.now() - input.day * 86_400_000) }
            : {},
        },
        include: {
          location: {
            select: {
              locationGroup: {
                select: { title: true, creator: { select: { name: true } } },
              },
              latitude: true, longitude: true,
            },
          },
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  claimAPin: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const locationConsumer = await ctx.db.locationConsumer.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (locationConsumer.userId !== ctx.session.user.id) {
        throw new Error("You are not authorized");
      }
      return ctx.db.locationConsumer.update({
        data: { claimedAt: new Date() },
        where: { id: input.id },
      });
    }),

  toggleAutoCollect: protectedProcedure
    .input(z.object({ id: z.string(), isAutoCollect: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.db.location.findUnique({ where: { id: input.id }, select: { locationGroup: { select: { creatorId: true } } } });
      if (!location) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
      await assertOwnerOrAdmin(ctx, location.locationGroup?.creatorId);
      await ctx.db.location.update({
        where: { id: input.id },
        data: { autoCollect: input.isAutoCollect },
      });
    }),

  paste: protectedProcedure
    .input(z.object({ id: z.string(), lat: z.number(), long: z.number(), isCut: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.db.location.findUnique({
        where: { id: input.id },
        include: { locationGroup: true },
      });
      if (!location) throw new Error("Location not found");

      await assertOwnerOrAdmin(ctx, location.locationGroup?.creatorId);

      if (input.isCut) {
        await ctx.db.location.update({
          where: { id: input.id },
          data: { latitude: input.lat, longitude: input.long },
        });
      } else {
        if (!location.locationGroup) throw new Error("Location group not found");
        await ctx.db.location.create({
          data: {
            autoCollect: location.autoCollect,
            latitude: input.lat,
            longitude: input.long,
            locationGroupId: location.locationGroup.id,
          },
        });
      }

      return { id: location.id, lat: input.lat, long: input.long };
    }),

  deletePin: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = await ctx.db.admin.findUnique({ where: { id: ctx.session.user.id } });
      const items = await ctx.db.location.update({
        where: {
          id: input.id,
          ...(!isAdmin ? { locationGroup: { creatorId: ctx.session.user.id } } : {}),
        },
        data: { hidden: true },
      });
      return { item: items.id };
    }),

  deletePinForAdmin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const items = await ctx.db.location.update({
        where: { id: input.id },
        data: { hidden: true },
      });
      return { item: items.id };
    }),

  // Soft delete: hidden groups drop off the map and every list.
  deleteLocationGroupForAdmin: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.locationGroup.updateMany({
        where: { id: { in: input.ids } },
        data: { hidden: true },
      });
      return { count };
    }),

  getMyCollectedPins: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).nullish(), cursor: z.string().nullish() }))
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;
      const cursor = input.cursor;

      const consumedLocations = await ctx.db.locationConsumer.findMany({
        where: { userId: ctx.session.user.id, hidden: false },
        include: { location: { include: { locationGroup: true } } },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      });

      let nextCursor: typeof cursor | undefined;
      if (consumedLocations.length > limit) {
        nextCursor = consumedLocations.pop()!.id;
      }

      return { items: consumedLocations, nextCursor };
    }),

  lookupRedeemCode: protectedProcedure
    .input(z.object({
      code: z.string().trim().toUpperCase().length(6),
      // Optional: when given, the code must belong to this pin.
      locationId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const consumer = await ctx.db.locationConsumer.findUnique({
        where: { redeemCode: input.code },
        include: {
          user: { select: { name: true, image: true, email: true } },
          location: {
            include: {
              locationGroup: {
                select: {
                  id: true, title: true, description: true, image: true,
                  link: true, type: true, startDate: true, endDate: true,
                  creatorId: true,
                  creator: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      if (!consumer) return { status: "not_found" as const };
      // Codes are only visible to the brand that owns the pin (or an admin).
      await assertOwnerOrAdmin(ctx, consumer.location.locationGroup?.creatorId);

      if (input.locationId && consumer.locationId !== input.locationId) {
        return {
          status: "wrong_location" as const,
          actualLocation: {
            id: consumer.location.id,
            latitude: consumer.location.latitude,
            longitude: consumer.location.longitude,
            groupTitle: consumer.location.locationGroup?.title,
          },
        };
      }

      if (consumer.isRedeemed) {
        return {
          status: "already_redeemed" as const,
          redeemedAt: consumer.redeemedAt?.toISOString() ?? null,
          claimedAt: consumer.claimedAt?.toISOString() ?? null,
          user: consumer.user,
          location: consumer.location.locationGroup,
          locationData: { latitude: consumer.location.latitude, longitude: consumer.location.longitude },
        };
      }

      return {
        status: "pending" as const,
        claimedAt: consumer.claimedAt?.toISOString() ?? null,
        user: consumer.user,
        location: consumer.location.locationGroup,
        locationData: { latitude: consumer.location.latitude, longitude: consumer.location.longitude },
      };
    }),

  getLocationGroupsWithConsumers: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      search: z.string().optional(),
      type: z.enum(["LANDMARK", "EVENT"]).optional(),
      limit: z.number().min(1).max(50).default(PAGE_SIZE),
    }))
    .query(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const { cursor, search, type, limit } = input;

      const where = {
        creatorId,
        hidden: false,
        type: type ? { equals: type } : { in: [PinType.LANDMARK, PinType.EVENT] },
        ...(search?.trim()
          ? { title: { contains: search.trim(), mode: "insensitive" as const } }
          : {}),
      };

      const total = await ctx.db.locationGroup.count({ where });
      const groups = await ctx.db.locationGroup.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          locations: {
            include: {
              consumers: {
                include: { user: { select: { name: true, image: true, email: true } } },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (groups.length > limit) {
        groups.pop();
        nextCursor = groups[groups.length - 1]?.id;
      }

      const items = groups
        .map((group) => {
          const allConsumers = group.locations.flatMap((l) => l.consumers);
          const latestConsumer = allConsumers.reduce<Date | null>((latest, c) => {
            const d = c.claimedAt ?? c.createdAt;
            return !latest || d > latest ? d : latest;
          }, null);

          return {
            id: group.id, title: group.title, description: group.description,
            image: group.image, link: group.link, type: group.type,
            startDate: group.startDate, endDate: group.endDate,
            limit: group.limit, remaining: group.remaining,
            totalConsumers: allConsumers.length,
            totalRedeemed: allConsumers.filter((c) => c.isRedeemed).length,
            latestConsumerAt: latestConsumer?.toISOString() ?? null,
            locations: group.locations.map((loc) => ({
              id: loc.id, latitude: loc.latitude, longitude: loc.longitude,
              consumers: loc.consumers.map((c) => ({
                id: c.id, redeemCode: c.redeemCode, isRedeemed: c.isRedeemed,
                redeemedAt: c.redeemedAt?.toISOString() ?? null,
                claimedAt: c.claimedAt?.toISOString() ?? null,
                user: c.user,
              })),
            })),
          };
        });

      return { items, nextCursor, total };
    }),

  getRedeemedByCreator: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      search: z.string().optional(),
      type: z.enum(["LANDMARK", "EVENT"]).optional(),
      limit: z.number().min(1).max(50).default(PAGE_SIZE),
    }))
    .query(async ({ ctx, input }) => {
      const creatorId = ctx.session.user.id;
      const { cursor, search, type, limit } = input;
      const searchTrim = search?.trim();

      const where = {
        isRedeemed: true,
        location: {
          locationGroup: {
            creatorId, hidden: false,
            type: type ? { equals: type } : { in: [PinType.LANDMARK, PinType.EVENT] },
          },
        },
        ...(searchTrim ? {
          OR: [
            { redeemCode: { contains: searchTrim, mode: "insensitive" as const } },
            { user: { name: { contains: searchTrim, mode: "insensitive" as const } } },
            { user: { email: { contains: searchTrim, mode: "insensitive" as const } } },
            { location: { locationGroup: { title: { contains: searchTrim, mode: "insensitive" as const } } } },
          ],
        } : {}),
      };

      const total = await ctx.db.locationConsumer.count({ where });
      const redeemed = await ctx.db.locationConsumer.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { redeemedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, image: true, email: true } },
          location: {
            include: {
              locationGroup: {
                select: {
                  id: true, title: true, description: true, image: true,
                  link: true, type: true, startDate: true, endDate: true,
                  creator: { select: { name: true, id: true, profileUrl: true } },
                },
              },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (redeemed.length > limit) nextCursor = redeemed.pop()?.id;

      return {
        items: redeemed.map((c) => ({
          id: c.id, redeemCode: c.redeemCode,
          redeemedAt: c.redeemedAt?.toISOString() ?? null,
          claimedAt: c.claimedAt?.toISOString() ?? null,
          user: c.user, location: c.location.locationGroup,
          locationData: { latitude: c.location.latitude, longitude: c.location.longitude },
        })),
        nextCursor,
        total,
      };
    }),

  redeemByCode: protectedProcedure
    .input(z.object({
      code: z.string().trim().toUpperCase().length(6, "Code must be exactly 6 characters"),
    }))
    .mutation(async ({ ctx, input }) => {
      const consumer = await ctx.db.locationConsumer.findUnique({
        where: { redeemCode: input.code },
        include: {
          user: { select: { name: true, image: true, email: true } },
          location: {
            include: {
              locationGroup: {
                select: {
                  id: true, title: true, description: true, image: true,
                  link: true, type: true, startDate: true, endDate: true,
                  creatorId: true,
                  creator: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      if (!consumer) return { status: "not_found" as const };
      // Only the brand that owns the pin (or an admin) can redeem its codes.
      await assertOwnerOrAdmin(ctx, consumer.location.locationGroup?.creatorId);

      if (consumer.isRedeemed) {
        return {
          status: "already_redeemed" as const,
          redeemedAt: consumer.redeemedAt?.toISOString() ?? null,
          user: consumer.user,
          location: consumer.location.locationGroup,
          locationData: { latitude: consumer.location.latitude, longitude: consumer.location.longitude },
        };
      }

      const updated = await ctx.db.locationConsumer.update({
        where: { id: consumer.id },
        data: { isRedeemed: true, redeemedAt: new Date() },
        include: {
          user: { select: { name: true, image: true, email: true } },
          location: {
            include: {
              locationGroup: {
                select: {
                  id: true, title: true, description: true, image: true,
                  link: true, type: true, startDate: true, endDate: true,
                  creatorId: true,
                  creator: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      return {
        status: "success" as const,
        redeemedAt: updated.redeemedAt?.toISOString() ?? null,
        user: updated.user,
        location: updated.location.locationGroup,
        locationData: { latitude: updated.location.latitude, longitude: updated.location.longitude },
      };
    }),

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const creatorId = ctx.session.user.id;
    const [general, landmark, event, hotspot] = await Promise.all([
      ctx.db.locationGroup.count({ where: { creatorId, hotspotId: null, type: PinType.OTHER } }),
      ctx.db.locationGroup.count({ where: { creatorId, hotspotId: null, type: PinType.LANDMARK } }),
      ctx.db.locationGroup.count({ where: { creatorId, hotspotId: null, type: PinType.EVENT } }),
      ctx.db.hotspot.count({ where: { creatorId, hidden: false } }),
    ]);
    return { general, landmark, event, hotspot };
  }),

  getRedeemSummary: protectedProcedure.query(async ({ ctx }) => {
    const creatorId = ctx.session.user.id;
    const [rewards, redeemed, totalCollected] = await Promise.all([
      ctx.db.locationGroup.count({
        where: { creatorId, hidden: false, type: { in: [PinType.LANDMARK, PinType.EVENT] } },
      }),
      ctx.db.locationConsumer.count({
        where: { location: { locationGroup: { creatorId } }, isRedeemed: true },
      }),
      ctx.db.locationConsumer.count({
        where: { location: { locationGroup: { creatorId, type: { in: [PinType.LANDMARK, PinType.EVENT] } } } },
      }),
    ]);
    const waiting = totalCollected - redeemed;
    return { rewards, redeemed, waiting };
  }),


  getLocationGroups: protectedProcedure
    .input(z.object({
      type: z.enum(["general", "landmark", "event"]),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const pinTypeMap: Record<string, PinType> = {
        general: PinType.OTHER,
        landmark: PinType.LANDMARK,
        event: PinType.EVENT,
      };

      const groups = await ctx.db.locationGroup.findMany({
        where: {
          creatorId: ctx.session.user.id,
          hotspotId: null,
          type: pinTypeMap[input.type],
          ...(input.search ? { title: { contains: input.search, mode: "insensitive" } } : {}),
        },
        include: { locations: { include: { _count: { select: { consumers: true } } } } },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (groups.length > input.limit) nextCursor = groups.pop()!.id;

      return { groups, nextCursor };
    }),

  updateLocationGroup: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      image: z.string().optional(),
      link: z.string().optional(),
      hidden: z.boolean().optional(),
      remaining: z.number().optional(),
      multiPin: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const group = await ctx.db.locationGroup.findUnique({ where: { id } });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      await assertOwnerOrAdmin(ctx, group.creatorId);

      const imageChanged = data.image !== undefined && data.image !== group.image;
      const optimizedImage = imageChanged
        ? await createOptimizedImage(data.image!).catch(() => null)
        : undefined;

      return ctx.db.locationGroup.update({
        where: { id },
        data: { ...data, ...(optimizedImage !== undefined && { optimizedImage }) },
      });
    }),

  deleteLocationGroup: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.locationGroup.findUnique({ where: { id: input.id }, select: { creatorId: true } });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      await assertOwnerOrAdmin(ctx, group.creatorId);
      await ctx.db.locationGroup.update({ where: { id: input.id }, data: { hidden: true } });
      return { success: true };
    }),

  bulkDeleteLocationGroups: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const groups = await ctx.db.locationGroup.findMany({ where: { id: { in: input.ids } }, select: { creatorId: true } });
      if (groups.length !== input.ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Some groups were not found" });
      for (const owner of new Set(groups.map((g) => g.creatorId))) await assertOwnerOrAdmin(ctx, owner);
      await ctx.db.locationGroup.updateMany({
        where: { id: { in: input.ids } },
        data: { hidden: true },
      });
      return { deleted: input.ids.length };
    }),

  deleteLocation: protectedProcedure
    .input(z.object({ locationId: z.string(), locationGroupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.locationGroup.findUnique({ where: { id: input.locationGroupId }, select: { creatorId: true } });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      await assertOwnerOrAdmin(ctx, group.creatorId);
      // Only a pin that really is in this group.
      const { count } = await ctx.db.location.updateMany({ where: { id: input.locationId, locationGroupId: input.locationGroupId }, data: { hidden: true } });
      if (!count) throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found in this group" });
      return { success: true };
    }),

  bulkDeleteLocations: protectedProcedure
    .input(z.object({ locationIds: z.array(z.string()).min(1), locationGroupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.locationGroup.findUnique({ where: { id: input.locationGroupId }, select: { creatorId: true } });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      await assertOwnerOrAdmin(ctx, group.creatorId);
      await ctx.db.location.updateMany({
        where: { id: { in: input.locationIds }, locationGroupId: input.locationGroupId },
        data: { hidden: true },
      });
      return { deleted: input.locationIds.length };
    }),

  getHotspots: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const hotspots = await ctx.db.hotspot.findMany({
        where: {
          creatorId: ctx.session.user.id,
          hidden: false,
          // A hotspot is named after its drops, so search their titles.
          ...(input.search ? { locationGroups: { some: { title: { contains: input.search, mode: "insensitive" } } } } : {}),
        },
        select: {
          id: true,
          creatorId: true,
          isActive: true,
          dropEveryDays: true,
          pinDurationDays: true,
          hotspotStartDate: true,
          hotspotEndDate: true,
          shape: true,
          geoJson: true,
          autoCollect: true,
          multiPin: true,
          createdAt: true,
          updatedAt: true,
          locationGroups: {
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              limit: true,
              remaining: true,
              hidden: true,
              locations: {
                select: {
                  id: true,
                  latitude: true,
                  longitude: true,
                  autoCollect: true,
                  _count: { select: { consumers: true } },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (hotspots.length > input.limit) nextCursor = hotspots.pop()!.id;

      return { hotspots, nextCursor };
    }),

  toggleHotspotActive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hotspot = await manageableHotspot(ctx, input.id);

      try {
        if (hotspot.isActive) {
          return await hotspotClient.pause(hotspot.creatorId, input.id);
        } else {
          return await hotspotClient.resume(hotspot.creatorId, input.id);
        }
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to toggle hotspot",
        });
      }
    }),

  deleteHotspotDropGroup: protectedProcedure
    .input(z.object({ locationGroupId: z.string(), hotspotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await manageableHotspot(ctx, input.hotspotId);
      // Only a drop that really belongs to this hotspot.
      const { count } = await ctx.db.locationGroup.updateMany({
        where: { id: input.locationGroupId, hotspotId: input.hotspotId },
        data: { hidden: true },
      });
      if (!count) throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found in this hotspot" });
      return { success: true };
    }),

  bulkDeleteHotspotDropGroups: protectedProcedure
    .input(z.object({ locationGroupIds: z.array(z.string()).min(1), hotspotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await manageableHotspot(ctx, input.hotspotId);
      await ctx.db.locationGroup.updateMany({
        where: { id: { in: input.locationGroupIds }, hotspotId: input.hotspotId },
        data: { hidden: true },
      });
      return { deleted: input.locationGroupIds.length };
    }),

  /**
   * One printable QR for one pin location.
   *
   * A query, not a mutation, and that is the whole reason this is separate from
   * `generateDropQRs`: the dialog shows the code the instant the pin is opened,
   * then re-renders as the brand flips format — that is a read of something
   * derived, so it caches and re-fetches on its own. The bulk variant is an
   * action with real cost (N codes, seconds of CPU) and belongs behind a click.
   *
   * Only the pin's id goes into the code — see `~/lib/qr-generator` for what the
   * fan's side does with it and why the code is deliberately static.
   */
  generatePinQR: creatorProcedure
    .input(z.object({
      locationId: z.string().min(1),
      format: z.enum(["png", "svg"]).default("svg"),
      size: z.coerce.number().int().min(128).max(2048).default(512),
    }))
    .query(async ({ ctx, input }) => {
      const location = await ctx.db.location.findUnique({
        where: { id: input.locationId },
        select: {
          id: true,
          hidden: true,
          locationGroup: {
            select: {
              id: true,
              title: true,
              creatorId: true,
              multiPin: true,
              hidden: true,
              approved: true,
              startDate: true,
              endDate: true,
              creator: { select: { name: true, profileUrl: true } },
              _count: { select: { locations: { where: { hidden: false } } } },
            },
          },
        },
      });
      if (!location?.locationGroup) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pin not found" });
      }

      const group = location.locationGroup;
      // A hidden drop is off the map, so a sticker still in circulation would
      // land on a 404. Same rule as `list`, which filters `hidden: false`.
      if (group.hidden) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This drop is hidden" });
      }
      // A hidden pin is soft-deleted, so it can't be collected and
      // `generateDropQRs` never returns one. Without this the dialog would happily
      // print a sticker for a pin the bulk path insists doesn't exist.
      if (location.hidden) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This pin is hidden" });
      }
      await assertOwnerOrAdmin(ctx, group.creatorId);

      const image = await renderPinQR(location.id, input.format, { size: input.size });
      const pinIndex = group.multiPin ? await locationOrdinal(ctx.db, location.id) : null;

      // Whether a scan would actually succeed right now. Not a gate — the code
      // is still worth printing ahead of a launch — but the dialog says so,
      // because "no app needed" is a promise about collection and a drop still
      // sitting in review can't keep it. Cheaper here than a second lookup.
      const now = Date.now();
      const collectable = group.approved === true
        && group.startDate.getTime() <= now
        && group.endDate.getTime() >= now;

      return {
        ...image,
        locationId: location.id,
        locationGroupId: group.id,
        title: group.title,
        brandName: group.creator.name ?? "Wadzzo",
        brandImageUrl: group.creator.profileUrl,
        scanUrl: buildPinScanUrl(location.id),
        collectable,
        collectableReason: collectable
          ? null
          : group.approved === null
            ? "This drop is still in review — nobody can collect it yet."
            : group.approved === false
              ? "This drop was rejected."
              : group.startDate.getTime() > now
                ? `This drop hasn't opened yet — it starts ${group.startDate.toLocaleDateString()}.`
                : "This drop has ended.",
        // Only meaningful on a multi-pin drop, where each location is its own
        // code and someone needs to tell the stickers apart.
        isMultiPin: group.multiPin,
        pinNumber: group.multiPin ? pinIndex : null,
        pinCount: group.multiPin ? group._count.locations : null,
      };
    }),

  /**
   * Every live location in a drop, rendered in one format.
   *
   * A brand printing a run of stickers wants one print job, not twenty-two file
   * downloads, so this returns them all and the dialog lays them out as a sheet.
   * Capped, because a hotspot can carry hundreds of locations and the response
   * is one base64 image per pin — past this the brand should be using the
   * hotspot page rather than a single drop.
   */
  generateDropQRs: creatorProcedure
    .input(z.object({
      locationGroupId: z.string().min(1),
      format: z.enum(["png", "svg"]).default("svg"),
      size: z.coerce.number().int().min(128).max(2048).default(512),
    }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.locationGroup.findUnique({
        where: { id: input.locationGroupId },
        select: {
          id: true,
          title: true,
          creatorId: true,
          multiPin: true,
          hidden: true,
          creator: { select: { name: true, profileUrl: true } },
        },
      });
      if (!group || group.hidden) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found" });
      }
      await assertOwnerOrAdmin(ctx, group.creatorId);

      const locations = await ctx.db.location.findMany({
        where: { locationGroupId: group.id, hidden: false },
        select: { id: true },
        orderBy: { id: "asc" },
        take: MAX_QR_CODES_PER_DROP,
      });
      if (locations.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This drop has no active pins" });
      }

      const options = { size: input.size };
      const items = await Promise.all(
        locations.map(async (loc, i) => ({
          ...(await renderPinQR(loc.id, input.format, options)),
          locationId: loc.id,
          scanUrl: buildPinScanUrl(loc.id),
          pinNumber: group.multiPin ? i + 1 : null,
          pinCount: group.multiPin ? locations.length : null,
        })),
      );

      return {
        locationGroupId: group.id,
        title: group.title,
        brandName: group.creator.name ?? "Wadzzo",
        brandImageUrl: group.creator.profileUrl,
        isMultiPin: group.multiPin,
        truncated: locations.length === MAX_QR_CODES_PER_DROP,
        items,
      };
    }),
});