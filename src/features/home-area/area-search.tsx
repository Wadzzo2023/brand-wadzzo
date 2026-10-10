"use client";

import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useState } from "react";

import type { AreaFeature } from "~/components/map-kit/geo";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/utils/api";

type Match = RouterOutputs["homeArea"]["findPlaces"][number];

/** "Clinton County, Iowa, United States" → "Clinton County, Iowa". */
const shortName = (label: string) => label.split(",").slice(0, 2).join(",").trim();

/**
 * Find a place's real outline by name — a city, county, state or country — from
 * OpenStreetMap, on the map itself. Enter shows the best match's outline right
 * away; the other matches stay listed to switch with one click. (The service
 * doesn't allow search-as-you-type, so it searches on Enter.)
 */
export function AreaSearch({ onPick, className }: { onPick: (area: { name: string; feature: AreaFeature }) => void; className?: string }) {
  const utils = api.useUtils();
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  /** "search", or the id of the match whose outline is loading. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const show = async (m: Match) => {
    setBusy(m.id);
    setError(null);
    try {
      const feature = await utils.homeArea.outline.fetch({ id: m.id, spanDeg: m.spanDeg }, { staleTime: Infinity });
      setChosen(m.id);
      onPick({ name: shortName(m.label), feature });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that outline");
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    const query = text.trim();
    if (query.length < 2) return;
    setBusy("search");
    setError(null);
    setChosen(null);
    try {
      const found = await utils.homeArea.findPlaces.fetch({ query }, { staleTime: Infinity });
      setMatches(found);
      setOpen(found.length > 1);
      if (found[0]) await show(found[0]);
      else {
        setError(`No areas found for “${query}”. Add the state or country, or draw it.`);
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setBusy(null);
    }
  };

  const others = matches?.length ?? 0;

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card shadow-md", className)}>
      <form
        className="flex h-11 items-center gap-2 px-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <Search className="size-4 shrink-0 text-muted-foreground" />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search a county, city or country…"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Find your area by name"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setText("");
              setMatches(null);
              setError(null);
            }}
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={text.trim().length < 2 || busy !== null}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {error && <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>}

      {others > 1 && (
        <div className="border-t">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            {open ? "Hide matches" : `Not the right one? ${others - 1} other match${others > 2 ? "es" : ""}`}
            <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <ul className="max-h-60 overflow-y-auto border-t">
              {matches!.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void show(m)}
                    className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-60", chosen === m.id && "bg-primary/5")}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {busy === m.id ? <Loader2 className="size-3.5 animate-spin" /> : chosen === m.id ? <Check className="size-3.5 text-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.label}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">{m.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {matches && (
        <p className="border-t px-3 py-1 text-[10px] text-muted-foreground">
          Outlines ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
            OpenStreetMap contributors
          </a>
        </p>
      )}
    </div>
  );
}
