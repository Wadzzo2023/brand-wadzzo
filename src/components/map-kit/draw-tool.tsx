"use client";

import { Check, Circle, Hexagon, RectangleHorizontal, Undo2, X, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/mapbox";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { cn } from "~/lib/utils";

import { PlaceSearch } from "./place-search";
import { circleFeature, haversineMetres, polygonFeature, rectangleFeature, toMapboxFeature, type DrawShape, type LatLng, type StoredFeature } from "./geo";

/** Smaller than this is almost certainly a mis-click, not a hotspot. */
const MIN_SPAN_M = 10;
/** Bigger than this spreads pins very thin — allowed, but worth a warning. */
const LARGE_SPAN_M = 50_000;
/** Below this zoom a click can land kilometres off: ask to zoom in first. */
const MIN_DRAW_ZOOM = 9;
/** Pixel threshold to snap to or click on the start vertex to close a polygon. */
const SNAP_THRESHOLD_PX = 28;

function span(points: LatLng[]) {
  let max = 0;
  for (const a of points) for (const b of points) max = Math.max(max, haversineMetres(a, b));
  return max;
}

const SHAPES: { id: DrawShape; label: string; icon: typeof Hexagon; hint: [string, string] }[] = [
  {
    id: "polygon",
    label: "Polygon",
    icon: Hexagon,
    hint: [
      "Click to place the first corner",
      "Keep clicking to add corners · click the green starting point or 'Finish' to close",
    ],
  },
  {
    id: "rectangle",
    label: "Rectangle",
    icon: RectangleHorizontal,
    hint: ["Click one corner", "Click opposite corner · then click 'Finish'"],
  },
  {
    id: "circle",
    label: "Circle",
    icon: Circle,
    hint: ["Click the centre", "Click to set the radius · then click 'Finish'"],
  },
];

/**
 * Draw a hotspot area on a BaseMap (render it as a child of the map).
 * Emits the portal's stored feature format (see geo.ts) with its shape.
 */
export function DrawTool({
  onDone,
  onCancel,
  initialShape = "polygon",
}: {
  onDone: (feature: StoredFeature, shape: DrawShape) => void;
  onCancel: () => void;
  initialShape?: DrawShape;
}) {
  const { current: map } = useMap();
  const [shape, setShape] = useState<DrawShape>(initialShape);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [hover, setHover] = useState<LatLng | null>(null);
  const [zoom, setZoom] = useState(() => {
    try {
      return map?.getZoom() ?? 0;
    } catch {
      return 0;
    }
  });
  const tooFar = zoom < MIN_DRAW_ZOOM;
  const pointsRef = useRef(points);
  const doneRef = useRef(onDone);

  const feature = useMemo<StoredFeature | null>(() => {
    const pts = hover && ((shape === "polygon" && points.length >= 1) || (shape !== "polygon" && points.length === 1)) ? [...points, hover] : points;
    if (shape === "polygon" && pts.length >= 3) return polygonFeature(pts);
    if (shape === "rectangle" && pts.length >= 2) return rectangleFeature(pts[0]!, pts[1]!);
    if (shape === "circle" && pts.length >= 2) return circleFeature(pts[0]!, pts[pts.length - 1]!);
    return null;
  }, [points, hover, shape]);

  const enough = (shape === "polygon" && points.length >= 3) || (shape !== "polygon" && points.length >= 2);
  const extent = enough ? span(points) : 0;
  const tooSmall = enough && extent < MIN_SPAN_M;
  const large = extent > LARGE_SPAN_M;
  const complete = enough && !tooSmall;

  const finish = () => {
    if (!complete) return;
    const f = shape === "polygon" ? polygonFeature(points) : shape === "rectangle" ? rectangleFeature(points[0]!, points[1]!) : circleFeature(points[0]!, points[1]!);
    onDone(f, shape);
  };
  const finishRef = useRef(finish);
  const cancelRef = useRef(onCancel);

  useEffect(() => {
    pointsRef.current = points;
    doneRef.current = onDone;
    finishRef.current = finish;
    cancelRef.current = onCancel;
  });

  // Esc cancels, Enter finishes, Backspace / ⌘Z undoes the last point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "Escape") cancelRef.current();
      else if (e.key === "Enter") finishRef.current();
      else if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setPoints((p) => p.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!map) return;
    const m = map.getMap();
    const canvas = m.getCanvas();
    m.doubleClickZoom.disable();

    const updateCursor = () => {
      const z = m.getZoom();
      if (z < MIN_DRAW_ZOOM) {
        canvas.style.cursor = "zoom-in";
      } else {
        canvas.style.cursor = "crosshair";
      }
    };

    const updateZoom = () => {
      setZoom(m.getZoom());
      updateCursor();
    };

    updateZoom();

    const click = (e: mapboxgl.MapMouseEvent) => {
      if (m.getZoom() < MIN_DRAW_ZOOM) {
        m.flyTo({
          center: [e.lngLat.lng, e.lngLat.lat],
          zoom: 14,
          duration: 650,
        });
        toast(
          pointsRef.current.length === 0
            ? "Zoomed in to drawing level — click now to start drawing"
            : "Zoomed in to drawing level — click to continue placing corners",
          { icon: "🔍", id: "draw-zoom-in" }
        );
        return;
      }

      // When drawing a polygon with >= 3 points, clicking near the start point finishes the polygon
      if (shape === "polygon" && pointsRef.current.length >= 3) {
        const start = pointsRef.current[0]!;
        const startPt = m.project([start.lng, start.lat]);
        const distPx = Math.hypot(startPt.x - e.point.x, startPt.y - e.point.y);
        if (distPx <= SNAP_THRESHOLD_PX) {
          const pts = pointsRef.current;
          if (span(pts) >= MIN_SPAN_M) {
            doneRef.current(polygonFeature(pts), "polygon");
            return;
          }
        }
      }

      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      setPoints((prev) => {
        if (shape !== "polygon" && prev.length >= 2) return [p];
        return [...prev, p];
      });
    };

    const move = (e: mapboxgl.MapMouseEvent) => {
      if (m.getZoom() < MIN_DRAW_ZOOM) {
        canvas.style.cursor = "zoom-in";
        setHover(null);
        return;
      }

      // Snap to start point when close
      if (shape === "polygon" && pointsRef.current.length >= 3) {
        const start = pointsRef.current[0]!;
        const startPt = m.project([start.lng, start.lat]);
        const distPx = Math.hypot(startPt.x - e.point.x, startPt.y - e.point.y);
        if (distPx <= SNAP_THRESHOLD_PX) {
          setHover(start);
          canvas.style.cursor = "pointer";
          return;
        }
      }
      canvas.style.cursor = "crosshair";
      setHover({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };

    // Double-click finishes a polygon
    const dbl = (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault();
      const pts = pointsRef.current.slice(0, -1);
      setPoints(pts);
      if (shape === "polygon" && pts.length >= 3 && span(pts) >= MIN_SPAN_M) {
        doneRef.current(polygonFeature(pts), "polygon");
      }
    };

    m.on("zoom", updateZoom);
    m.on("zoomend", updateZoom);
    m.on("click", click);
    m.on("mousemove", move);
    m.on("dblclick", dbl);
    return () => {
      canvas.style.cursor = "";
      m.doubleClickZoom.enable();
      m.off("zoom", updateZoom);
      m.off("zoomend", updateZoom);
      m.off("click", click);
      m.off("mousemove", move);
      m.off("dblclick", dbl);
    };
  }, [map, shape]);

  const drawn = feature ? toMapboxFeature(feature) : null;
  const vertices = {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
  const info = SHAPES.find((s) => s.id === shape)!;

  return (
    <>
      {drawn && (
        <Source id="draw-shape" type="geojson" data={drawn}>
          <Layer id="draw-fill" type="fill" paint={{ "fill-color": "#22c55e", "fill-opacity": 0.18 }} />
          <Layer id="draw-line" type="line" paint={{ "line-color": "#16a34a", "line-width": 2, "line-dasharray": [2, 1] }} />
        </Source>
      )}
      <Source id="draw-points" type="geojson" data={vertices}>
        <Layer id="draw-vertex" type="circle" paint={{ "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#16a34a", "circle-stroke-width": 2 }} />
      </Source>

      {/* Start vertex finish target: visible when polygon has at least 3 points */}
      {shape === "polygon" && points.length >= 3 && points[0] && (
        <Marker
          latitude={points[0].lat}
          longitude={points[0].lng}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            finish();
          }}
        >
          <div className="group relative flex cursor-pointer items-center justify-center">
            {/* Animated glowing beacon */}
            <span className="absolute -inset-2.5 animate-ping rounded-full bg-success/40" />

            {/* Target button */}
            <button
              type="button"
              className="relative flex size-7 items-center justify-center rounded-full border-2 border-white bg-success text-white shadow-xl transition-transform hover:scale-125 focus:outline-hidden"
              title="Click here to complete area"
            >
              <Check className="size-4 stroke-[3]" />
            </button>

            {/* Floating prompt badge */}
            <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-success px-2 py-0.5 font-hud text-[11px] font-semibold text-white shadow-lg animate-bounce">
              Click to finish
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-success" />
            </div>
          </div>
        </Marker>
      )}

      {/* Top Floating Controls */}
      <div className="absolute left-1/2 top-3 z-20 w-[min(92%,440px)] -translate-x-1/2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <p className="font-hud text-sm font-semibold">Draw hotspot area</p>
          <div className="ml-auto flex gap-1 rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Shape">
            {SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={shape === s.id}
                onClick={() => {
                  setShape(s.id);
                  setPoints([]);
                }}
                className={cn("flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium", shape === s.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                title={s.label}
              >
                <s.icon className="size-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {points.length === 0 && (
          <PlaceSearch
            className="mt-3"
            placeholder="Jump to a place"
            onSelect={(p) => map?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(15, map.getZoom()), duration: 700 })}
          />
        )}

        {tooFar ? (
          <div className="mt-3 flex items-center justify-between gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
            <div className="flex items-center gap-2">
              <ZoomIn className="size-4 shrink-0 text-warning" />
              <span>
                Map is zoomed out. Click anywhere on the map or click <strong>Zoom In</strong> to start drawing.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 border-warning/30 bg-card text-xs hover:bg-warning/15"
              onClick={() => {
                const target = points[0] ?? map?.getCenter();
                if (target) {
                  map?.flyTo({ center: [target.lng, target.lat], zoom: 14, duration: 600 });
                }
              }}
            >
              <ZoomIn className="mr-1 size-3.5" />
              Zoom in
            </Button>
          </div>
        ) : (
          <p className={cn("mt-2 text-xs", tooSmall ? "text-destructive" : large ? "text-warning" : "text-muted-foreground")}>
            {tooSmall
              ? `That's under ${MIN_SPAN_M} m across — make the area bigger.`
              : large
                ? `That's about ${Math.round(extent / 1000)} km across — pins will be spread very thin. Sure?`
                : info.hint[points.length === 0 ? 0 : 1]}
          </p>
        )}

        <p className="mt-1 hidden text-[11px] text-faint sm:block">
          Click start point or Finish to close · Esc cancel · Backspace undo
        </p>

        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="size-4" /> Cancel
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
            <Undo2 className="size-4" /> Undo
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(
              "ml-auto transition-all",
              complete && "bg-success hover:bg-success text-white shadow-md ring-2 ring-success/50"
            )}
            disabled={!complete}
            onClick={finish}
          >
            <Check className="size-4" /> Finish area
          </Button>
        </div>
      </div>

      {/* Floating zoom hint pill when zoomed too far out */}
      {tooFar && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 flex items-center gap-2 rounded-full border border-warning/30 bg-card/95 px-4 py-2 text-xs font-medium text-warning shadow-xl backdrop-blur-md animate-pulse">
          <ZoomIn className="size-4 text-warning" />
          <span>Click anywhere on the map to zoom in &amp; start drawing</span>
        </div>
      )}
    </>
  );
}
