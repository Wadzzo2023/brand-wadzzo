import { TRPCError } from "@trpc/server";

import type { Db } from "~/server/db";
import { canAdminPlatform, inPlatformScope, type ScopePlatform } from "~/server/platform-scope";

type AuthCtx = {
  db: Db;
  session: { user: { id: string } };
  platform: ScopePlatform;
};

/** The caller's admin row, if they may administer this deployment's platform. */
export async function getPlatformAdmin(ctx: AuthCtx) {
  const admin = await ctx.db.admin.findUnique({
    where: { id: ctx.session.user.id },
    select: { id: true, platformId: true, platform: { select: { isRoot: true } } },
  });
  return admin && canAdminPlatform(admin, ctx.platform) ? admin : null;
}

export async function isAdmin(ctx: AuthCtx) {
  return Boolean(await getPlatformAdmin(ctx));
}

/**
 * Whether ids belonging to the affected row are within this deployment's platform:
 * any of them is a brand of this platform, or (no brand among them) a user who
 * joined it. Always true on the root platform.
 */
async function ownersInPlatform(ctx: AuthCtx, ids: string[]) {
  if (ctx.platform.isRoot) return true;
  if (ids.length === 0) return false;
  const creators = await ctx.db.creator.findMany({ where: { id: { in: ids } }, select: { platformId: true } });
  if (creators.length > 0) return creators.some((c) => c.platformId === ctx.platform.id);
  const member = await ctx.db.userPlatform.findFirst({
    where: { userId: { in: ids }, platformId: ctx.platform.id },
    select: { userId: true },
  });
  return Boolean(member);
}

/**
 * Passes when the caller is one of `allowed` (e.g. the owner) or an admin of
 * this platform whose scope covers the owners.
 */
export async function assertOwnerOrAdmin(ctx: AuthCtx, ...allowed: (string | null | undefined)[]) {
  if (allowed.some((id) => id && id === ctx.session.user.id)) return;
  const owners = allowed.filter((id): id is string => Boolean(id));
  if (!(await isAdmin(ctx)) || !(await ownersInPlatform(ctx, owners))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or an admin can do this" });
  }
}

/** The brand's platform, after checking this deployment may manage it (NOT_FOUND otherwise). */
export async function assertCreatorInScope(ctx: AuthCtx, creatorId: string) {
  const creator = await ctx.db.creator.findUnique({ where: { id: creatorId }, select: { platformId: true } });
  if (!creator || !inPlatformScope(ctx, creator.platformId)) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
  return creator.platformId;
}

/** Checks the user joined this deployment's platform (always true on the root platform). */
export async function assertUserInScope(ctx: AuthCtx, userId: string) {
  if (ctx.platform.isRoot) return;
  const member = await ctx.db.userPlatform.findUnique({
    where: { userId_platformId: { userId, platformId: ctx.platform.id } },
    select: { userId: true },
  });
  if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
}
