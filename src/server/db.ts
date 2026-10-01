import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env } from "~/env";

/**
 * Prisma 7 connects through a driver adapter (node-postgres) instead of the
 * old Rust query engine's own connection. One client per process; in dev it
 * survives hot reloads on globalThis.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  return new PrismaClient({
    // Neon databases sleep when idle; give a cold start time to wake.
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 30_000 }),
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
