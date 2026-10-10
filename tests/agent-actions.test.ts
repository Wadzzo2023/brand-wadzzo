import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Actions from "~/server/agent/actions";

// Carrying out confirmed proposals (src/server/agent/actions.ts) against a stand-in database.
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { PLATFORM_SLUG: "wadzzo" } }));
vi.mock("~/server/image-optimizer", () => ({ createOptimizedImage: vi.fn(async () => "optimized") }));
const taskClient = { enqueue: vi.fn(async () => ({ jobId: "task-1" })) };
vi.mock("~/lib/express/taskClient-sdk", () => ({ taskClient }));
const hotspotClient = { pause: vi.fn(), resume: vi.fn(), delete: vi.fn(), update: vi.fn(), create: vi.fn(async () => ({ hotspotId: "h_new" })) };
vi.mock("~/lib/express/hotspotClient-sdk", () => ({ hotspotClient }));

type Exec = typeof Actions.executeAction;
let executeAction: Exec;
beforeAll(async () => {
  ({ executeAction } = await import("~/server/agent/actions"));
});

const BRAND = { creatorId: "BRAND_A", platformId: "clintoncounty" };

function makeDb() {
  let self: unknown = null;
  const db = {
    locationGroup: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => [{ id: "p1", image: null, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), limit: 10, remaining: 4 }]),
      update: vi.fn(async (_q: { data: Record<string, unknown> }) => ({})),
    },
    location: { updateMany: vi.fn(async () => ({ count: 1 })) },
    locationGroupJob: { create: vi.fn(async (_q: { data: Record<string, unknown> }) => ({ id: "lgj_1" })) },
    hotspot: { findFirst: vi.fn(async ({ where }: { where: { creatorId: string } }) => (where.creatorId === "BRAND_A" ? { id: "h1" } : null)) },
    creatorEvent: {
      create: vi.fn(async (_q: { data: Record<string, unknown> }) => ({ id: "ev_1" })),
      findFirst: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async () => ({})),
    },
    creatorAnnouncement: { create: vi.fn(async () => ({ id: "an_1" })), findFirst: vi.fn(async () => null), deleteMany: vi.fn(async () => ({ count: 1 })), update: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(self)),
  };
  self = db;
  return db;
}
let db: ReturnType<typeof makeDb>;
beforeEach(() => {
  db = makeDb();
  vi.clearAllMocks();
});
const run = (action: Parameters<Exec>[2], edits?: Parameters<Exec>[3]) => executeAction(db as never, BRAND, action, edits);

const place = (key: string, title = `Place ${key}`) => ({ key, title, lat: 41.8, lng: -90.2, kind: "place" as const, address: "Clinton, IA" });
const defaults = {
  type: "LANDMARK" as const,
  startDate: "2026-10-10",
  endDate: "2026-11-10",
  autoCollect: false,
  pinNumber: 1,
  radius: 2,
  collectionLimit: 999_999,
  grouping: "per-location" as const,
};

