"use client";

import { Wallet } from "lucide-react";

import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { cn } from "~/lib/utils";

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The signed-in wallet's platform-asset balance (filled by usePortalAccess). */
export function WalletBalance({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  const active = useUserStellarAcc((s) => s.active);
  const balance = useUserStellarAcc((s) => s.platformAssetBalance);
  if (!active) return null;
  return (
    <div
      className={cn("flex h-10 items-center gap-2.5 rounded-lg border bg-surface-2 px-2.5", collapsed && "justify-center px-0", className)}
      title={`${fmt.format(balance)} ${PLATFORM_ASSET.code}`}
    >
      <Wallet className="size-4 shrink-0 text-primary" />
      {!collapsed && (
        <span className="min-w-0 truncate font-hud text-sm font-semibold tabular-nums">
          {fmt.format(balance)} <span className="text-xs font-medium text-muted-foreground">{PLATFORM_ASSET.code}</span>
        </span>
      )}
    </div>
  );
}
