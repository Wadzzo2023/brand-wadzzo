import { describe, expect, it } from "vitest";

import { getVisibleNavGroups } from "../src/components/shell/access-rules";
import {
  assertInPlatformScope,
  canAdminPlatform,
  inPlatformScope,
  platformScope,
  relationScope,
} from "../src/server/platform-scope";

const wadzzo = { platform: { id: "wadzzo", isRoot: true } };
const clinton = { platform: { id: "clintoncounty", isRoot: false } };

describe("platformScope", () => {
  it("lets the root platform see every platform", () => {
    expect(platformScope(wadzzo)).toEqual({});
  });

  it("narrows the root platform to one platform when filtered", () => {
    expect(platformScope(wadzzo, "clintoncounty")).toEqual({ platformId: "clintoncounty" });
  });

  it("limits a sub-platform to its own rows, ignoring any filter", () => {
    expect(platformScope(clinton)).toEqual({ platformId: "clintoncounty" });
    expect(platformScope(clinton, "wadzzo")).toEqual({ platformId: "clintoncounty" });
  });

  it("leaves optional relations unfiltered when unscoped", () => {
    expect(relationScope(wadzzo)).toBeUndefined();
    expect(relationScope(clinton)).toEqual({ platformId: "clintoncounty" });
  });
});

describe("inPlatformScope", () => {
  it("lets the root platform reach any row", () => {
    expect(inPlatformScope(wadzzo, "clintoncounty")).toBe(true);
  });

  it("keeps a sub-platform out of other platforms' rows", () => {
    expect(inPlatformScope(clinton, "clintoncounty")).toBe(true);
    expect(inPlatformScope(clinton, "wadzzo")).toBe(false);
    expect(() => assertInPlatformScope(clinton, "wadzzo")).toThrow();
  });
});

describe("canAdminPlatform", () => {
  const wadzzoAdmin = { platformId: "wadzzo", platform: { isRoot: true } };
  const clintonAdmin = { platformId: "clintoncounty", platform: { isRoot: false } };

  it("lets Wadzzo admins manage every platform's panel", () => {
    expect(canAdminPlatform(wadzzoAdmin, wadzzo.platform)).toBe(true);
    expect(canAdminPlatform(wadzzoAdmin, clinton.platform)).toBe(true);
  });

  it("keeps a sub-platform's admins on their own panel", () => {
    expect(canAdminPlatform(clintonAdmin, clinton.platform)).toBe(true);
    expect(canAdminPlatform(clintonAdmin, wadzzo.platform)).toBe(false);
  });
});

describe("admin nav", () => {
  const adminItems = (isSuperAdmin: boolean) =>
    getVisibleNavGroups({ isAdmin: true, isApprovedCreator: false, navPermission: false, isSuperAdmin })
      .flatMap((g) => g.items)
      .map((i) => i.href);

  it("shows platform management only to Wadzzo admins", () => {
    expect(adminItems(true)).toContain("/admin/platforms");
    expect(adminItems(false)).not.toContain("/admin/platforms");
  });

  it("shows the audit log to every admin", () => {
    expect(adminItems(false)).toContain("/admin/audit");
  });
});
