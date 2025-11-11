"use client";

import {
  BarChart3,
  FileText,
  Gift,
  Map,
  Store,
  Target,
  Wallet2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "~/utils/api";

const navItems = [
  { href: "/map", label: "Map", icon: Map },
  { href: "/stores", label: "Stores", icon: Store, needProval: true },
  { href: "/posts", label: "Posts", icon: FileText, needProval: true },
  { href: "/bounties", label: "Bounties", icon: Target, needProval: true },
  { href: "/gifts", label: "Gifts", icon: Gift, needProval: true },
  { href: "/membership", label: "Membership", icon: Wallet2, needProval: true },
  { href: "/report", label: "Report & Analytics", icon: BarChart3 },
];

export function NavLinks() {
  const creatorPermission = api.fan.creator.getPermissionData.useQuery();
  const pathname = usePathname();
  return (
    <nav className="flex-1 p-2">
      <div className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          if (item.needProval && !creatorPermission.data) {
            return null;
          }
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
                  isActive ? "bg-primary text-white" : "hover:bg-secondary"
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className="whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {item.label}
                </span>

                {isActive && (
                  <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-accent"></div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
