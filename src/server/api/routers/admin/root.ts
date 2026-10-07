import { createTRPCRouter } from "~/server/api/trpc";
import { auditRouter } from "./audit";
import { creatorRouter } from "./creator";
import { muralsAdminRouter } from "./murals";
import { platformsRouter } from "./platforms";
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
  platforms: platformsRouter,
  audit: auditRouter,
});

// export type definition of API
