import { createTRPCRouter } from "~/server/api/trpc";
import { pinRouter } from "./pin";
import { reportRouter } from "./report";
import { trxRouter } from "./trx";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const mapsRouter = createTRPCRouter({
  pin: pinRouter,
  report: reportRouter,
  trx: trxRouter,
});

// export type definition of API
