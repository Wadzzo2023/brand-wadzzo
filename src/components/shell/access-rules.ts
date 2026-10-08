import { adminNavFor, BRAND_NAV, brandEntryGroup, type BrandEntry, type NavGroup, type NavItem } from "./nav";

export interface PortalAccessState {
  isAdmin: boolean;
  isApprovedCreator: boolean;
}

/** Only approved creators can access creator portal pages and actions. */
export function canAccessCreatorSide({ isApprovedCreator }: PortalAccessState): boolean {
  return isApprovedCreator;
}

/** Only admins can access admin routes. */
export function canAccessAdminSide(isAdmin: boolean): boolean {
  return isAdmin;
}

/** Default landing route when user enters the portal. */
export function getPortalLandingRoute({ isAdmin, isApprovedCreator }: PortalAccessState): string {
  if (isAdmin && !isApprovedCreator) {
    return "/admin/creators";
  }
  return "/pins";
}

export type BrandRecord = { onThisPlatform: boolean; aprovalSend: boolean; approved: boolean | null } | null | undefined;

/** Which way into a brand an admin without a working one should be offered. */
export function brandEntryFor(applies: boolean, c: BrandRecord): BrandEntry | null {
  if (!applies) return null;
  if (c == null) return "join";
  if (!c.onThisPlatform || c.approved === false) return null; // another platform's brand, or refused
  return c.aprovalSend ? "pending" : "finish";
}

/** Returns the navigation groups appropriate for the user's role. */
export function getVisibleNavGroups({
  isAdmin,
  isApprovedCreator,
  navPermission,
  isSuperAdmin = false,
  brandEntry = null,
}: {
  isAdmin: boolean;
  isApprovedCreator: boolean;
  navPermission: boolean;
  /** an admin without a working brand: the way to join / finish / check their own brand */
  brandEntry?: BrandEntry | null;
  /** a Wadzzo (root-platform) admin: also sees platform management */
  isSuperAdmin?: boolean;
}): NavGroup[] {
  const allowed = (i: NavItem) => !i.gated || navPermission;
  // If user is an admin without an approved creator profile, hide brand nav
  const showBrandNav = isApprovedCreator || !isAdmin;

  const brandGroups = showBrandNav
    ? BRAND_NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length)
    : [];

  return [
    ...brandGroups,
    ...(isAdmin && !isApprovedCreator && brandEntry ? [brandEntryGroup(brandEntry)] : []),
    ...(isAdmin ? [adminNavFor(isSuperAdmin)] : []),
  ];
}
