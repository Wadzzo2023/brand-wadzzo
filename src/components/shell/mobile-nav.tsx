"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "~/components/shadcn/ui/drawer";
import { cn } from "~/lib/utils";

import { ADMIN_NAV, BRAND_NAV, CREATE_ACTIONS, isActive, MOBILE_TABS, type NavItem } from "./nav";
import { UserMenu } from "./user-menu";
import { WalletBalance } from "./wallet-balance";

/** Phone top bar: logo, current section, account. */
export function MobileTopBar({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80 lg:hidden">
      <Link href="/pins" className="flex items-center gap-2" aria-label="Home">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
          <Image src="/images/loading.png" alt="" width={20} height={20} className="object-contain" />
        </span>
      </Link>
      <span className="min-w-0 flex-1 truncate font-hud text-base font-semibold">{title ?? "Wadzzo"}</span>
      <UserMenu compact />
    </header>
  );
}

/**
 * Phone bottom bar: Map · Stores · [+ Create] · Bounties · More (decided).
 * Sections a brand can't open yet (no nav permission) drop out of the bar and
 * the next ungated ones take their slots, so the bar never has dead tabs.
 */
export function MobileTabBar({ isAdmin, navPermission }: { isAdmin: boolean; navPermission: boolean }) {
  const pathname = usePathname() ?? "";
  const [sheet, setSheet] = useState<"create" | "more" | null>(null);

  const allowed = (i: NavItem) => !i.gated || navPermission;
  const fallback: NavItem[] = BRAND_NAV.flatMap((g) => g.items).filter((i) => !i.gated && i.href !== "/pins");
  const left = MOBILE_TABS.left.map((t) => (allowed(t) ? t : fallback.shift()!)).filter(Boolean);
  const right = MOBILE_TABS.right.map((t) => (allowed(t) ? t : fallback.shift()!)).filter(Boolean);
  const inBar = new Set([...left, ...right].map((t) => t.href));
  const moreGroups = [...BRAND_NAV, ...(isAdmin ? [ADMIN_NAV] : [])]
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i) && !inBar.has(i.href)) }))
    .filter((g) => g.items.length);
  const moreActive = moreGroups.some((g) => g.items.some((i) => isActive(pathname, i)));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[var(--safe-bottom)] backdrop-blur-sm supports-[backdrop-filter]:bg-card/85 lg:hidden"
        aria-label="Sections"
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch">
          {left.map((t) => (
            <Tab key={t.href} item={t} active={isActive(pathname, t)} />
          ))}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setSheet("create")}
              className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
              aria-label="Create"
            >
              <Plus className="size-6" />
            </button>
          </div>
          {right.map((t) => (
            <Tab key={t.href} item={t} active={isActive(pathname, t)} />
          ))}
          <button
            type="button"
            onClick={() => setSheet("more")}
            className={cn("flex flex-1 flex-col items-center justify-center gap-1", moreActive ? "text-primary" : "text-muted-foreground")}
            aria-label="More sections"
          >
            <MoreHorizontal className="size-5" />
            <span className="font-hud text-[10px] font-semibold uppercase tracking-wider">More</span>
          </button>
        </div>
      </nav>

      {/* Create */}
      <Drawer open={sheet === "create"} onOpenChange={(o) => setSheet(o ? "create" : null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-hud">Create</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto px-4 pb-2">
            {CREATE_ACTIONS.filter(allowed).map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={() => setSheet(null)}
                  className="flex flex-col gap-2 rounded-xl border bg-surface-2 p-3 active:scale-[0.98]"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-hud text-sm font-semibold">{a.label}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{a.description}</span>
                </Link>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* More */}
      <Drawer open={sheet === "more"} onOpenChange={(o) => setSheet(o ? "more" : null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-hud">All sections</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-2">
            <WalletBalance />
            {moreGroups.map((g) => (
              <div key={g.label}>
                <p className="mb-1.5 px-1 font-hud text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{g.label}</p>
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map((i) => {
                    const Icon = i.icon;
                    const active = isActive(pathname, i);
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        onClick={() => setSheet(null)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center",
                          active ? "border-primary/40 bg-primary/10 text-primary" : "bg-surface-2",
                        )}
                      >
                        <Icon className="size-5" />
                        <span className="text-xs font-medium leading-tight">{i.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-1 flex-col items-center justify-center gap-1", active ? "text-primary" : "text-muted-foreground")}
    >
      <Icon className="size-5" />
      <span className="font-hud text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
    </Link>
  );
}
