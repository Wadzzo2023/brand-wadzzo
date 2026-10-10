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

/** Headers for every task-server call: JSON, plus the shared secret it requires. */
export function taskServerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.TASK_SERVER_SECRET) headers["X-Task-Secret"] = env.TASK_SERVER_SECRET;
  return headers;
}
