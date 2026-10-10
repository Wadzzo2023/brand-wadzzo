"use client";

import { Check, Loader2, MapPinned, Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";

import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";
import { areaBounds, toMapboxArea, type AreaFeature } from "~/components/map-kit/geo";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { cn } from "~/lib/utils";

import { AreaSearch } from "./area-search";

export type Area = { name: string; feature: AreaFeature };

const SAVED = "#6366f1";
const NEW = "#f59e0b";
const OTHER = "#64748b";

function fit(map: MapRef | null, features: (AreaFeature | null | undefined)[], top: number, duration = 0) {
  const bounds = areaBounds(features);
  if (map && bounds) map.fitBounds(bounds, { padding: { top, bottom: 30, left: 30, right: 30 }, duration });
}

/**
 * See, and change, a home area. Two clear modes:
 *  • viewing — a status line says which area is in use (this one, the fallback
 *    such as the platform default, or none) and the map shows just that;
 *  • changing — find a place by name or draw one; the new area is previewed in
 *    its own colour as "not saved yet" until Save.
 */
export function HomeAreaEditor({
  current,
  fallback,
  onSave,
  removeLabel,
  emptyText,
}: {
  /** The area saved at this level, if any. */
  current: Area | null;
  /** What's used when nothing is saved here, e.g. the platform default for a brand. */
  fallback?: { area: Area; label: string } | null;
  /** Resolves once saved (null removes the area). */
  onSave: (area: Area | null) => Promise<unknown>;
  removeLabel: string;
  emptyText: string;
}) {
  const map = useRef<MapRef>(null);
  const [editing, setEditing] = useState(!current && !fallback);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Area | null>(null);
  const [saving, setSaving] = useState<"save" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const inUse = current ?? fallback?.area ?? null;

  const layers = useMemo(
    () => ({
      // While changing, the area in use is only a dashed reference.
      inUse: toMapboxArea(inUse?.feature),
      draft: toMapboxArea(draft?.feature),
    }),
    [inUse, draft],
  );

  const top = editing ? 90 : 30;
  const onLoad = useCallback(() => fit(map.current, [inUse?.feature], top), [inUse, top]);
  useEffect(() => fit(map.current, [draft?.feature], 90, 700), [draft]);

  const stopEditing = () => {
    setEditing(false);
    setDrawing(false);
    setDraft(null);
    fit(map.current, [inUse?.feature], 30, 500);
  };

  const save = async (area: Area | null) => {
    setSaving(area ? "save" : "remove");
    try {
      await onSave(area);
      setDraft(null);
      setEditing(!area && !fallback);
      setConfirmRemove(false);
    } catch {
      // The page shows the error; keep the draft so nothing is lost.
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* What's in use right now. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", inUse ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <MapPinned className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{inUse ? inUse.name : "No home area yet"}</p>
          <p className="text-xs text-muted-foreground">{current ? "Saved · the assistant searches here by default" : fallback ? fallback.label : emptyText}</p>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {current ? "Change area" : "Set your own"}
            </Button>
            {current &&
              (confirmRemove ? (
                <>
                  <Button size="sm" variant="destructive" disabled={saving !== null} onClick={() => void save(null)}>
                    {saving === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />} {removeLabel}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                  <Trash2 /> Remove
                </Button>
              ))}
          </div>
        )}
      </div>

      <div className="relative h-[460px] overflow-hidden rounded-xl border">
        <BaseMap ref={map} initialViewState={WORLD_VIEW} onLoad={onLoad} cursor={drawing ? "crosshair" : "grab"}>
          {layers.inUse && !drawing && (
            <Source id="home-in-use" type="geojson" data={layers.inUse}>
              {!editing && <Layer id="home-in-use-fill" type="fill" paint={{ "fill-color": SAVED, "fill-opacity": 0.12 }} />}
              <Layer
                id="home-in-use-line"
                type="line"
                paint={editing ? { "line-color": OTHER, "line-width": 1.5, "line-dasharray": [2, 2] } : { "line-color": SAVED, "line-width": 2 }}
              />
            </Source>
          )}
          {layers.draft && !drawing && (
            <Source id="home-draft" type="geojson" data={layers.draft}>
              <Layer id="home-draft-fill" type="fill" paint={{ "fill-color": NEW, "fill-opacity": 0.18 }} />
              <Layer id="home-draft-line" type="line" paint={{ "line-color": NEW, "line-width": 2.5 }} />
            </Source>
          )}
          {drawing && (
            <DrawTool
              title="Draw your home area"
              minZoom={0}
              warnAboveMetres={Infinity}
              onDone={(feature) => {
                setDraft({ name: draft?.name ?? "", feature });
                setDrawing(false);
              }}
              onCancel={() => setDrawing(false)}
            />
          )}
        </BaseMap>

        {editing && !drawing && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
            <AreaSearch className="pointer-events-auto w-full sm:w-96" onPick={setDraft} />
            <Button className="pointer-events-auto ml-auto shadow-sm" variant="outline" onClick={() => setDrawing(true)}>
              <Pencil /> Draw instead
            </Button>
          </div>
        )}

        {/* Legend while comparing. */}
        {editing && !drawing && (draft ?? inUse) && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg border bg-card/95 px-2.5 py-1.5 text-[11px] shadow-sm">
            {draft && (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm border-2" style={{ borderColor: NEW, background: `${NEW}40` }} /> New area · not saved yet
              </span>
            )}
            {inUse && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-4 border-t-2 border-dashed" style={{ borderColor: OTHER }} /> In use now
              </span>
            )}
          </div>
        )}
      </div>

      {/* Saving a change. */}
      {editing && !drawing && (
        <div className={cn("flex flex-wrap items-end gap-2 rounded-xl border p-3", draft ? "border-warning/40 bg-warning/5" : "bg-card")}>
          {draft ? (
            <>
              <label className="min-w-56 flex-1 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Clinton County, IA" maxLength={80} />
              </label>
              <Button disabled={saving !== null || draft.name.trim().length < 2} onClick={() => void save({ ...draft, name: draft.name.trim() })}>
                {saving === "save" ? <Loader2 className="animate-spin" /> : <Check />} Save as home area
              </Button>
            </>
          ) : (
            <p className="flex-1 self-center text-sm text-muted-foreground">Search for your county, city or country on the map, or draw the area.</p>
          )}
          {(inUse ?? draft) && (
            <Button variant="ghost" disabled={saving !== null} onClick={stopEditing}>
              <X /> Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
