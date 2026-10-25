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
    <section
      className={cn(
        "bg-card/95 border-foreground/10 pointer-events-auto hidden w-80 overflow-hidden rounded-[1.4rem] border-2 shadow-lg md:block",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <MapPin className="text-primary size-4" />
        <span className="font-hud text-sm font-semibold">In view</span>
        <span className="bg-surface-2 font-hud rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
          {nearbyPins.length}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground ml-auto size-4 transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="max-h-80 scrollbar-thin overflow-y-auto border-t">
          {nearbyPins.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              No pins in this area. Zoom out or move the map.
            </p>
          ) : (
            <ul className="divide-y">
              {nearbyPins.map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlace({ lat: pin.latitude, lng: pin.longitude })}
                    className="hover:bg-accent flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        pin.locationGroup?.image ??
                        pin.locationGroup?.creator.profileUrl ??
                        "/images/logo.png"
                      }
                      alt=""
                      className="size-9 shrink-0 rounded-lg object-cover"
                      onError={(e) => (e.currentTarget.src = "/images/logo.png")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {pin.locationGroup?.title ?? "Untitled pin"}
                        </span>
                        {pin.locationGroup?.hotspotId && (
                          <span className="bg-primary/10 font-hud text-primary inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                            <Hexagon className="size-2.5" /> Hotspot
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {pin._count.consumers}
                        </span>
                        {pin.locationGroup?.endDate && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Clock className="size-3" /> Ends{" "}
                            {format(new Date(pin.locationGroup.endDate), "MMM d")}
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
