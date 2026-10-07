import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertUserInScope } from "~/server/api/access";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  superAdminProcedure,
} from "~/server/api/trpc";
import { logAudit } from "~/server/audit";
import { inPlatformScope, platformScope, relationScope } from "~/server/platform";

import { createTransport, type Transporter } from "nodemailer";

export const userRouter = createTRPCRouter({
  // Admins only: this lists every user's email. Users who joined this platform;
  // on Wadzzo, everyone (or the members of `platformId`).
  getUsers: adminProcedure
    .input(
      z
        .object({
          platformId: z.string().optional(),
          search: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const q = input?.search?.trim();
      const limit = input?.limit ?? 30;
      const scope = platformScope(ctx, input?.platformId);
      const where = {
        ...(q
          ? {
              OR: [
                { id: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(scope.platformId ? { platforms: { some: { platformId: scope.platformId } } } : {}),
      };
      const [total, users] = await Promise.all([
        ctx.db.user.count({ where }),
        ctx.db.user.findMany({
          where,
          orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            joinedAt: true,
            firstSignUpMethod: true,
            signupPlatform: { select: { id: true, name: true } },
            creator: { select: { id: true, name: true, approved: true } },
            Admin: { select: { id: true }, take: 1 },
            // collections of this platform's pins (all platforms on Wadzzo)
            _count: { select: { LocationConsumer: { where: { location: { locationGroup: relationScope(ctx, input?.platformId) } } } } },
          },
        }),
      ]);
      const nextCursor = users.length > limit ? users.pop()!.id : undefined;
      return { users, nextCursor, total };
    }),
  // One user for the admin detail page: profile, roles, counts and their most
  // recent collections / redemptions / purchases.
  // Activity is limited to this platform (every platform on Wadzzo).
  getUser: adminProcedure.input(z.string()).query(async ({ ctx, input }) => {
    await assertUserInScope(ctx, input);
    const scope = platformScope(ctx);
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: input },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
        joinedAt: true,
        firstSignUpMethod: true,
        fromAppSignup: true,
        signupPlatform: { select: { id: true, name: true } },
        // every platform they joined, first visit first
        platforms: {
          where: scope,
          orderBy: { firstSeenAt: "asc" },
          select: { platformId: true, firstSeenAt: true, lastSeenAt: true, signUpMethod: true, platform: { select: { name: true } } },
        },
        Admin: { select: { id: true }, take: 1 },
        creator: { select: { id: true, name: true, approved: true, profileUrl: true } },
        _count: {
          select: {
            LocationConsumer: { where: { location: { locationGroup: relationScope(ctx) } } },
            RedeemConsumer: { where: { redeemCode: scope } },
            assets: { where: { asset: scope } },
            followings: { where: { creator: scope } },
            BountySubmission: { where: { bounty: scope } },
          },
        },
        LocationConsumer: {
          where: { location: { locationGroup: relationScope(ctx) } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            isRedeemed: true,
            redeemedAt: true,
            claimedAt: true,
            createdAt: true,
            location: {
              select: {
                locationGroup: {
                  select: { id: true, title: true, image: true, type: true, creator: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
        RedeemConsumer: { where: { redeemCode: scope }, orderBy: { redeemedAt: "desc" }, take: 50, select: { id: true, code: true, redeemedAt: true } },
        assets: {
          where: { asset: scope },
          orderBy: { buyAt: "desc" },
          take: 50,
          select: { id: true, buyAt: true, asset: { select: { id: true, name: true, code: true, issuer: true, thumbnail: true } } },
        },
      },
    });
    return user;
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
  // Accounts are shared by every platform, so only Wadzzo admins can delete one.
  deleteUser: superAdminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const deleted = await ctx.db.user.delete({ where: { id: input } });
    await logAudit(ctx, { action: "user.delete", entityType: "User", entityId: input });
    return deleted;
  }),

  deleteAPost: adminProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const post = await ctx.db.post.findUnique({ where: { id: input }, select: { platformId: true } });
    if (!post || !inPlatformScope(ctx, post.platformId)) throw new TRPCError({ code: "NOT_FOUND" });
    const deleted = await ctx.db.post.delete({ where: { id: input } });
    await logAudit(ctx, { action: "post.delete", entityType: "Post", entityId: input, targetPlatformId: post.platformId });
    return deleted;
  }),
  sendEmail: adminProcedure
    .input(
      z.object({
        userEmail: z.string(),
        name: z.string(),
        message: z.string(),
      }),
    )
    .mutation(({ input }) => {
      return sendEmail(input.userEmail, input.name, input.message);
    }),

  hasStorage: protectedProcedure.query(async ({ ctx }) => {
    const creator = await ctx.db.creator.findUnique({
      where: {
        id: ctx.session.user.id,
      },
    });

    return { storage: creator?.storagePub };
  }),
});

const transporter: Transporter = createTransport({
  service: "Gmail",
  auth: {
    user: process.env.NEXT_PUBLIC_NODEMAILER_USER,
    pass: process.env.NEXT_PUBLIC_NODEMAILER_PASS,
  },
});

const sendEmail = async (
  userEmail: string,
  name: string,
  message: string,
): Promise<void> => {
  try {
    const mailOptions = {
      from: userEmail,
      to: process.env.SUPPORT_EMAIL ?? "support@wadzzo.com",
      subject: `Support Request: ${name}`,
      text: message,
    };

    const result = transporter.sendMail(mailOptions);

  } catch (error) {
    console.error("Error sending email: ", error);
    throw new Error("Failed to send email");
  }
};
