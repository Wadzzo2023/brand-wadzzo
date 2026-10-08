import { describe, expect, it } from "vitest";
import {
  canAccessCreatorSide,
  canAccessAdminSide,
  brandEntryFor,
  getPortalLandingRoute,
  getVisibleNavGroups,
} from "../src/components/shell/access-rules";
import { ADMIN_NAV, BRAND_NAV } from "../src/components/shell/nav";

describe("Portal Access Rules", () => {
  describe("canAccessCreatorSide", () => {
    it("denies access if user is admin but NOT an approved creator", () => {
      expect(canAccessCreatorSide({ isAdmin: true, isApprovedCreator: false })).toBe(false);
    });

    it("allows access if user is an approved creator (whether admin or not)", () => {
      expect(canAccessCreatorSide({ isAdmin: false, isApprovedCreator: true })).toBe(true);
      expect(canAccessCreatorSide({ isAdmin: true, isApprovedCreator: true })).toBe(true);
    });

    it("denies access if user is neither admin nor approved creator", () => {
      expect(canAccessCreatorSide({ isAdmin: false, isApprovedCreator: false })).toBe(false);
    });
  });

  describe("canAccessAdminSide", () => {
    it("allows access only to admins", () => {
      expect(canAccessAdminSide(true)).toBe(true);
      expect(canAccessAdminSide(false)).toBe(false);
    });
  });

  describe("getPortalLandingRoute", () => {
    it("routes pure admin to /admin/creators", () => {
      expect(getPortalLandingRoute({ isAdmin: true, isApprovedCreator: false })).toBe("/admin/creators");
    });

    it("routes approved creator to /pins", () => {
      expect(getPortalLandingRoute({ isAdmin: false, isApprovedCreator: true })).toBe("/pins");
      expect(getPortalLandingRoute({ isAdmin: true, isApprovedCreator: true })).toBe("/pins");
    });
  });

  describe("brandEntryFor (what an admin without a working brand is offered)", () => {
  const brand = (o: Partial<{ onThisPlatform: boolean; aprovalSend: boolean; approved: boolean | null }>) => ({ onThisPlatform: true, aprovalSend: true, approved: true as boolean | null, ...o });

  it("offers joining when the admin has no brand at all", () => {
    expect(brandEntryFor(true, null)).toBe("join");
  });

  it("offers finishing when the brand exists but was never sent for approval (an admin's half-made brand)", () => {
    expect(brandEntryFor(true, brand({ aprovalSend: false, approved: true }))).toBe("finish");
    expect(brandEntryFor(true, brand({ aprovalSend: false, approved: null }))).toBe("finish");
  });

  it("shows the application while it waits for review", () => {
    expect(brandEntryFor(true, brand({ aprovalSend: true, approved: null }))).toBe("pending");
  });

  it("offers nothing for another platform's brand, or one that was refused", () => {
    expect(brandEntryFor(true, brand({ onThisPlatform: false }))).toBeNull();
    expect(brandEntryFor(true, brand({ approved: false }))).toBeNull();
  });

  it("offers nothing to a non-admin or while the checks are still loading", () => {
    expect(brandEntryFor(false, null)).toBeNull();
  });
});

describe("getVisibleNavGroups", () => {
    it("gives an admin without a working brand a way to their own brand, and nobody else", () => {
      const labels = (o: Parameters<typeof getVisibleNavGroups>[0]) => getVisibleNavGroups(o).flatMap((g) => g.items).map((i) => `${i.label} -> ${i.href}`);
      const base = { isAdmin: true, isApprovedCreator: false, navPermission: false };
      expect(labels({ ...base, brandEntry: "join" })).toContain("Join as a brand -> /onboarding");
      expect(labels({ ...base, brandEntry: "finish" })).toContain("Finish brand setup -> /pins");
      expect(labels({ ...base, brandEntry: "pending" })).toContain("My brand application -> /pins");
      expect(labels({ ...base, brandEntry: null }).join()).not.toMatch(/brand/i);
      // a working brand already has the full brand menu; a non-admin never gets this entry
      expect(labels({ ...base, isApprovedCreator: true, brandEntry: "join" })).not.toContain("Join as a brand -> /onboarding");
      expect(labels({ isAdmin: false, isApprovedCreator: false, navPermission: false, brandEntry: "join" })).not.toContain("Join as a brand -> /onboarding");
    });

    it("only shows ADMIN_NAV if user is an admin without approved creator profile", () => {
      const groups = getVisibleNavGroups({
        isAdmin: true,
        isApprovedCreator: false,
        navPermission: false,
      });
      expect(groups).toHaveLength(1);
      expect(groups[0]?.label).toBe(ADMIN_NAV.label);
    });

    it("shows BRAND_NAV for approved creators", () => {
      const groups = getVisibleNavGroups({
        isAdmin: false,
        isApprovedCreator: true,
        navPermission: true,
      });
      expect(groups.length).toBe(BRAND_NAV.length);
      expect(groups.map((g) => g.label)).toEqual(BRAND_NAV.map((g) => g.label));
    });

    it("shows both BRAND_NAV and ADMIN_NAV for approved creator who is also admin", () => {
      const groups = getVisibleNavGroups({
        isAdmin: true,
        isApprovedCreator: true,
        navPermission: true,
      });
      expect(groups.length).toBe(BRAND_NAV.length + 1);
    });
  });
});
