import { TRPCError } from "@trpc/server";

type AuthCtx = { db: typeof import("~/server/db").db; session: { user: { id: string } } };

export async function isAdmin(ctx: AuthCtx) {
  const admin = await ctx.db.admin.findUnique({ where: { id: ctx.session.user.id }, select: { id: true } });
  return Boolean(admin);
}

/** Passes when the caller is one of `allowed` (e.g. the owner) or an admin. */
export async function assertOwnerOrAdmin(ctx: AuthCtx, ...allowed: (string | null | undefined)[]) {
  if (allowed.some((id) => id && id === ctx.session.user.id)) return;
  if (!(await isAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or an admin can do this" });
}
