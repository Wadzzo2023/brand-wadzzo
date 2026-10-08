import { beforeAll, describe, expect, it, vi } from "vitest";

// The real access rules, run against a stand-in database.
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { PLATFORM_SLUG: "wadzzo" } }));

const WADZZO = { id: "wadzzo", name: "Wadzzo", isRoot: true };
const CLINTON = { id: "clintoncounty", name: "Clinton County", isRoot: false };
const adminRow = (platform: typeof WADZZO) => ({ platformId: platform.id, platform: { isRoot: platform.isRoot } });

/** A caller with `adminOf` as their admin record (null = not an admin), visiting `site`. */
function ctxFor(site: typeof WADZZO, adminOf: typeof WADZZO | null, extra: Record<string, unknown> = {}) {
  return {
    session: { user: { id: "GCALLER" } },
    platform: site,
    db: {
      admin: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "GCALLER" ? (adminOf ? adminRow(adminOf) : null) : ((extra.otherAdmin as object) ?? null))), create: vi.fn(), update: vi.fn(), count: vi.fn(async () => 2), delete: vi.fn() },
      platform: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => [WADZZO, CLINTON].find((p) => p.id === where.id) ?? null) },
      user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })) },
      auditLog: { create: vi.fn() },
    },
  };
}

let panel: (ctx: never) => Promise<unknown>;
let platforms: (ctx: never) => Promise<unknown>;
let makeAdmin: (ctx: never, input: { pubkey: string; platformId?: string }) => Promise<{ moved: boolean }>;

beforeAll(async () => {
  const { createCallerFactory, createTRPCRouter, adminProcedure, superAdminProcedure } = await import("~/server/api/trpc");
  const { adminRouter } = await import("~/server/api/routers/wallate/admin");
  const probe = createCallerFactory(createTRPCRouter({ panel: adminProcedure.query(() => "ok"), platforms: superAdminProcedure.query(() => "ok") }));
  const admins = createCallerFactory(adminRouter);
  panel = (ctx) => probe(ctx).panel();
  platforms = (ctx) => probe(ctx).platforms();
  makeAdmin = (ctx, input) => admins(ctx).makeAdmin(input);
});

const refused = { code: "FORBIDDEN" };

describe("Wadzzo (root) admin", () => {
  it("has the admin panel on Wadzzo's site and on a partner's", async () => {
    expect(await panel(ctxFor(WADZZO, WADZZO) as never)).toBe("ok");
    expect(await panel(ctxFor(CLINTON, WADZZO) as never)).toBe("ok");
  });

  it("can use Wadzzo-only controls (platforms, audit log) on any site", async () => {
    expect(await platforms(ctxFor(WADZZO, WADZZO) as never)).toBe("ok");
    expect(await platforms(ctxFor(CLINTON, WADZZO) as never)).toBe("ok");
  });
});

describe("Clinton County admin", () => {
  it("has the admin panel on Clinton's own site", async () => {
    expect(await panel(ctxFor(CLINTON, CLINTON) as never)).toBe("ok");
  });

  it("cannot get into Wadzzo's admin panel", async () => {
    await expect(panel(ctxFor(WADZZO, CLINTON) as never)).rejects.toMatchObject(refused);
  });

  it("cannot use Wadzzo-only controls, even on their own site", async () => {
    await expect(platforms(ctxFor(CLINTON, CLINTON) as never)).rejects.toMatchObject(refused);
  });
});

it("a signed-in account that is not an admin gets no panel anywhere", async () => {
  await expect(panel(ctxFor(WADZZO, null) as never)).rejects.toMatchObject(refused);
  await expect(panel(ctxFor(CLINTON, null) as never)).rejects.toMatchObject(refused);
});

describe("adding admins", () => {
  const ALICE = "G" + "A".repeat(55);

  it("Wadzzo promotes a Clinton admin to Wadzzo admin — after that they reach Wadzzo's panel", async () => {
    const ctx = ctxFor(WADZZO, WADZZO, { otherAdmin: adminRow(CLINTON) });
    const r = await makeAdmin(ctx as never, { pubkey: ALICE, platformId: "wadzzo" });
    expect(r.moved).toBe(true);
    expect(ctx.db.admin.update).toHaveBeenCalledWith({ where: { id: ALICE }, data: { platformId: "wadzzo" } });
    // as a Wadzzo admin she now passes the check Clinton admins fail
    expect(await panel(ctxFor(WADZZO, WADZZO) as never)).toBe("ok");
  });

  it("Wadzzo can add a brand-new admin to Clinton County from either site", async () => {
    for (const site of [WADZZO, CLINTON]) {
      const ctx = ctxFor(site, WADZZO);
      const r = await makeAdmin(ctx as never, { pubkey: ALICE, platformId: "clintoncounty" });
      expect(r.moved).toBe(false);
      expect(ctx.db.admin.create).toHaveBeenCalledWith({ data: { id: ALICE, platformId: "clintoncounty" } });
    }
  });

  it("a Clinton admin can add Clinton admins, but not Wadzzo ones", async () => {
    const ok = ctxFor(CLINTON, CLINTON);
    await makeAdmin(ok as never, { pubkey: ALICE });
    expect(ok.db.admin.create).toHaveBeenCalledWith({ data: { id: ALICE, platformId: "clintoncounty" } });
    await expect(makeAdmin(ctxFor(CLINTON, CLINTON) as never, { pubkey: ALICE, platformId: "wadzzo" })).rejects.toMatchObject(refused);
  });

  it("a Clinton admin cannot take over another platform's admin", async () => {
    const ctx = ctxFor(CLINTON, CLINTON, { otherAdmin: adminRow(WADZZO) });
    await expect(makeAdmin(ctx as never, { pubkey: ALICE })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(ctx.db.admin.update).not.toHaveBeenCalled();
  });

  it("nobody can change their own admin platform", async () => {
    const ctx = ctxFor(WADZZO, WADZZO, { otherAdmin: adminRow(CLINTON) });
    await expect(makeAdmin(ctx as never, { pubkey: "GCALLER", platformId: "clintoncounty" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
