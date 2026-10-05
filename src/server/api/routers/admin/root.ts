import { createTRPCRouter } from "~/server/api/trpc";
import { creatorRouter } from "./creator";
import { muralsAdminRouter } from "./murals";
import { userRouter } from "./users";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const adminRouter = createTRPCRouter({
  creator: creatorRouter,
  user: userRouter,
  murals: muralsAdminRouter,
});

// export type definition of API
