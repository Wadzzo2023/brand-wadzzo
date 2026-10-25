"use client";

import { Wallet } from "lucide-react";
import Link from "next/link";

import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { cn } from "~/lib/utils";
import { WadzzoMark } from "~/ui/wadzzo-mark";

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/** 18,234.17 → 18.2K, so large balances fit the sidebar. */
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** The signed-in wallet's platform-asset balance as a sidebar sticker (filled by usePortalAccess). */
export function WalletBalance({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const active = useUserStellarAcc((s) => s.active);
  const balance = useUserStellarAcc((s) => s.platformAssetBalance);
  if (!active) return null;
  return (
    <Link
      href="/wallet"
      className={cn(
        "blob bg-side-ink text-side-mint flex items-center gap-2.5 px-3 py-2 transition-transform duration-200 hover:-translate-y-0.5",
        collapsed && "justify-center px-0 py-2.5",
        className,
      )}
      title={`${fmt.format(balance)} ${PLATFORM_ASSET.code} · open wallet`}
      aria-label="Open wallet"
    >
      {collapsed ? (
        <WadzzoMark className="text-side h-5" />
      ) : (
        <span className="min-w-0 flex-1 leading-none">
          <span className="marker block text-[10px] opacity-70">*balance*</span>
          <span className="text-side mt-1 flex items-center gap-1.5">
            <span className="display truncate text-[1.75rem] tabular-nums">
              {balance >= 10_000 ? compact.format(balance) : fmt.format(balance)}
            </span>
            <WadzzoMark className="h-4 shrink-0" />
            <span className="sr-only">{PLATFORM_ASSET.code}</span>
          </span>
        </span>
      )}
      {!collapsed && <Wallet className="size-4 shrink-0 opacity-70" />}
    </Link>
  );
}
