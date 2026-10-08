import { describe, expect, it } from "vitest";
import {
  canAccessCreatorSide,
  canAccessAdminSide,
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

  describe("getVisibleNavGroups", () => {
    it("offers an admin with no brand a way in to the brand sign-up, and nobody else", () => {
      const hrefs = (o: Parameters<typeof getVisibleNavGroups>[0]) => getVisibleNavGroups(o).flatMap((g) => g.items).map((i) => i.href);
      const base = { isAdmin: true, isApprovedCreator: false, navPermission: false };
      expect(hrefs({ ...base, canJoinAsBrand: true })).toContain("/onboarding");
      expect(hrefs({ ...base, canJoinAsBrand: false })).not.toContain("/onboarding");
      expect(hrefs({ ...base, isApprovedCreator: true, canJoinAsBrand: true })).not.toContain("/onboarding");
      expect(hrefs({ isAdmin: false, isApprovedCreator: false, navPermission: false, canJoinAsBrand: true })).not.toContain("/onboarding");
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
