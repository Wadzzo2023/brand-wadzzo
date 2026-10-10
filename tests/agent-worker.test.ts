import { beforeEach, describe, expect, it, vi } from "vitest";

// The task server's map agent (package/express-wadzzo/src/agent), with its
// database, Google and OpenAI replaced by stand-ins.

type Query = { where: Record<string, unknown> };
const db = {
  locationGroup: { findMany: vi.fn(async (_query: Query): Promise<unknown[]> => []), count: vi.fn(async () => 0) },
  hotspot: { findMany: vi.fn(async (_query: Query): Promise<unknown[]> => []) },
  creatorEvent: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  creatorAnnouncement: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  $queryRaw: vi.fn(),
};
vi.mock("../package/express-wadzzo/src/lib/db", () => ({ db }));
vi.mock("../package/express-wadzzo/src/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const geocode = vi.fn(async (_place: string): Promise<unknown> => null);
const searchPlaces = vi.fn(async (_query: string, _box: unknown, _limit: number): Promise<unknown[]> => []);
vi.mock("../package/express-wadzzo/src/agent/google", () => ({ geocode, searchPlaces, findPlace: vi.fn() }));

const { Run } = await import("../package/express-wadzzo/src/agent/run");
const { inArea, inRing, tiles, areaFromFeature, searchBoxes } = await import("../package/express-wadzzo/src/agent/area");
const { AGENT_TOOLS } = await import("../package/express-wadzzo/src/agent/tools");
const { createJob } = await import("../package/express-wadzzo/src/lib/job-store");

type RunT = InstanceType<typeof Run>;
const tool = (name: string) => AGENT_TOOLS.find((t: { name: string }) => t.name === name)!;
const call = async (run: RunT, name: string, args: Record<string, unknown>) => tool(name).run(tool(name).schema.parse(args), run);

// A square around Clinton, IA in the map kit's [lat, lng] format.
const CLINTON_AREA = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[41.7, -90.4], [41.7, -90.1], [42.0, -90.1], [42.0, -90.4], [41.7, -90.4]]] } };

function brand(homeArea: unknown = CLINTON_AREA) {
  return {
    creatorId: "BRAND_A",
    platformId: "clintoncounty",
    name: "Brand A",
    bio: null,
    platformName: "Clinton County",
    homeArea: homeArea ? areaFromFeature("Clinton County", homeArea) : null,
    homeAreaSource: homeArea ? ("platform" as const) : null,
    counts: { activePins: 0, upcomingPins: 0, expiredPins: 0, inReviewPins: 0, hotspotsActive: 0, hotspotsPaused: 0, upcomingEvents: 0, announcements: 0 },
    pinTypes: {},
    recentPins: [],
    habits: null,
  };
}
const newRun = (b = brand()) => new Run(createJob({ type: "agent_run", creatorId: "BRAND_A", payload: {} }).id, b, "conv_1");

beforeEach(() => {
  vi.clearAllMocks();
  db.locationGroup.findMany.mockResolvedValue([]);
});

describe("areas", () => {
  it("tell inside from outside a home area", () => {
    const area = areaFromFeature("Clinton", CLINTON_AREA)!;
    expect(inArea(area, 41.84, -90.19)).toBe(true);
    expect(inArea(area, 41.52, -90.57)).toBe(false); // Davenport
    expect(inRing(area.rings![0]!, 41.84, -90.19)).toBe(true);
    expect(tiles(area.box, 2)).toHaveLength(4);
  });

  it("handle a place in several parts, searching its big parts separately", () => {
    // A "mainland", a big island far away, and a tiny islet.
    const square = (s: number, w: number, size: number) => [[[s, w], [s, w + size], [s + size, w + size], [s + size, w], [s, w]]];
    const country = { type: "Feature", properties: null, geometry: { type: "MultiPolygon", coordinates: [square(30, -110, 20), square(55, -160, 10), square(20, -156, 0.2)] } };
    const area = areaFromFeature("Country", country)!;
    expect(area.rings).toHaveLength(3);
    expect(inArea(area, 40, -100)).toBe(true); // mainland
    expect(inArea(area, 60, -155)).toBe(true); // island
    expect(inArea(area, 20.1, -155.9)).toBe(true); // islet
    expect(inArea(area, 45, -130)).toBe(false); // sea between them, inside the overall box
    expect(searchBoxes(area)).toEqual([
      { south: 30, north: 50, west: -110, east: -90 },
      { south: 55, north: 65, west: -160, east: -150 },
    ]);
  });
});

