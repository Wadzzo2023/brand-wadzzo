import {
  BarChart3,
  CalendarDays,
  Code2,
  FileText,
  Flag,
  Frame,
  Gift,
  Map,
  MapPin,
  Plus,
  Shield,
  Store,
  Target,
  Users,
  UserCheck,
  Wallet2,
  Ticket,
  Radar,
  ImagePlus,
  type LucideIcon,
} from "lucide-react";

/**
 * The portal's navigation, defined once. The desktop sidebar, the phone tab
 * bar and its "More" and "Create" sheets all read from here, so they can't
 * drift apart.
 *
 * `gated`: needs the brand's nav permission (an admin grants it — the
 * "Nav Permission" switch in Admin › Creators).
 */
export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  gated?: boolean;
  /** Extra path prefixes that count as "this section" (merged/old routes). */
  match?: string[];
  /** Sub-paths that belong to another nav item (e.g. /pins/manage under /pins). */
  exclude?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const BRAND_NAV: NavGroup[] = [
  {
    label: "Drops",
    items: [
      { href: "/pins", label: "Map", icon: Map, exclude: ["/pins/manage"] },
      { href: "/pins/manage", label: "Pin management", shortLabel: "Pins", icon: MapPin },
      { href: "/events", label: "Events", icon: CalendarDays },
      { href: "/embeds", label: "Website Map", shortLabel: "Embeds", icon: Code2 },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/posts", label: "Posts", icon: FileText, gated: true },
      { href: "/bounties", label: "Bounties", icon: Target, gated: true },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/stores", label: "Stores", icon: Store, gated: true },
      { href: "/gifts", label: "Gifts", icon: Gift, gated: true },
      { href: "/membership", label: "Membership", icon: Wallet2, gated: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/redeem", label: "Redeem", icon: Ticket },
    ],
  },
];

export const ADMIN_NAV: NavGroup = {
  label: "Admin",
  items: [
    { href: "/admin/creators", label: "Creators", icon: UserCheck },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/admins", label: "Admins", icon: Shield },
    { href: "/admin/pins", label: "Pin review", shortLabel: "Review", icon: MapPin },
    { href: "/admin/murals", label: "Mural review", shortLabel: "Murals", icon: Frame },
    { href: "/admin/maps", label: "All maps", shortLabel: "Maps", icon: Map },
    { href: "/admin/reports", label: "Collection reports", shortLabel: "Reports", icon: Flag },
  ],
};

/** Phone tab bar: Map · Stores · [+] · Bounties · More (decided). */
export const MOBILE_TABS: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/pins", label: "Map", icon: Map },
    { href: "/stores", label: "Stores", icon: Store, gated: true },
  ],
  right: [{ href: "/bounties", label: "Bounties", icon: Target, gated: true }],
};

/** What the "+ Create" button (phone) / "Create" menu (desktop) offers. */
export const CREATE_ACTIONS: (NavItem & { description: string })[] = [
  { href: "/pins/new", label: "New pin", icon: MapPin, description: "A drop on the map fans can collect" },
  { href: "/pins/hotspots/new", label: "New hotspot", icon: Radar, description: "An area that keeps dropping pins" },
  { href: "/bounties/new", label: "New bounty", icon: Target, description: "A task with a reward", gated: true },
  { href: "/posts/new", label: "New post", icon: FileText, description: "Share with your followers", gated: true },
  { href: "/stores/new", label: "New asset", icon: ImagePlus, description: "An NFT or item for your store", gated: true },
  { href: "/events/new", label: "New event", icon: CalendarDays, description: "A date fans can RSVP to" },
];

export const CREATE_ICON = Plus;
export const REDEEM_ICON = Ticket;

export function isActive(pathname: string, item: NavItem) {
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  if (item.exclude?.some(under)) return false;
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
