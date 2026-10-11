import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import * as inbox from "~/server/notification-inbox";

const scope = z.enum(["brand", "fan"]);
const ids = z.array(z.number().int()).min(1).max(200);

export const notificationRouter = createTRPCRouter({
  /** The inbox, newest first, repeats collapsed. `scope` brand = brand portal inbox, fan = fan inbox. */
  inbox: protectedProcedure
    .input(z.object({ scope, category: z.string().optional(), unreadOnly: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20), cursor: z.number().int().nullish() }))
    .query(({ ctx, input }) => inbox.listInbox(ctx.db, ctx.session.user.id, input)),
  inboxUnread: protectedProcedure.input(z.object({ scope })).query(({ ctx, input }) => inbox.unreadCount(ctx.db, ctx.session.user.id, input.scope)),
  inboxUnreadByCategory: protectedProcedure.input(z.object({ scope })).query(({ ctx, input }) => inbox.unreadByCategory(ctx.db, ctx.session.user.id, input.scope)),
  markRead: protectedProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => void (await inbox.markRead(ctx.db, ctx.session.user.id, input.ids))),
  markUnread: protectedProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => void (await inbox.markUnread(ctx.db, ctx.session.user.id, input.ids))),
  markAllRead: protectedProcedure
    .input(z.object({ scope, category: z.string().optional() }))
    .mutation(async ({ ctx, input }) => void (await inbox.markAllRead(ctx.db, ctx.session.user.id, input.scope, input.category))),
  remove: protectedProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => void (await inbox.remove(ctx.db, ctx.session.user.id, input.ids))),
  clearRead: protectedProcedure.input(z.object({ scope })).mutation(async ({ ctx, input }) => void (await inbox.clearRead(ctx.db, ctx.session.user.id, input.scope))),

  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),

  getCreatorNotifications: protectedProcedure
    .input(
      z.object({
        limit: z.number(),
        // cursor is a reference to the last item in the previous batch
        // it's used to fetch the next batch
        cursor: z.number().nullish(),
        skip: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { limit, skip, cursor } = input;

      const items = await ctx.db.notification.findMany({
        take: limit + 1,
        skip: skip,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          AND: [
            {
              notifierId: ctx.session.user.id,
            },
            { isCreator: true },
          ],
        },
        include: {
          notificationObject: {
            select: {
              entityType: true,
              entityId: true,
              createdAt: true,

              actor: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); // return the last item from the array
        nextCursor = nextItem?.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  getUserNotification: protectedProcedure
    .input(
      z.object({
        limit: z.number(),
        cursor: z.number().nullish(),
        skip: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { limit, skip, cursor } = input;

      const notifications = await ctx.db.notification.findMany({
        take: limit + 1,
        skip: skip,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          AND: [
            {
              notifierId: ctx.session.user.id,
            },
            { isCreator: false },
          ],
        },
        include: {
          notificationObject: {
            select: {
              entityType: true,
              entityId: true,
              createdAt: true,

              actor: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Handle cursor pagination logic
      let nextCursor: typeof cursor | undefined = undefined;
      if (notifications.length > limit) {
        const nextItem = notifications.pop(); // Return the last item from the array
        nextCursor = nextItem?.id;
      }

      return {
        notifications,
        nextCursor,
      };
    }),

  getUnseenNotificationCount: protectedProcedure.query(async ({ input, ctx }) => {
    const count = await ctx.db.notification.count({
      where: {
        AND: [
          {
            notifierId: ctx.session.user.id,
          },
          { seen: null },

        ],
      },
    });

    return count ?? 0;
  }),

  updateNotification: protectedProcedure
    .mutation(async ({ input, ctx }) => {
      const updatedNotifications = await ctx.db.notification.updateMany({
        where: {
          AND: [
            {
              notifierId: ctx.session.user.id,
            },

          ],
        },
        data: {
          seen: new Date(),
        },
      });

      return updatedNotifications;
    }),


});