describe("search_places", () => {
  it("searches the home area by default and keeps only places inside it", async () => {
    searchPlaces.mockResolvedValue([
      { key: "in", title: "Eagle Point Park", lat: 41.86, lng: -90.18, kind: "place" },
      { key: "out", title: "Davenport park", lat: 41.52, lng: -90.57, kind: "place" },
    ]);
    const run = newRun();
    const out = await call(run, "search_places", { query: "parks" });
    expect(tool("search_places").label({ query: "parks" }, run)).toBe("Searching parks in Clinton County…");
    expect(searchPlaces.mock.calls[0]![1]).toEqual(run.brand.homeArea!.box);
    expect(out.detail).toBe("Found 1 place");
    expect(geocode).not.toHaveBeenCalled();
  });

  it("asks where to search when the brand has no home area", async () => {
    await expect(call(newRun(brand(null)), "search_places", { query: "parks" })).rejects.toThrow(/no home area/i);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it("searches a place the person named instead", async () => {
    geocode.mockResolvedValue({ name: "Dubuque, IA", lat: 42.5, lng: -90.66, box: { south: 42.4, west: -90.8, north: 42.6, east: -90.5 } });
    searchPlaces.mockResolvedValue([]);
    await call(newRun(), "search_places", { query: "museums", where: "Dubuque" });
    expect(geocode).toHaveBeenCalledWith("Dubuque");
  });

  it("flags places the brand already pinned", async () => {
    searchPlaces.mockResolvedValue([{ key: "a", title: "Park", lat: 41.86, lng: -90.18, kind: "place" }]);
    db.locationGroup.findMany.mockResolvedValue([{ latitude: 41.8601, longitude: -90.1801 }]);
    const run = newRun();
    const out = await call(run, "search_places", { query: "parks" });
    expect(out.detail).toBe("Found 1 place (1 already pinned)");
    expect(db.locationGroup.findMany.mock.calls[0]![0].where.creatorId).toBe("BRAND_A");
  });
});

describe("brand data", () => {
  it("is always read for the run's own brand", async () => {
    await call(newRun(), "find_pins", { text: "fair" });
    expect(db.locationGroup.findMany.mock.calls[0]![0].where).toMatchObject({ creatorId: "BRAND_A", hidden: false });
    await call(newRun(), "find_hotspots", {});
    expect(db.hotspot.findMany.mock.calls[0]![0].where).toMatchObject({ creatorId: "BRAND_A" });
  });

  it("collector names and emails go to the card, never to the model", async () => {
    db.$queryRaw
      .mockResolvedValueOnce([{ name: "Ada", email: "ada@example.com", n: 5, redeemed: 1, last: new Date() }])
      .mockResolvedValueOnce([{ total: 1 }]);
    const run = newRun();
    const out = await call(run, "collectors", {});
    expect(JSON.stringify(out.model)).not.toMatch(/ada/i);
    const set = run.results.get((out.model as { ref: string }).ref)!;
    expect(set).toMatchObject({ kind: "collectors", items: [{ email: "ada@example.com" }] });
  });
});

describe("proposals", () => {
  it("can't name another brand's pins", async () => {
    db.locationGroup.findMany.mockResolvedValue([]); // ownPins finds nothing for BRAND_A
    await expect(call(newRun(), "propose_pin_changes", { mode: "delete", pinIds: ["OTHER_BRANDS_PIN"] })).rejects.toThrow(/none of those/i);
    expect(db.locationGroup.findMany.mock.calls[0]![0].where).toMatchObject({ creatorId: "BRAND_A", id: { in: ["OTHER_BRANDS_PIN"] } });
  });

  it("only pins places from a search, skipping ones already pinned", async () => {
    const run = newRun();
    const ref = run.addResult({
      kind: "places",
      title: "parks",
      items: [
        { key: "a", title: "A", lat: 41.8, lng: -90.2, kind: "place" },
        { key: "b", title: "B", lat: 41.8, lng: -90.2, kind: "place", alreadyPinned: true },
      ],
    });
    await call(run, "propose_pins", { ref });
    expect(run.actions[0]!.action).toMatchObject({ type: "create_pins", items: [{ key: "a" }] });
    await expect(call(run, "propose_pins", { ref: "places_made_up" })).rejects.toThrow(/unknown ref/i);
  });
});

describe("the agent loop", () => {
  it("shows each tool as a live step, then saves the answer with its cards", async () => {
    vi.resetModules();
    const replies = [
      { content: "", tool_calls: [{ id: "c1", name: "search_places", args: { query: "parks" } }] },
      { content: "", tool_calls: [{ id: "c2", name: "show_results", args: { ref: "__REF__" } }] },
      { content: "I found 1 park in Clinton County.", tool_calls: [] },
    ];
    const seenSteps: unknown[] = [];
    // The worker resolves @langchain/openai from its own node_modules.
    vi.doMock("../package/express-wadzzo/node_modules/@langchain/openai", () => ({
      ChatOpenAI: class {
        bindTools() {
          return this;
        }
        async invoke(messages: { content: unknown }[]) {
          const reply = replies.shift()!;
          // Point show_results at the ref search_places returned.
          const last = messages[messages.length - 1]?.content;
          if (typeof last === "string" && last.includes('"ref"')) {
            const ref = (JSON.parse(last) as { ref: string }).ref;
            reply.tool_calls.forEach((c) => (c.args = JSON.parse(JSON.stringify(c.args).replace("__REF__", ref)) as typeof c.args));
          }
          return { ...reply, _getType: () => "ai" };
        }
      },
    }));
    vi.doMock("../package/express-wadzzo/src/agent/context", () => ({ loadBrandContext: vi.fn(async () => brand()) }));
    const saveAnswer = vi.fn(async (run: RunT, _text: string) => {
      seenSteps.push(...run.steps);
      return "msg_1";
    });
    vi.doMock("../package/express-wadzzo/src/agent/store", () => ({ loadHistory: vi.fn(async () => ({ turns: [{ role: "user", text: "find parks" }], earlierBlocks: [] })), saveAnswer }));
    searchPlaces.mockResolvedValue([{ key: "in", title: "Eagle Point Park", lat: 41.86, lng: -90.18, kind: "place" }]);

    const { runAgent } = await import("../package/express-wadzzo/src/agent/agent");
    const { createJob: create, getJob: get } = await import("../package/express-wadzzo/src/lib/job-store");
    const job = create({ type: "agent_run", creatorId: "BRAND_A", payload: {} });
    const result = await runAgent(job.id, { conversationId: "conv_1", creatorId: "BRAND_A", platformId: "clintoncounty" });

    expect(result).toEqual({ messageId: "msg_1" });
    expect(seenSteps).toMatchObject([
      { label: "Understanding your request…", status: "done" },
      { label: "Searching parks in Clinton County…", status: "done", detail: "Found 1 place" },
    ]);
    // The steps were published on the job for the brand app to poll.
    expect(get(job.id)?.steps).toHaveLength(2);
    const run = saveAnswer.mock.calls[0]![0];
    expect(run.blocks).toMatchObject([{ kind: "places", items: [{ title: "Eagle Point Park" }] }]);
    expect(saveAnswer.mock.calls[0]![1]).toBe("I found 1 park in Clinton County.");
  });
});

