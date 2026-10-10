import { afterEach, describe, expect, it, vi } from "vitest";

// Home area lookup (src/server/area-lookup.ts) with OpenStreetMap's Nominatim stubbed.
vi.useFakeTimers({ toFake: ["setTimeout"] });
const { areaOutline, findAreas } = await import("~/server/area-lookup");

function reply(body: unknown) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
/** Runs a lookup through the one-request-a-second queue. */
async function run<T>(p: Promise<T>) {
  await vi.advanceTimersByTimeAsync(1200);
  return p;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finding an area by name", () => {
  it("lists only places with an outline, and identifies the app", async () => {
    const fetch = reply([
      { osm_type: "relation", osm_id: 1, name: "Clinton County", display_name: "Clinton County, Iowa, United States", addresstype: "county", boundingbox: ["41.6", "42.0", "-90.9", "-90.1"] },
      { osm_type: "node", osm_id: 2, name: "Clinton", display_name: "Clinton, Iowa", addresstype: "town" },
    ]);
    const found = await run(findAreas("Clinton County Iowa"));
    expect(found).toEqual([{ id: "R1", name: "Clinton County", label: "Clinton County, Iowa, United States", kind: "county", spanDeg: expect.closeTo(0.8, 5) as number }]);
    expect((fetch.mock.calls[0]![1]!.headers as Record<string, string>)["User-Agent"]).toMatch(/Wadzzo/);
  });
});

describe("an area's outline", () => {
  it("keeps every part, drops holes, and flips to the map kit's [lat, lng]", async () => {
    const square = (x: number, y: number) => [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]];
    reply([{ geojson: { type: "MultiPolygon", coordinates: [[square(-100, 40), square(-99.8, 40.2)], [square(-150, 60)]] } }]);
    const f = await run(areaOutline("R2", 60));
    expect(f.geometry.type).toBe("MultiPolygon");
    expect(f.geometry.coordinates).toHaveLength(2); // two parts, the hole gone
    expect(f.geometry.coordinates[0]![0]![0]).toEqual([40, -100]);
  });

  it("simplifies a very detailed outline to a size that's quick to use", async () => {
    // A 20,000-point circle.
    const ring = Array.from({ length: 20_000 }, (_, i) => {
      const t = (i / 20_000) * 2 * Math.PI;
      return [-90 + Math.cos(t), 42 + Math.sin(t)];
    });
    ring.push(ring[0]!);
    reply([{ geojson: { type: "Polygon", coordinates: [ring] } }]);
    const f = await run(areaOutline("R3", 2));
    const points = f.geometry.coordinates.flat(2).length;
    expect(points).toBeLessThanOrEqual(5000);
    expect(points).toBeGreaterThan(50);
  });

  it("says so when a place has no outline", async () => {
    reply([{ geojson: { type: "Point", coordinates: [0, 0] } }]);
    const check = expect(areaOutline("W4", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await vi.advanceTimersByTimeAsync(1200);
    await check;
  });
});
