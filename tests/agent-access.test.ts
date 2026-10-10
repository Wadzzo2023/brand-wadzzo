import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real agent router and access rules, run against a stand-in database and task server.
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { PLATFORM_SLUG: "wadzzo" } }));

const taskClient = { enqueue: vi.fn(), poll: vi.fn() };
vi.mock("~/lib/express/taskClient-sdk", () => ({ taskClient }));
const executeAction = vi.fn();
vi.mock("~/server/agent/actions", async (orig) => ({ ...(await orig<object>()), executeAction }));
const withAiQuota = vi.fn(async (_userId: string, _kind: string, work: () => Promise<unknown>) => work());
vi.mock("~/server/ai/openai", () => ({ withAiQuota }));

const WADZZO = { id: "wadzzo", name: "Wadzzo", isRoot: true };
const CLINTON = { id: "clintoncounty", name: "Clinton County", isRoot: false };
type Site = typeof WADZZO;

/** Brands in the stand-in database, by id. */
const BRANDS: Record<string, { platformId: string; aprovalSend: boolean; approved: boolean | null }> = {
  CLINTON_BRAND: { platformId: "clintoncounty", aprovalSend: true, approved: true },
  OTHER_CLINTON_BRAND: { platformId: "clintoncounty", aprovalSend: true, approved: true },
  WADZZO_BRAND: { platformId: "wadzzo", aprovalSend: true, approved: true },
  PENDING_BRAND: { platformId: "clintoncounty", aprovalSend: true, approved: null },
};

/** Conversations in the stand-in database: id → owner brand and person. */
const CONVERSATIONS: Record<string, { creatorId: string; userId: string }> = {
  conv_own: { creatorId: "CLINTON_BRAND", userId: "CLINTON_BRAND" },
  conv_admin: { creatorId: "CLINTON_BRAND", userId: "CLINTON_ADMIN" },
};

const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => (typeof v === "object" && v !== null ? true : row[k] === v));

/** `callerId` visiting `site`, an admin of `adminOf` (null = not an admin). */
function ctxFor(site: Site, callerId: string, adminOf: Site | null = null) {
  const db = {
    creator: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (BRANDS[where.id] ? { ...BRANDS[where.id], name: where.id, profileUrl: null } : null)),
    },
    admin: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === callerId && adminOf ? { id: callerId, platformId: adminOf.id, platform: { isRoot: adminOf.isRoot } } : null,
      ),
    },
    agentConversation: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; creatorId: string; userId: string } }) => {
        const c = CONVERSATIONS[where.id];
        return c?.creatorId === where.creatorId && c.userId === where.userId ? { id: where.id, title: "t", platformId: "clintoncounty" } : null;
      }),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, string> }) => ({ id: "conv_new", title: data.title, platformId: data.platformId })),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    agentMessage: {
      create: vi.fn(async ({ data }: { data: { role: string; text: string } }) => ({ id: "msg_new", role: data.role, text: data.text, blocks: [], steps: [], createdAt: new Date() })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    agentAction: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; creatorId: string; conversation: { userId: string } } }) =>
        where.id === "act_1" && where.creatorId === "CLINTON_BRAND" && where.conversation.userId === "CLINTON_BRAND" ? { id: "act_1", payload: { type: "hide_pins", pins: [] } } : null,
      ),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({ count: matches({ id: "act_1", status: "pending", creatorId: "CLINTON_BRAND" }, where) ? 1 : 0 })),
      update: vi.fn(async () => ({})),
    },
    locationGroupJob: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, creatorId: "CLINTON_BRAND", status: "completed", total: 1, completed: 1, log: [], error: null })),
    },
  };
  return { session: { user: { id: callerId } }, platform: site, db };
}

type Ctx = ReturnType<typeof ctxFor>;
type Caller = Record<string, (input: unknown) => Promise<Record<string, unknown>>>;
let caller: (ctx: Ctx) => Caller;

beforeAll(async () => {
  const { createCallerFactory } = await import("~/server/api/trpc");
  const { agentRouter } = await import("~/server/api/routers/agent");
  const factory = createCallerFactory(agentRouter);
  caller = (ctx) => factory(ctx as never) as unknown as Caller;
});

beforeEach(() => {
  taskClient.enqueue.mockReset().mockResolvedValue({ jobId: "job-1" });
  taskClient.poll.mockReset().mockResolvedValue({ jobId: "job-1", creatorId: "CLINTON_BRAND", status: "processing", result: null, progress: 10, steps: [{ id: "s", label: "Searching parks in Clinton County…", status: "running" }] });
  executeAction.mockReset().mockResolvedValue({ message: "Deleted 0 pins." });
  withAiQuota.mockClear();
});

const ask = { text: "find parks" };
const forbidden = { code: "FORBIDDEN" };
const notFound = { code: "NOT_FOUND" };

