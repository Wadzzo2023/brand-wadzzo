"use client";

import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";

import { cn } from "~/lib/utils";

export type PinMarkerState = {
  expired: boolean;
  /** No collections left (limit used up). */
  empty: boolean;
  approved: boolean;
  /** Turned down in review (approved === false). */
  rejected?: boolean;
  hidden: boolean;
  autoCollect: boolean;
};

export type PinLook = "hidden" | "expired" | "review" | "rejected" | "collected" | "active";

/**
 * One visual language for pins on every portal map (and the same opacities
 * as the fan app): the first matching state wins.
 *
 *   expired            40%  grey border
 *   in review/rejected 60%  amber / red border
 *   collected          80%  blue border   (no collections left)
 *   active            100%  green border  (with a soft pulse)
 *
 * Shape tells how fans collect it: round = tap to collect, square = auto-collect.
 */
export function pinLook(s: PinMarkerState): PinLook {
  if (s.hidden) return "hidden";
  if (s.expired) return "expired";
  if (s.rejected) return "rejected";
  if (!s.approved) return "review";
  if (s.empty) return "collected";
  return "active";
}

export const PIN_LOOK: Record<PinLook, { label: string; opacity: string; border: string }> = {
  active: { label: "Active", opacity: "opacity-100", border: "border-primary" },
  collected: {
    label: "All collected",
    opacity: "opacity-80",
    border: "border-info",
  },
  review: {
    label: "In review",
    opacity: "opacity-60",
    border: "border-warning",
  },
  rejected: {
    label: "Rejected",
    opacity: "opacity-60",
    border: "border-destructive",
  },
  expired: {
    label: "Expired",
    opacity: "opacity-40",
    border: "border-muted-foreground/60",
  },
  hidden: {
    label: "Deleted",
    opacity: "opacity-40",
    border: "border-dashed border-destructive",
  },
};

/** A brand's pin on the map: its image (or type icon), styled by state, with how many fans collected it. */
export const PinMarker = memo(function PinMarker({
  lat,
  lng,
  image,
  icon: Icon,
  state,
  count,
  selected,
  onClick,
  label,
}: {
  lat: number;
  lng: number;
  image?: string | null;
  icon: LucideIcon;
  state: PinMarkerState;
  count: number;
  selected?: boolean;
  onClick?: () => void;
  label: string;
}) {
  const look = pinLook(state);
  const style = PIN_LOOK[look];
  const square = state.autoCollect;
  const outer = square ? "rounded-md" : "rounded-full";
  const inner = square ? "rounded-[4px]" : "rounded-full";
  return (
    <Marker
      latitude={lat}
      longitude={lng}
      anchor="center"
      onClick={(e) => (e.originalEvent.stopPropagation(), onClick?.())}
    >
      <button
        type="button"
        aria-label={`${label} — ${style.label}, ${square ? "auto-collect" : "tap to collect"}`}
        title={`${label} · ${style.label} · ${square ? "Auto-collect" : "Tap to collect"}`}
        className={cn(
          "bg-card relative flex size-11 items-center justify-center border-[2.5px] p-0.5 shadow-md transition-transform hover:scale-110 hover:opacity-100",
          outer,
          style.border,
          style.opacity,
          look === "expired" && "grayscale",
          selected && "ring-primary/40 scale-110 opacity-100 ring-4",
        )}
      >
        {look === "active" && (
          <span
            className={cn("border-primary/40 absolute -inset-[2.5px] animate-ping border-2", outer)}
            aria-hidden
          />
        )}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className={cn("relative size-full object-cover", inner)} />
        ) : (
          <span
            className={cn(
              "bg-surface-2 relative flex size-full items-center justify-center",
              inner,
            )}
          >
            <Icon className="text-muted-foreground size-5" />
          </span>
        )}
        {count > 0 && (
          <span className="bg-primary font-hud text-primary-foreground absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </Marker>
  );
});

/** Key for the marker styles, shown on the maps. */
export function PinLegend({ className }: { className?: string }) {
  const looks: PinLook[] = ["active", "collected", "review", "rejected", "expired"];
  return (
    <div
      className={cn(
        "bg-card/95 border-foreground/10 pointer-events-auto rounded-[1.4rem] border-2 p-2.5 text-[11px] shadow-sm",
        className,
      )}
    >
      <ul className="space-y-1">
        {looks.map((l) => (
          <li key={l} className={cn("flex items-center gap-2", PIN_LOOK[l].opacity)}>
            <span
              className={cn("bg-card size-3 rounded-full border-2", PIN_LOOK[l].border)}
              aria-hidden
            />
            {PIN_LOOK[l].label}
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground mt-2 flex items-center gap-3 border-t pt-2">
        <span className="flex items-center gap-1.5">
          <span className="border-foreground/60 size-3 rounded-full border-2" aria-hidden /> Tap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-foreground/60 size-3 rounded-[3px] border-2" aria-hidden /> Auto
        </span>
      </div>
    </div>
  );
}
