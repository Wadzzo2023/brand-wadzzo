"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/shadcn/ui/tooltip";
import { cn } from "~/lib/utils";

import { getPortalLandingRoute, getVisibleNavGroups } from "./access-rules";
import { NotificationBell } from "~/components/notification/notification-bell";

import { CreateMenu } from "./create-menu";
import { isActive, type NavItem, type BrandEntry } from "./nav";
import { UserMenu } from "./user-menu";
import { WalletBalance } from "./wallet-balance";
import { WadzzoMark } from "~/ui/wadzzo-mark";

/**
 * Desktop navigation (lg and up), in the marketplace's look: a solid brand-colour panel (dark ink
 * in light mode), the portal name in display type, and display-type rows with the current page as
 * an inverted chip. Collapsed it's an icon rail with tooltips. The choice is remembered.
 */
export function Sidebar({
  collapsed,
  onToggle,
  isAdmin,
  navPermission,
  isApprovedCreator = false,
  isSuperAdmin = false,
  brandEntry = null,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  navPermission: boolean;
  isApprovedCreator?: boolean;
  isSuperAdmin?: boolean;
  brandEntry?: BrandEntry | null;
}) {
  const pathname = usePathname() ?? "";
  const groups = getVisibleNavGroups({
    isAdmin,
    isApprovedCreator,
    navPermission,
    isSuperAdmin,
    brandEntry,
  });
  const homeHref = getPortalLandingRoute({ isAdmin, isApprovedCreator });
  const isPureAdmin = isAdmin && !isApprovedCreator;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "side-scope bg-side text-side-ink sticky top-0 z-40 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[17rem]",
        )}
        aria-label="Portal navigation"
      >
        {/* Brand and Toggle */}
        <div
          className={cn(
            "flex items-center",
            collapsed ? "h-20 justify-center px-0" : "h-20 justify-between px-4",
          )}
        >
          <Link
            href={homeHref}
            className="flex min-w-0 items-center gap-2.5 pr-3"
            aria-label="Wadzzo portal home"
          >
            <span className="bg-side-ink text-side flex size-11 shrink-0 -rotate-3 items-center justify-center rounded-xl">
              <WadzzoMark className="h-6" />
            </span>
            {!collapsed && (
              <span className="min-w-0 leading-none">
                <span className="display block truncate text-[length:var(--side-title-size,1.9rem)]">
                  Wadzzo
                </span>
                <span className="marker mt-0.5 block text-[11px] opacity-75">
                  {isPureAdmin ? "admin portal" : "brand portal"}
                </span>
              </span>
            )}
          </Link>
          {!collapsed && isApprovedCreator && <NotificationBell side="right" align="start" />}
        </div>
        {collapsed && isApprovedCreator && (
          <div className="flex justify-center pt-2">
            <NotificationBell side="right" align="start" />
          </div>
        )}

        {/* Create + balance */}
        <div className={cn("space-y-2 p-3", collapsed && "px-2")}>
          {!isPureAdmin && <CreateMenu navPermission={navPermission} collapsed={collapsed} />}
          <WalletBalance collapsed={collapsed} />
        </div>

        {/* Groups */}
        <nav
          className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-3 pb-4"
          aria-label="Sections"
        >
          {groups.map((group, g) => (
            <div key={group.label}>
              {g > 0 && <div className="dash-rule mb-3" aria-hidden />}
              {!collapsed && (
                <p className="marker mb-1.5 px-2 text-xs opacity-70">
                  *{group.label.toLowerCase()}*
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={isActive(pathname, item)} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 p-3 pt-0">
          <div className="dash-rule mb-3" aria-hidden />
          <UserMenu collapsed={collapsed} />
        </div>

        {/* chevron on the sidebar's edge, level with the logo: collapses and expands */}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="bg-side-ink text-side absolute top-7 -right-3.5 z-50 flex size-7 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "display flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[length:var(--side-nav-size,1.3rem)] transition-[background-color,transform] duration-150",
        collapsed && "justify-center px-0",
        active ? "side-active -rotate-1" : "hover:bg-side-ink/10 hover:translate-x-0.5",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={2.4} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
