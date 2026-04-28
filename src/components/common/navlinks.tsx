"use client"

import {
  BarChart3, FileText, Flag, Gift, HandCoins,
  Map, MapPin, Shield, Store, Target, Users, Wallet2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/router"
import { cn } from "~/lib/utils"

const userNavItems = [
  { href: "/map", label: "Map", icon: Map },
  { href: "/stores", label: "Stores", icon: Store, needProval: true },
  { href: "/posts", label: "Posts", icon: FileText, needProval: true },
  { href: "/bounties", label: "Bounties", icon: Target, needProval: true },
  { href: "/gifts", label: "Gifts", icon: Gift, needProval: true },
  { href: "/membership", label: "Membership", icon: Wallet2, needProval: true },
  { href: "/report", label: "Report & Analytics", icon: BarChart3 },
  { href: "/redeem", label: "Redeem", icon: HandCoins },
  { href: "/pin-manage", label: "Pin Management", icon: MapPin },
]

const adminNavItems = [
  { href: "/admin/maps", label: "Maps", icon: Map },
  { href: "/admin/pins", label: "Pins", icon: MapPin },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/creators", label: "Creators", icon: Users },
  { href: "/admin/admins", label: "Admins", icon: Shield },
  { href: "/admin/collection-report", label: "Collection Reports", icon: Flag },
]

interface NavLinksProps {
  isAdminMode?: boolean
  creatorPermission?: boolean
  forceOpen?: boolean
}

export function NavLinks({
  isAdminMode = false,
  creatorPermission = false,
  forceOpen = false,
}: NavLinksProps) {
  const router = useRouter()
  const { pathname } = router
  const navItems = isAdminMode ? adminNavItems : userNavItems

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
      <div className="space-y-0.5">
        {navItems.map((item) => {
          if (!isAdminMode && "needProval" in item && item.needProval && !creatorPermission) {
            return null
          }

          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-xl px-2 transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {isActive && (
                  <div className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}

                {/* Icon cell — always h-8 w-8 */}
                <div
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                    isActive ? "bg-white/20" : "bg-muted",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "whitespace-nowrap text-xs font-semibold uppercase tracking-wide transition-opacity duration-300",
                    forceOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {item.label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}