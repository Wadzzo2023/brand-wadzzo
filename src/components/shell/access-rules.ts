import { adminNavFor, BRAND_NAV, type NavGroup, type NavItem } from "./nav";

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

/** Returns the navigation groups appropriate for the user's role. */
export function getVisibleNavGroups({
  isAdmin,
  isApprovedCreator,
  navPermission,
  isSuperAdmin = false,
}: {
  isAdmin: boolean;
  isApprovedCreator: boolean;
  navPermission: boolean;
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
    ...(isAdmin ? [adminNavFor(isSuperAdmin)] : []),
  ];
}
