import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

import { createTransport, type Transporter } from "nodemailer";

export const userRouter = createTRPCRouter({
  // Admins only: this lists every user's email.
  getUsers: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const q = input?.search?.trim();
      const limit = input?.limit ?? 30;
      const where = q
        ? {
            OR: [
              { id: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};
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
            creator: { select: { id: true, name: true, approved: true } },
            Admin: { select: { id: true }, take: 1 },
            _count: { select: { LocationConsumer: true } },
          },
        }),
      ]);
      const nextCursor = users.length > limit ? users.pop()!.id : undefined;
      return { users, nextCursor, total };
    }),
  // One user for the admin detail page: profile, roles, counts and their most
  // recent collections / redemptions / purchases.
  getUser: adminProcedure.input(z.string()).query(async ({ ctx, input }) => {
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
        Admin: { select: { id: true }, take: 1 },
        creator: { select: { id: true, name: true, approved: true, profileUrl: true } },
        _count: { select: { LocationConsumer: true, RedeemConsumer: true, assets: true, followings: true, BountySubmission: true } },
        LocationConsumer: {
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
        RedeemConsumer: { orderBy: { redeemedAt: "desc" }, take: 50, select: { id: true, code: true, redeemedAt: true } },
        assets: {
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
  deleteUser: adminProcedure.input(z.string()).mutation(({ ctx, input }) => {
    return ctx.db.user.delete({ where: { id: input } });
  }),

  deleteAPost: adminProcedure.input(z.number()).mutation(({ ctx, input }) => {
    return ctx.db.post.delete({ where: { id: input } });
  }),
  sendEmail: publicProcedure
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
      to: "support@wadzzo.com",
      subject: `Support Request: ${name}`,
      text: message,
    };

    const result = transporter.sendMail(mailOptions);

  } catch (error) {
    console.error("Error sending email: ", error);
    throw new Error("Failed to send email");
  }
};
