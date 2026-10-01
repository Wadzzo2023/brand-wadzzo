"use client";

import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { env } from "~/env";
import { cn } from "~/lib/utils";

import { parseCoordinates, type LatLng } from "./geo";

export type Place = LatLng & { name: string; address?: string };

type GeocodeFeature = {
  properties: { name?: string; full_address?: string; place_formatted?: string; coordinates: { latitude: number; longitude: number } };
};

/**
 * Place search on Mapbox geocoding (replaces Google Places). Typing a
 * coordinate pair ("23.81, 90.41") jumps straight to it. Arrow keys + Enter
 * pick a suggestion.
 */
export function PlaceSearch({
  onSelect,
  placeholder = "Search a place or paste coordinates",
  className,
  proximity,
}: {
  onSelect: (place: Place) => void;
  placeholder?: string;
  className?: string;
  /** Bias results near here (e.g. the map centre). */
  proximity?: LatLng;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const coords = parseCoordinates(q);

  useEffect(() => {
    if (coords || q.trim().length < 3) return; // nothing to look up (results are hidden below)
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.searchParams.set("q", q.trim());
      url.searchParams.set("limit", "6");
      url.searchParams.set("access_token", env.NEXT_PUBLIC_MAPBOX_API);
      url.searchParams.set("proximity", proximity ? `${proximity.lng},${proximity.lat}` : "ip");
      fetch(url, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ features?: GeocodeFeature[] }>)
        .then((d) => {
          setResults(
            (d.features ?? []).map((f) => ({
              name: f.properties.name ?? f.properties.full_address ?? "Place",
              address: f.properties.place_formatted ?? f.properties.full_address,
              lat: f.properties.coordinates.latitude,
              lng: f.properties.coordinates.longitude,
            })),
          );
          setActive(0);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const options: Place[] = coords ? [{ ...coords, name: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, address: "Coordinates" }] : q.trim().length < 3 ? [] : results;
  const choose = (p: Place) => {
    onSelect(p);
    setQ(p.name);
    setOpen(false);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <div className="flex h-10 items-center gap-2 rounded-lg border bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!options.length) return;
            if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    }
            else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    }
            else if (e.key === "Enter") {
      e.preventDefault();
      choose(options[active]!);
    }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {q && !loading && (
          <button type="button" onClick={() => (setQ(""), setResults([]))} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {options.map((p, i) => (
            <li key={`${p.lat},${p.lng},${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left", i === active && "bg-accent")}
              >
                {coords ? <Crosshair className="mt-0.5 size-4 shrink-0 text-primary" /> : <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  {p.address && <span className="block truncate text-xs text-muted-foreground">{p.address}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
