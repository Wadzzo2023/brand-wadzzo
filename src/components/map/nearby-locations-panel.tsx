"use client";

import { format } from "date-fns";
import { ChevronDown, Clock, Hexagon, MapPin, Users } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "~/lib/utils";
import { useNearbyPinsStore } from "~/store/map-stores";

/**
 * "In view": the pins inside the visible map area (desktop). Click one to fly
 * to it. Collapsible so it never covers what you're looking at.
 */
export const NearbyLocationsPanel = memo(function NearbyLocationsPanel({
  onSelectPlace,
  className,
}: {
  onSelectPlace: (coords: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const { nearbyPins } = useNearbyPinsStore();
  const [open, setOpen] = useState(true);
  return (
    <section className={cn("pointer-events-auto hidden w-80 overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur-sm md:block", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <MapPin className="size-4 text-primary" />
        <span className="font-hud text-sm font-semibold">In view</span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-hud text-xs font-semibold tabular-nums">{nearbyPins.length}</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="max-h-80 overflow-y-auto border-t scrollbar-thin">
          {nearbyPins.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No pins in this area. Zoom out or move the map.</p>
          ) : (
            <ul className="divide-y">
              {nearbyPins.map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace({ lat: pin.latitude, lng: pin.longitude })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pin.locationGroup?.image ?? pin.locationGroup?.creator.profileUrl ?? "/images/logo.png"}
                      alt=""
                      className="size-9 shrink-0 rounded-lg object-cover"
                      onError={(e) => (e.currentTarget.src = "/images/logo.png")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{pin.locationGroup?.title ?? "Untitled pin"}</span>
                        {pin.locationGroup?.hotspotId && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 font-hud text-[10px] font-semibold uppercase text-primary">
                            <Hexagon className="size-2.5" /> Hotspot
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {pin._count.consumers}
                        </span>
                        {pin.locationGroup?.endDate && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Clock className="size-3" /> Ends {format(new Date(pin.locationGroup.endDate), "MMM d")}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
});
