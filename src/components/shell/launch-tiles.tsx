import { ArrowUpRight, ScanLine, Store } from "lucide-react";
import type { ReactNode } from "react";

import { platformBranding } from "./platform";
import { cn } from "~/lib/utils";

/**
 * A big sidebar launch tile: icon, display title, one-line hint and an arrow, opening another
 * Wadzzo app in a new tab. On hover it lifts and the arrow shoots off (transform-only animation).
 */
function LaunchTile({
  href,
  label,
  title,
  hint,
  icon,
  className,
  onNavigate,
}: {
  href: string;
  label: string;
  title: string;
  hint: string;
  icon: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      aria-label={label}
      className={cn(
        "group blob flex h-14 w-full origin-left items-center gap-3 px-3 transition-transform duration-200 hover:-translate-y-0.5 hover:-rotate-1",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 leading-tight">
        {/* long titles ("Create your brand", brand names) step down so more of them fits */}
        <span
          className={cn(
            "display block truncate",
            title.length <= 11 ? "text-2xl" : title.length <= 15 ? "text-xl" : "text-lg",
          )}
        >
          {title}
        </span>
        <span className="block truncate text-[11px] font-semibold opacity-70">{hint}</span>
      </span>
      <ArrowUpRight
        className="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        strokeWidth={2.8}
      />
    </a>
  );
}

/** "Go to AR": opens the platform's AR web app. It nudges three times after the page loads, then stays still. */
export function ArLaunchButton({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <LaunchTile
      href={platformBranding.urls.arWeb}
      label="Go to the AR app"
      title="Go to AR"
      hint="Collect drops in the real world"
      onNavigate={onNavigate}
      className="bg-side-ink text-side animate-[ar-nudge_0.9s_ease-in-out_1.5s_3]"
      icon={
        <span className="bg-side text-side-ink flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:rotate-90">
          <ScanLine className="size-[18px]" strokeWidth={2.6} />
        </span>
      }
    />
  );
}

/** "Go to Marketplace": opens the fan app, where fans browse, collect and trade the brand's drops. */
export function MarketLaunchButton({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <LaunchTile
      href={platformBranding.urls.fanApp}
      label="Go to the marketplace"
      title="Go to Marketplace"
      hint="Browse, collect and trade"
      onNavigate={onNavigate}
      className="bg-side-mint text-side-ink"
      icon={
        <span className="bg-side-ink text-side flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:-rotate-12">
          <Store className="size-[18px]" strokeWidth={2.4} />
        </span>
      }
    />
  );
}
