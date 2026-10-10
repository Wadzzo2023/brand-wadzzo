import { afterEach, describe, expect, it, vi } from "vitest";

// The task server's gate (package/express-wadzzo), with a quiet logger.
vi.mock("../package/express-wadzzo/src/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("~/env", () => ({ env: {} }));

const SECRET = "s".repeat(40);
/** What the brand app sends: a key derived from NEXTAUTH_SECRET. */
const { taskServerKey } = await import("~/lib/express/server-url");
const KEY = taskServerKey(SECRET);

/** Loads the middleware with these env vars, then runs one request through it. */
async function gate(env: { secret?: string; prod?: boolean }, header?: string) {
  vi.resetModules();
  vi.stubEnv("NEXTAUTH_SECRET", env.secret ?? "");
  vi.stubEnv("NODE_ENV", env.prod ? "production" : "development");
  if (!env.secret) delete process.env.NEXTAUTH_SECRET;
  const { requireTaskSecret } = await import("../package/express-wadzzo/src/middleware/auth");

  const req = { headers: header === undefined ? {} : { "x-task-secret": header }, method: "POST", originalUrl: "/jobs/enqueue", ip: "1.2.3.4" };
  const res: { status: (code: number) => unknown; json: () => unknown } = { status: vi.fn(() => res), json: vi.fn(() => res) };
  const next = vi.fn();
  requireTaskSecret(req as never, res as never, next);
  return { passed: next.mock.calls.length === 1, status: vi.mocked(res.status).mock.calls[0]?.[0] };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("task server secret gate", () => {
  it("lets the brand app through with the key derived from the shared NEXTAUTH_SECRET", async () => {
    expect(await gate({ secret: SECRET, prod: true }, KEY)).toEqual({ passed: true, status: undefined });
  });

  it("never accepts the session secret itself", async () => {
    expect(await gate({ secret: SECRET, prod: true }, SECRET)).toEqual({ passed: false, status: 401 });
  });

  it("rejects a missing or wrong secret", async () => {
    expect(await gate({ secret: SECRET, prod: true })).toEqual({ passed: false, status: 401 });
    expect(await gate({ secret: SECRET, prod: true }, "wrong")).toEqual({ passed: false, status: 401 });
    expect(await gate({ secret: SECRET, prod: true }, taskServerKey("another secret"))).toEqual({ passed: false, status: 401 });
  });

  it("refuses everything in production when no secret is configured", async () => {
    expect(await gate({ prod: true }, "anything")).toEqual({ passed: false, status: 503 });
  });

  it("stays open in local development when no secret is configured", async () => {
    expect(await gate({ prod: false })).toEqual({ passed: true, status: undefined });
  });
});
