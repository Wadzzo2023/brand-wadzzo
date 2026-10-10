import { beforeAll, describe, expect, it, vi } from "vitest";

// Who may set home areas (routers/home-area.ts), against a stand-in database.
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { PLATFORM_SLUG: "wadzzo" } }));

const WADZZO = { id: "wadzzo", name: "Wadzzo", isRoot: true };
const CLINTON = { id: "clintoncounty", name: "Clinton County", isRoot: false };
type Site = typeof WADZZO;

const AREA = {
  name: "Clinton County, IA",
  feature: { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[[41.7, -90.4], [41.7, -90.1], [42.0, -90.1], [41.7, -90.4]]] } },
};

function ctxFor(site: Site, callerId: string, adminOf: Site | null = null) {
  return {
    session: { user: { id: callerId } },
    platform: site,
    db: {
      creator: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === "CLINTON_BRAND" ? { platformId: "clintoncounty", aprovalSend: true, approved: true } : null,
        ),
        update: vi.fn(async () => ({})),
      },
      admin: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === callerId && adminOf ? { id: callerId, platformId: adminOf.id, platform: { isRoot: adminOf.isRoot } } : null,
        ),
      },
      platform: { update: vi.fn(async () => ({})) },
      auditLog: { create: vi.fn(async () => ({})) },
    },
  };
}

type Caller = Record<string, (input: unknown) => Promise<unknown>>;
let caller: (ctx: ReturnType<typeof ctxFor>) => Caller;
beforeAll(async () => {
  const { createCallerFactory } = await import("~/server/api/trpc");
  const { homeAreaRouter } = await import("~/server/api/routers/home-area");
  const factory = createCallerFactory(homeAreaRouter);
  caller = (ctx) => factory(ctx as never) as unknown as Caller;
});

describe("home areas", () => {
  it("a brand sets its own, and only its own", async () => {
    const ctx = ctxFor(CLINTON, "CLINTON_BRAND");
    await caller(ctx).saveBrand!({ area: AREA });
    expect(ctx.db.creator.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "CLINTON_BRAND" } }));
    await expect(caller(ctxFor(CLINTON, "SOMEONE_ELSE")).saveBrand!({ creatorId: "CLINTON_BRAND", area: AREA })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts a looked-up place in several parts", async () => {
    const ring: number[][] = AREA.feature.geometry.coordinates[0]!;
    const shifted = ring.map((p) => [p[0]! + 1, p[1]!]);
    const multi = { ...AREA, feature: { type: "Feature", properties: null, geometry: { type: "MultiPolygon", coordinates: [[ring], [shifted]] } } };
    const ctx = ctxFor(CLINTON, "CLINTON_BRAND");
    await caller(ctx).saveBrand!({ area: multi });
    const saved = (ctx.db.creator.update.mock.calls[0] as unknown as [{ data: { homeArea: unknown } }])[0];
    expect(saved.data.homeArea).toEqual(multi.feature);
  });

  it("rejects shapes that aren't a closed polygon", async () => {
    const bad = { ...AREA, feature: { ...AREA.feature, geometry: { type: "Polygon", coordinates: [[[41.7, -90.4], [999, 0]]] } } };
    await expect(caller(ctxFor(CLINTON, "CLINTON_BRAND")).saveBrand!({ area: bad })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("a partner admin sets their platform's default, not another platform's", async () => {
    const ctx = ctxFor(CLINTON, "CLINTON_ADMIN", CLINTON);
    await caller(ctx).savePlatform!({ area: AREA });
    expect(ctx.db.platform.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "clintoncounty" } }));
    await expect(caller(ctx).savePlatform!({ platformId: "wadzzo", area: AREA })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a Wadzzo admin can set any platform's default; brands can't", async () => {
    const ctx = ctxFor(WADZZO, "WADZZO_ADMIN", WADZZO);
    await caller(ctx).savePlatform!({ platformId: "clintoncounty", area: AREA });
    expect(ctx.db.platform.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "clintoncounty" } }));
    await expect(caller(ctxFor(CLINTON, "CLINTON_BRAND")).savePlatform!({ area: AREA })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
