import { afterEach, describe, expect, it, vi } from "vitest";

// The task server's place lookup (package/express-wadzzo/src/agent/google.ts):
// Google first, OpenStreetMap when Google can't place a name.
const store = new Map<string, string>();
vi.mock("../package/express-wadzzo/src/lib/db", () => ({
  db: {
    geoCache: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (store.has(where.key) ? { value: store.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => store.set(where.key, create.value)),
    },
  },
}));
vi.mock("../package/express-wadzzo/src/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { geocode } = await import("../package/express-wadzzo/src/agent/google");
const { cacheKey } = await import("../package/express-wadzzo/src/agent/geo-cache");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("finding where a place is", () => {
  it("falls back to OpenStreetMap when Google refuses (e.g. the key can't geocode)", async () => {
    vi.stubEnv("GOOGLE_MAP_API_KEY", "test-key");
    const fetch = vi.fn(async (url: string | URL) =>
      String(url).includes("googleapis")
        ? new Response(JSON.stringify({ status: "REQUEST_DENIED", error_message: "API not enabled" }))
        : new Response(JSON.stringify([{ lat: "23.858", lon: "90.266", display_name: "Savar Upazila, Dhaka District, Bangladesh", boundingbox: ["23.75", "23.98", "90.13", "90.36"] }])),
    );
    vi.stubGlobal("fetch", fetch);

    const hit = await geocode("Savar, Dhaka District");
    expect(hit).toMatchObject({ name: "Savar Upazila, Dhaka District, Bangladesh", lat: 23.858, box: { south: 23.75, north: 23.98 } });
    expect(String(fetch.mock.calls[1]![0])).toContain("nominatim.openstreetmap.org");
  });

  it("keeps names in other scripts apart in the cache", () => {
    expect(cacheKey("geocode", "সাভার")).not.toBe(cacheKey("geocode", "ঢাকা"));
    expect(cacheKey("geocode", "Savar")).toBe(cacheKey("geocode", "  savar "));
  });
});