describe("a brand", () => {
  const brand = () => ctxFor(CLINTON, "CLINTON_BRAND");

  it("starts a conversation and runs the agent for itself only", async () => {
    const res = await caller(brand()).send!(ask);
    expect(res).toMatchObject({ conversationId: "conv_new", jobId: "job-1" });
    expect(taskClient.enqueue).toHaveBeenCalledWith("agent_run", "CLINTON_BRAND", expect.objectContaining({ creatorId: "CLINTON_BRAND", platformId: "clintoncounty", conversationId: "conv_new" }), 1);
  });

  it("uses one of its daily AI generations per question, and stops when they're used up", async () => {
    await caller(brand()).send!(ask);
    expect(withAiQuota).toHaveBeenCalledWith("CLINTON_BRAND", "text", expect.any(Function));

    const ctx = brand();
    withAiQuota.mockRejectedValueOnce(Object.assign(new Error("You've used today's 50 AI generations."), { code: "TOO_MANY_REQUESTS" }));
    await expect(caller(ctx).send!(ask)).rejects.toThrow(/used today's/);
    expect(ctx.db.agentConversation.create).not.toHaveBeenCalled();
    expect(taskClient.enqueue).toHaveBeenCalledTimes(1);
  });

  it("cannot run the agent for another brand", async () => {
    await expect(caller(brand()).send!({ ...ask, creatorId: "OTHER_CLINTON_BRAND" })).rejects.toMatchObject(forbidden);
    expect(taskClient.enqueue).not.toHaveBeenCalled();
  });

  it("cannot run the agent until approved, or on another platform's site", async () => {
    await expect(caller(ctxFor(CLINTON, "PENDING_BRAND")).send!(ask)).rejects.toMatchObject(forbidden);
    await expect(caller(ctxFor(WADZZO, "CLINTON_BRAND")).send!(ask)).rejects.toMatchObject(forbidden);
  });

  it("can't continue a conversation that isn't its own", async () => {
    await expect(caller(brand()).send!({ ...ask, conversationId: "conv_admin" })).rejects.toMatchObject(notFound);
    await expect(caller(brand()).conversation!({ id: "conv_admin" })).rejects.toMatchObject(notFound);
    expect(taskClient.enqueue).not.toHaveBeenCalled();
  });

  it("sees live progress of its own run but not another brand's", async () => {
    await expect(caller(brand()).poll!({ jobId: "job-1" })).resolves.toMatchObject({ status: "processing", steps: [{ label: "Searching parks in Clinton County…" }] });

    taskClient.poll.mockResolvedValue({ jobId: "job-2", creatorId: "OTHER_CLINTON_BRAND", status: "processing", result: null, progress: 0, steps: [{ id: "x", label: "secret" }] });
    await expect(caller(brand()).poll!({ jobId: "job-2" })).rejects.toMatchObject(notFound);
  });

  it("gets NOT_FOUND for a job id that doesn't exist", async () => {
    taskClient.poll.mockRejectedValue(new Error("Job not found"));
    await expect(caller(brand()).poll!({ jobId: "nope" })).rejects.toMatchObject(notFound);
  });

  it("confirms its own proposal once, and nobody else's", async () => {
    await expect(caller(brand()).confirm!({ actionId: "act_1" })).resolves.toMatchObject({ status: "done" });
    expect(executeAction).toHaveBeenCalledWith(expect.anything(), { creatorId: "CLINTON_BRAND", platformId: "clintoncounty" }, expect.anything(), undefined);

    await expect(caller(ctxFor(CLINTON, "OTHER_CLINTON_BRAND")).confirm!({ actionId: "act_1" })).rejects.toMatchObject(notFound);
  });

  it("can't confirm a proposal that was already handled", async () => {
    const ctx = brand();
    ctx.db.agentAction.updateMany.mockResolvedValue({ count: 0 });
    await expect(caller(ctx).confirm!({ actionId: "act_1" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("cannot read another brand's pin-creation job", async () => {
    await expect(caller(ctxFor(CLINTON, "OTHER_CLINTON_BRAND")).pinJob!({ jobId: "lgj-1" })).rejects.toMatchObject(notFound);
  });
});

describe("an admin", () => {
  it("acts for a brand of their own platform, in their own conversations", async () => {
    const ctx = ctxFor(CLINTON, "CLINTON_ADMIN", CLINTON);
    await caller(ctx).send!({ ...ask, creatorId: "CLINTON_BRAND", conversationId: "conv_admin" });
    expect(taskClient.enqueue).toHaveBeenCalledWith("agent_run", "CLINTON_BRAND", expect.objectContaining({ conversationId: "conv_admin" }), 1);
    // …but not in the brand's own chats.
    await expect(caller(ctx).send!({ ...ask, creatorId: "CLINTON_BRAND", conversationId: "conv_own" })).rejects.toMatchObject(notFound);
  });

  it("from a partner platform cannot act for a brand on another platform", async () => {
    await expect(caller(ctxFor(CLINTON, "CLINTON_ADMIN", CLINTON)).send!({ ...ask, creatorId: "WADZZO_BRAND" })).rejects.toMatchObject(notFound);
    expect(taskClient.enqueue).not.toHaveBeenCalled();
  });

  it("from Wadzzo can act for any platform's brand", async () => {
    await caller(ctxFor(WADZZO, "WADZZO_ADMIN", WADZZO)).send!({ ...ask, creatorId: "CLINTON_BRAND" });
    expect(taskClient.enqueue).toHaveBeenCalledWith("agent_run", "CLINTON_BRAND", expect.objectContaining({ platformId: "clintoncounty" }), 1);
  });
});

describe("a signed-in user who is neither the brand nor an admin", () => {
  it("cannot act for a brand or watch its runs", async () => {
    await expect(caller(ctxFor(CLINTON, "FAN")).send!({ ...ask, creatorId: "CLINTON_BRAND" })).rejects.toMatchObject(forbidden);
    await expect(caller(ctxFor(CLINTON, "FAN")).poll!({ jobId: "job-1" })).rejects.toMatchObject(notFound);
    await expect(caller(ctxFor(CLINTON, "FAN")).overview!({ creatorId: "CLINTON_BRAND" })).rejects.toMatchObject(forbidden);
  });
});
