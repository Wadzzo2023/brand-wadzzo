"use client";

import { ArrowRight, Wallet } from "lucide-react";
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

/**
 * The signed-in wallet's card (filled by usePortalAccess), as in the marketplace sidebar: a
 * "Balance · Wallet →" row, the platform-asset balance big, and spendable XLM underneath.
 * Collapsed it's just the token mark.
 */
export function WalletBalance({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const active = useUserStellarAcc((s) => s.active);
  const balance = useUserStellarAcc((s) => s.platformAssetBalance);
  const xlm = Number(useUserStellarAcc((s) => s.getXLMBalance()) ?? 0);
  if (!active) return null;
  if (collapsed)
    return (
      <Link
        href="/wallet"
        className={cn(
          "blob bg-side-ink text-side flex items-center justify-center py-2.5 transition-transform duration-200 hover:-translate-y-0.5",
          className,
        )}
        title={`${fmt.format(balance)} ${PLATFORM_ASSET.code} · open wallet`}
        aria-label="Open wallet"
      >
        <WadzzoMark className="h-5" />
      </Link>
    );
  return (
    <Link
      href="/wallet"
      className={cn(
        "group blob bg-side-ink text-side-mint block p-3 transition-transform duration-200 hover:-translate-y-0.5",
        className,
      )}
      title={`${fmt.format(balance)} ${PLATFORM_ASSET.code} · open wallet`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="bg-side text-side-ink flex size-7 items-center justify-center rounded-full">
            <Wallet className="size-3.5" strokeWidth={2.6} />
          </span>
          <span className="label-caps text-side-mint/70 text-[10px]">Balance</span>
        </span>
        <span className="text-side flex items-center gap-1 text-[11px] font-bold">
          Wallet
          <ArrowRight
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2.8}
          />
        </span>
      </span>
      <span className="text-side mt-2.5 flex items-center gap-2">
        <span className="display truncate text-4xl leading-none tabular-nums">
          {balance >= 10_000 ? compact.format(balance) : fmt.format(balance)}
        </span>
        <WadzzoMark className="h-6 shrink-0" />
        <span className="sr-only">{PLATFORM_ASSET.code}</span>
      </span>
      <span className="text-side-mint/60 mt-1.5 block truncate text-[11px] font-semibold tabular-nums">
        {xlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM
      </span>
    </Link>
  );
}
