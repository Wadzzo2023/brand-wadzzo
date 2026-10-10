import { createHmac } from "crypto";

import { env } from "~/env";

const PRODUCTION_URL = "https://portal.actn.xyz/wadzzo/api/";

/**
 * Base URL of the Express task server. Production falls back to the live
 * server; everywhere else it must be set, so local testing never writes to
 * production by accident (run package/express-wadzzo against the dev DB).
 */
export function taskServerUrl() {
  const url = env.EXPRESS_SERVER_URL ?? (process.env.NODE_ENV === "production" ? PRODUCTION_URL : undefined);
  if (!url)
    throw new Error(
      "The task server isn't configured for local dev. Run package/express-wadzzo on the dev database and set EXPRESS_SERVER_URL (e.g. http://localhost:4000).",
    );
  return url.replace(/\/$/, "");
}

/**
 * The task server's key, derived from NEXTAUTH_SECRET (both servers share it) so
 * the session secret itself is never sent. Must match the task server's
 * middleware/auth.ts.
 */
export function taskServerKey(secret: string) {
  return createHmac("sha256", secret).update("wadzzo-task-server").digest("hex");
}

/** Headers for every task-server call: JSON, plus the key it requires. */
export function taskServerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.NEXTAUTH_SECRET) headers["X-Task-Secret"] = taskServerKey(env.NEXTAUTH_SECRET);
  return headers;
}
