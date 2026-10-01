"use client";

import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";

import { cn } from "~/lib/utils";

export type PinMarkerState = { expired: boolean; empty: boolean; approved: boolean; hidden: boolean; autoCollect: boolean };

/**
 * A brand's pin on the map: its image (or type icon), square for
 * auto-collect / round for manual, a pulse while live, dimmed + greyscale
 * when expired, empty or unapproved, dashed red when hidden, and a badge with
 * how many fans collected it.
 */
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
  const inactive = state.expired || state.empty || !state.approved;
  const live = !inactive && !state.hidden;
  const shape = state.autoCollect ? "rounded-lg" : "rounded-full";
  return (
    <Marker latitude={lat} longitude={lng} anchor="center" onClick={(e) => (e.originalEvent.stopPropagation(), onClick?.())}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "relative flex size-11 items-center justify-center bg-card p-0.5 shadow-md transition-transform hover:scale-110",
          shape,
          state.hidden ? "border-2 border-dashed border-destructive opacity-50" : state.approved ? "ring-2 ring-primary" : "ring-2 ring-line-bright",
          inactive && !state.hidden && "opacity-60 grayscale",
          selected && "scale-110 ring-4 ring-primary/60",
        )}
      >
        {live && <span className={cn("absolute inset-0 animate-ping bg-primary/25", shape)} aria-hidden />}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className={cn("relative size-full object-cover", shape)} />
        ) : (
          <span className={cn("relative flex size-full items-center justify-center bg-surface-2", shape)}>
            <Icon className="size-5 text-muted-foreground" />
          </span>
        )}
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-hud text-[10px] font-bold text-primary-foreground shadow">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </Marker>
  );
});
