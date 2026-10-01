"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { CenteredSpinner } from "~/ui/spinner";

import { AdminGate, CreatorGate, OnboardingGate, SignInScreen } from "./gates";
import { MobileTabBar, MobileTopBar } from "./mobile-nav";
import { ADMIN_NAV, BRAND_NAV, isActive } from "./nav";
import { Sidebar } from "./sidebar";
import { usePortalAccess } from "./use-portal-access";

const COLLAPSE_KEY = "wadzzo.sidebar.collapsed";
/** The saved choice only changes through our own toggle, so there's nothing to subscribe to. */
const subscribeNever = () => () => undefined;

/** Pages a brand can open before approval without submitting onboarding (settings). */
const UNGATED = ["/settings"];

/**
 * The one layout for the whole portal: sidebar on desktop, top bar + tab bar
 * on phones, and the sign-in / brand-approval / admin gates in front of the
 * page. The shell renders immediately and stays put while pages load, so
 * navigation never jumps.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const access = usePortalAccess();
  const pathname = usePathname() ?? "";
  // The sidebar starts expanded on the server and first client render, then
  // takes the saved choice — read once storage is available.
  const collapsedSaved = useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return localStorage.getItem(COLLAPSE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const collapsed = override ?? collapsedSaved;
  const toggle = () => {
    const next = !collapsed;
    setOverride(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  if (access.session.status === "loading") return <CenteredSpinner className="min-h-dvh" label="Signing you in" />;
  if (!access.signedIn) return <SignInScreen />;

  const isAdminRoute = pathname.startsWith("/admin");
  const isOnboardingRoute = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const title = [...BRAND_NAV.flatMap((g) => g.items), ...ADMIN_NAV.items].find((i) => isActive(pathname, i))?.label;

  const page = isAdminRoute ? (
    <AdminGate access={access}>{children}</AdminGate>
  ) : isOnboardingRoute ? (
    <OnboardingGate access={access}>{children}</OnboardingGate>
  ) : UNGATED.some((p) => pathname === p || pathname.startsWith(p + "/")) ? (
    children
  ) : (
    <CreatorGate access={access}>{children}</CreatorGate>
  );

  const homeHref = access.isAdmin && !access.approved ? "/admin/creators" : "/pins";

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        isAdmin={access.isAdmin}
        navPermission={access.navPermission}
        isApprovedCreator={access.approved}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar title={title} homeHref={homeHref} />
        <main className="min-w-0 flex-1">{page}</main>
      </div>
      <MobileTabBar
        isAdmin={access.isAdmin}
        navPermission={access.navPermission}
        isApprovedCreator={access.approved}
      />
    </div>
  );
}
