import { postRouter } from "~/server/api/routers/fan/post";
import { createTRPCRouter } from "~/server/api/trpc";
import { creatorRouter } from "./creator";
import { membershipRouter } from "./membership";
import { shopRouter } from "./asset";
import { itemRouter } from "./item";
import { trxRouter } from "./trx";
import { notificationRouter } from "./notification";
import { userRouter } from "./user";
import { storageRouter } from "./storage";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const fanRouter = createTRPCRouter({
  post: postRouter,
  creator: creatorRouter,
  member: membershipRouter,
  asset: shopRouter,
  item: itemRouter,
  trx: trxRouter,
  notification: notificationRouter,
  user: userRouter,
  storage: storageRouter,
});
export type FanRouter = typeof fanRouter;

// export type definition of API