describe("create_pins", () => {
  it("queues only the places the person kept, for the acting brand, with one attempt", async () => {
    const r = await run({ type: "create_pins", items: [place("a"), place("b"), place("c")], defaults }, { keep: ["a", "c"] });
    expect(r.pinJobId).toBe("lgj_1");
    expect(db.locationGroupJob.create.mock.calls[0]![0].data).toMatchObject({ creatorId: "BRAND_A", total: 2 });
    const [type, creatorId, payload, attempts] = taskClient.enqueue.mock.calls[0] as unknown as [string, string, { pins: { id: string }[]; creatorId: string }, number];
    expect([type, creatorId, payload.creatorId, attempts]).toEqual(["create_pins", "BRAND_A", "BRAND_A", 1]);
    expect(payload.pins.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("uses the person's edited settings, validated", async () => {
    await run({ type: "create_pins", items: [place("a")], defaults }, { defaults: { pinNumber: 3, autoCollect: true } });
    const payload = (taskClient.enqueue.mock.calls[0] as unknown as [string, string, { pinOptions: object }])[2];
    expect(payload.pinOptions).toEqual({ autoCollect: true, groupingMode: "per-location", pinNumber: 3 });

    await expect(run({ type: "create_pins", items: [place("a")], defaults }, { defaults: { endDate: "2026-01-01" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(run({ type: "create_pins", items: [place("a")], defaults }, { keep: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps an event's own dates", async () => {
    const event = { ...place("e"), kind: "event" as const, startDate: "2026-12-01", endDate: "2026-12-02" };
    await run({ type: "create_pins", items: [event], defaults });
    const pin = (taskClient.enqueue.mock.calls[0] as unknown as [string, string, { pins: { startDate: string; endDate: string }[] }])[2].pins[0]!;
    expect(pin.startDate.slice(0, 10)).toBe("2026-12-01");
    expect(new Date(pin.endDate) > new Date("2026-12-02")).toBe(true);
  });
});

describe("pin edits and deletes", () => {
  it("only touch the acting brand's pins", async () => {
    await run({ type: "hide_pins", pins: [{ id: "p1", title: "x" }, { id: "OTHER", title: "y" }] });
    expect(db.locationGroup.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["p1", "OTHER"] }, creatorId: "BRAND_A" }, data: { hidden: true } });

    await run({ type: "update_pins", pins: [{ id: "p1", title: "x" }], changes: { collectionLimit: 20 } });
    expect(db.locationGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["p1"] }, creatorId: "BRAND_A", hidden: false } }));
    // 6 already collected: 20 − 6 = 14 left.
    expect(db.locationGroup.update.mock.calls[0]![0].data).toMatchObject({ limit: 20, remaining: 14 });
  });

  it("reject dates that would end a pin before it starts", async () => {
    await expect(run({ type: "update_pins", pins: [{ id: "p1", title: "x" }], changes: { endDate: "2025-01-01" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("hotspots", () => {
  it("are only changed when they belong to the acting brand", async () => {
    await run({ type: "hotspot_state", hotspot: { id: "h1", title: "x" }, op: "pause" });
    expect(hotspotClient.pause).toHaveBeenCalledWith("BRAND_A", "h1");

    db.hotspot.findFirst.mockResolvedValue(null);
    await expect(run({ type: "hotspot_state", hotspot: { id: "h_other", title: "x" }, op: "delete" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(hotspotClient.delete).not.toHaveBeenCalled();
  });

  it("are created as a circle for the acting brand", async () => {
    const hotspot = {
      title: "Riverfront",
      lat: 41.84,
      lng: -90.19,
      radiusMetres: 400,
      type: "LANDMARK" as const,
      startDate: "2026-10-10",
      endDate: "2027-01-10",
      dropEveryDays: 7,
      pinDurationDays: 7,
      pinNumber: 1,
      collectionLimit: 999_999,
      autoCollect: false,
    };
    await run({ type: "create_hotspot", hotspot });
    expect(hotspotClient.create).toHaveBeenCalledWith("BRAND_A", expect.objectContaining({ hotspotShape: "circle", creatorId: "BRAND_A" }));
  });
});

describe("events and announcements", () => {
  it("are created with the form's rules, on the brand's platform", async () => {
    await run({ type: "create_event", event: { title: "Harvest fair", description: "Fun", startDate: "2026-11-01T10:00:00Z", endDate: "2026-11-01T16:00:00Z" } });
    expect(db.creatorEvent.create.mock.calls[0]![0].data).toMatchObject({ creatorId: "BRAND_A", platformId: "clintoncounty", title: "Harvest fair" });

    await expect(run({ type: "create_event", event: { title: "x", description: "Fun", startDate: "2026-11-01T10:00:00Z", endDate: "2026-11-01T16:00:00Z" } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(run({ type: "create_announcement", announcement: { title: "Hello", body: "Hi", pinned: false, ctaLabel: "Go" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("of another brand can't be edited or deleted", async () => {
    await expect(run({ type: "update_event", event: { id: "ev_other", title: "x" }, changes: { title: "Mine now" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.creatorEvent.findFirst).toHaveBeenCalledWith({ where: { id: "ev_other", creatorId: "BRAND_A" } });
    await expect(run({ type: "delete_event", event: { id: "ev_other", title: "x" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.creatorEvent.deleteMany).toHaveBeenCalledWith({ where: { id: "ev_other", creatorId: "BRAND_A" } });
  });
});
