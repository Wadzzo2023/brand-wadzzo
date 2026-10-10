import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { resolveActingBrand } from "~/server/api/access";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { logAudit } from "~/server/audit";
import { getHomeAreaLayers, HomeAreaInput, readHomeArea } from "~/server/home-area";

const BrandInput = z.object({ creatorId: z.string().optional() });

/**
 * Home areas (see src/server/home-area.ts). A brand (or an admin acting for it)
 * sets the brand's own; a platform's admins set their platform's default, and
 * Wadzzo admins can set any platform's.
 */
export const homeAreaRouter = createTRPCRouter({
  brand: protectedProcedure.input(BrandInput).query(async ({ ctx, input }) => {
    const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
    const layers = await getHomeAreaLayers(ctx.db, creatorId);
    if (!layers) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
    return layers;
  }),

  /** Saves the brand's own area, or clears it (back to the platform default) with `area: null`. */
  saveBrand: protectedProcedure.input(BrandInput.extend({ area: HomeAreaInput.nullable() })).mutation(async ({ ctx, input }) => {
    const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
    await ctx.db.creator.update({
      where: { id: creatorId },
      data: input.area ? { homeArea: input.area.feature, homeAreaName: input.area.name } : { homeArea: Prisma.DbNull, homeAreaName: null },
    });
    return { ok: true };
  }),

  /** A platform's default area: this deployment's platform, or (Wadzzo admins) any. */
  platform: adminProcedure.input(z.object({ platformId: z.string().optional() })).query(async ({ ctx, input }) => {
    const platformId = platformFor(ctx, input.platformId);
    const p = await ctx.db.platform.findUnique({ where: { id: platformId }, select: { id: true, name: true, homeArea: true, homeAreaName: true } });
    if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Platform not found" });
    return { id: p.id, name: p.name, area: readHomeArea(p.homeArea, p.homeAreaName, p.name) };
  }),

  savePlatform: adminProcedure.input(z.object({ platformId: z.string().optional(), area: HomeAreaInput.nullable() })).mutation(async ({ ctx, input }) => {
    const platformId = platformFor(ctx, input.platformId);
    await ctx.db.platform.update({
      where: { id: platformId },
      data: input.area ? { homeArea: input.area.feature, homeAreaName: input.area.name } : { homeArea: Prisma.DbNull, homeAreaName: null },
    });
    await logAudit(ctx, {
      action: "platform.homeArea",
      entityType: "Platform",
      entityId: platformId,
      targetPlatformId: platformId,
      meta: { name: input.area?.name ?? null, cleared: !input.area },
    });
    return { ok: true };
  }),
});

/** A partner admin may only change their own platform; Wadzzo admins any. */
function platformFor(ctx: { platform: { id: string }; isSuperAdmin: boolean }, requested?: string) {
  const platformId = requested ?? ctx.platform.id;
  if (platformId !== ctx.platform.id && !ctx.isSuperAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "You can only set your own platform's home area" });
  return platformId;
}
