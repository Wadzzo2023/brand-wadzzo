// tools.ts
// ─── LangChain Tool Definitions for the PinDrop Agent ────────────────────────
import { tool } from "@langchain/core/tools"; // FIX: was "langchain" (wrong package)
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { Pin, CityDiscoveryResult } from "~/lib/agent/types"; // FIX: replaced broken CityDiscoveryToolOutput
import pLimit from "p-limit"; // FIX: added proper p-limit package for concurrency control
// ─────────────────────────────────────────────────────────────────────────────
// Google API response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface GooglePlaceResult {
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  geometry?: { location?: { lat: number; lng: number } };
  photos?: Array<{ photo_reference: string }>;
  types?: string[];
  rating?: number;
  place_id?: string;
}

interface GooglePlacesResponse {
  results?: GooglePlaceResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    geometry?: {
      bounds?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
      viewport?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
      location?: { lat: number; lng: number };
    };
  }>;
}

interface CityBounds {
  lat: number;
  lng: number;
  latDelta: number;
  lngDelta: number;
}

interface GridCell {
  location: string;
}

// Raw event shape returned by the event search LLM
interface RawEventResult {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
  image?: string;
  venue?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache — FIX: added eviction so the Map doesn't grow unbounded
// Events are intentionally NOT cached (time-sensitive data)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200; // FIX: cap to prevent memory leak
const cache = new Map<string, { value: unknown; expires: number }>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expires) cache.delete(key);
  }
  // If still over limit after eviction, remove oldest entries
  if (cache.size > MAX_CACHE_ENTRIES) {
    const keys = Array.from(cache.keys());
    for (let i = 0; i < cache.size - MAX_CACHE_ENTRIES; i++) {
      cache.delete(keys[i]);
    }
  }
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key); // FIX: delete on stale read, not just skip
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T): T {
  evictExpired(); // FIX: evict on every write
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}




// ─────────────────────────────────────────────────────────────────────────────
// Concurrency limiter — FIX: replaced custom pLimit with proper p-limit package
// Install: npm install p-limit
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function hundredYearsFromNow(): string {
  return new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

// FIX: validate that a date string is in the future
function isFutureDate(dateStr: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(todayString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Map Google Place → Pin (LANDMARK)
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC_GOOGLE_TYPES = new Set([
  "point_of_interest", "establishment", "premise", "political",
  "locality", "sublocality", "sublocality_level_1", "country",
  "administrative_area_level_1", "administrative_area_level_2",
  "neighborhood", "colloquial_area",
]);

function formatGoogleType(type: string): string {
  return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function mapPlaceToPin(place: GooglePlaceResult, index: number, apiKey: string): Pin | null {
  // FIX: return null for missing coordinates instead of silently using 0,0
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (lat === undefined || lng === undefined) {
    console.warn(`[mapPlaceToPin] Skipping "${place.name}" — missing coordinates`);
    return null;
  }

  const photoRef = place.photos?.[0]?.photo_reference;
  const address = place.formatted_address ?? place.vicinity;
  const category =
    place.types
      ?.filter((t) => !GENERIC_GOOGLE_TYPES.has(t))
      .map(formatGoogleType)
      .find(Boolean) ?? "Place";

  return {
    id: place.place_id ?? `pin_${index}`,
    type: "LANDMARK",
    title: place.name ?? `Location ${index}`,
    description: address ?? "Location",
    latitude: lat,
    longitude: lng,
    startDate: todayString(),
    endDate: hundredYearsFromNow(),
    pinCollectionLimit: 999999,
    pinNumber: 1,
    radius: 2,
    autoCollect: false,
    category,
    address,
    url: place.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
      : undefined,
    image: photoRef
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`
      : undefined,
    metadata: {
      rating: place.rating,
      googleMapsUrl: place.place_id
        ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
        : undefined,
    },
  };
}

// FIX: new function — map raw event data → Pin (EVENT type with real dates)
function mapEventToPin(event: RawEventResult, index: number): Pin | null {
  // Validate required fields
  if (!event.title) return null;
  if (!event.startDate || !event.endDate) return null;
  if (!isFutureDate(event.startDate)) return null; // FIX: skip past events
  if (!isFutureDate(event.endDate)) return null; // FIX: endDate must also be in the future
  if (new Date(event.endDate) < new Date(event.startDate)) return null; // FIX: endDate must not be before startDate
  if (event.latitude === undefined || event.longitude === undefined) return null;

  return {
    id: `event_${index}_${Date.now()}`,
    type: "EVENT",
    title: event.title,
    description: event.description ?? event.venue ?? "Event",
    latitude: event.latitude,
    longitude: event.longitude,
    startDate: event.startDate,
    endDate: event.endDate,
    url: event.url,
    image: event.image,
    pinCollectionLimit: 999999,
    pinNumber: 1,
    radius: 2,
    autoCollect: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocode area → bounding box
// ─────────────────────────────────────────────────────────────────────────────

function isValidBounds(b: CityBounds): boolean {
  return (
    b.lat >= -90 && b.lat <= 90 &&
    b.lng >= -180 && b.lng <= 180 &&
    b.latDelta > 0 && b.lngDelta > 0 &&
    b.latDelta <= 180 && b.lngDelta <= 180
  );
}

async function getCityBounds(area: string, apiKey: string): Promise<CityBounds | null> {
  const cacheKey = `bounds:${area}`;
  const cached = getCached<CityBounds>(cacheKey);
  if (cached) return cached;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.append("address", area);
    url.searchParams.append("key", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as GoogleGeocodeResponse;

    if (data.status !== "OK" || !data.results?.[0]) return null;

    const geo = data.results[0].geometry!;
    const box = geo.bounds ?? geo.viewport;

    let bounds: CityBounds;
    if (box) {
      bounds = {
        lat: (box.northeast.lat + box.southwest.lat) / 2,
        lng: (box.northeast.lng + box.southwest.lng) / 2,
        latDelta: Math.abs(box.northeast.lat - box.southwest.lat),
        lngDelta: Math.abs(box.northeast.lng - box.southwest.lng),
      };
    } else {
      bounds = { lat: geo.location!.lat, lng: geo.location!.lng, latDelta: 0.18, lngDelta: 0.18 };
    }

    if (!isValidBounds(bounds)) {
      if (geo.location) {
        bounds = { lat: geo.location.lat, lng: geo.location.lng, latDelta: 0.18, lngDelta: 0.18 };
      } else {
        return null;
      }
    }

    return setCached(cacheKey, bounds);
  } catch (error) {
    console.error("[getCityBounds] failed:", error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid cells — FIX: raised MAX_GRID_SIZE and added count warning
// ─────────────────────────────────────────────────────────────────────────────

const UNIQUE_YIELD_PER_CELL = 15;
const MAX_GRID_SIZE = 20; // FIX: was 10 — allows up to 400 cells = 6,000 results per city

function buildGridCells(bounds: CityBounds, count: number): GridCell[] {
  const cellsNeeded = Math.ceil(count / UNIQUE_YIELD_PER_CELL);
  const rawGridSize = Math.ceil(Math.sqrt(cellsNeeded));
  const gridSize = Math.min(rawGridSize, MAX_GRID_SIZE);

  // FIX: warn when grid can't reach the requested count
  const maxYield = gridSize * gridSize * UNIQUE_YIELD_PER_CELL;
  if (maxYield < count) {
    console.warn(
      `[buildGridCells] Grid can yield at most ${maxYield} results but ${count} were requested. ` +
      `Use multi-city search via city_discovery to reach this count.`
    );
  }

  const cellLatDelta = bounds.latDelta / gridSize;
  const cellLngDelta = bounds.lngDelta / gridSize;
  const cells: GridCell[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cellLat = bounds.lat - bounds.latDelta / 2 + (row + 0.5) * cellLatDelta;
      const cellLng = bounds.lng - bounds.lngDelta / 2 + (col + 0.5) * cellLngDelta;
      cells.push({ location: `${cellLat.toFixed(6)},${cellLng.toFixed(6)}` });
    }
  }

  console.log(`[buildGridCells] ${gridSize}×${gridSize} (${cells.length} cells) for count=${count}`);
  return cells;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch one page — Google Places Text Search
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOnePage(
  keyword: string,
  apiKey: string,
  pageToken?: string,
  cell?: GridCell
): Promise<{ results: Pin[]; nextPageToken?: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.append("key", apiKey);

  if (pageToken) {
    url.searchParams.append("pagetoken", pageToken);
  } else {
    url.searchParams.append("query", keyword);
    if (cell?.location) {
      url.searchParams.append("location", cell.location);
      url.searchParams.append("radius", "50000");
    }
  }

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  const data = (await response.json()) as GooglePlacesResponse;

  if (data.status === "ZERO_RESULTS") return { results: [] };
  if (data.status !== "OK") {
    console.warn(`[fetchOnePage] status: ${data.status}`, data.error_message ?? "");
    return { results: [] };
  }

  const apiKey2 = apiKey; // closure for mapPlaceToPin
  const results = (data.results ?? [])
    .map((p, i) => mapPlaceToPin(p, i, apiKey2))
    .filter((p): p is Pin => p !== null); // FIX: filter out null (missing coords)

  return { results, nextPageToken: data.next_page_token };
}

// ─────────────────────────────────────────────────────────────────────────────
// Drain all 3 pages for one grid cell
// FIX: retry with exponential backoff instead of fixed 2s delay
// ─────────────────────────────────────────────────────────────────────────────

async function drainCell(keyword: string, apiKey: string, cell: GridCell | undefined): Promise<Pin[]> {
  const collected: Pin[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 3; page++) {
    if (pageToken) {
      // FIX: exponential backoff — 2s, 4s, 8s — Google needs time to prepare page tokens
      let delay = 2000;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, delay));
        try {
          const { results, nextPageToken } = await fetchOnePage(keyword, apiKey, pageToken, cell);
          if (results.length > 0 || !nextPageToken) {
            collected.push(...results);
            pageToken = nextPageToken;
            break;
          }
        } catch {
          // token not ready yet — retry
        }
        delay *= 2;
      }
    } else {
      try {
        const { results, nextPageToken } = await fetchOnePage(keyword, apiKey, undefined, cell);
        console.log(`[drainCell] Page ${page + 1} @ ${cell?.location ?? "global"}: ${results.length}`);
        collected.push(...results);
        if (!nextPageToken) break;
        pageToken = nextPageToken;
      } catch (error) {
        console.error(`[drainCell] Page ${page + 1} failed:`, error);
        break;
      }
    }
  }

  return collected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Google Places search — FIX: uses real p-limit
// ─────────────────────────────────────────────────────────────────────────────

const CELL_CONCURRENCY = 5;

async function searchViaGooglePlaces(query: string, area: string, count: number): Promise<Pin[]> {
  const cacheKey = `places:${query}:${area}:${count}`;
  const cached = getCached<Pin[]>(cacheKey);
  if (cached) {
    console.log(`[searchViaGooglePlaces] Cache hit: ${cached.length} results`);
    return cached;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY;
  if (!apiKey) {
    console.warn("[searchViaGooglePlaces] NEXT_PUBLIC_GOOGLE_MAP_API_KEY not set");
    return [];
  }

  const bounds = await getCityBounds(area, apiKey);
  const cells: Array<GridCell | undefined> = bounds ? buildGridCells(bounds, count) : [undefined];

  const limit = pLimit(CELL_CONCURRENCY); // FIX: real p-limit
  const batches = await Promise.all(
    cells.map((cell) =>
      limit(async () => {
        try {
          return await drainCell(query, apiKey, cell);
        } catch {
          return [] as Pin[];
        }
      })
    )
  );

  const seenIds = new Set<string>();
  const allResults: Pin[] = [];

  for (const batch of batches) {
    for (const item of batch) {
      if (allResults.length >= count) break;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allResults.push(item);
      }
    }
    if (allResults.length >= count) break;
  }

  const finalResults = allResults.slice(0, count);
  return setCached(cacheKey, finalResults);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Web Search
// ─────────────────────────────────────────────────────────────────────────────

export const webSearchTool = tool(
  async ({ query }): Promise<string> => {
    console.log("[webSearchTool]", query);
    try {
      const llm = new ChatOpenAI({ model: "gpt-4o" }).bindTools([
        { type: "web_search_preview" } as never,
      ]);
      const response = await llm.invoke([
        {
          role: "system",
          content:
            "You are a research assistant. Always respond with ONLY a valid JSON object " +
            "(no markdown, no extra text) in this exact shape: " +
            '{ "canonicalName": string, "category": string, "knownRegions": string[], ' +
            '"searchHint": string, "singleLocation": { "address": string, "city": string, ' +
            '"latitude": number, "longitude": number } | null }'
        },
        { role: "user", content: query },
      ]);
      const text =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
            ? response.content
              .filter((b): b is { type: "text"; text: string } => b.type === "text")
              .map((b) => b.text)
              .join("\n")
            : "";
      return text || JSON.stringify({ results: [] });
    } catch (error) {
      console.error("[webSearchTool] failed:", error);
      return JSON.stringify({ results: [] });
    }
  },
  {
    name: "web_search",
    description:
      "Research a WHAT target before any search. Always call this first to resolve: " +
      "canonicalName (the correct search term), category (place or event type), " +
      "knownRegions (array of countries/cities where it actually exists), " +
      "searchHint (best keyword to pass to places_search or event_search). " +
      "Respond with a JSON object: { canonicalName, category, knownRegions, searchHint }.",
    schema: z.object({
      query: z.string().describe("Natural language search query"),
    }),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Event Search — FIX: new tool, was completely missing
// Does NOT use cache — event data is time-sensitive
// ─────────────────────────────────────────────────────────────────────────────

export const eventSearchTool = tool(
  async ({ query, city, count = 20 }): Promise<string> => {
    console.log("[eventSearchTool]", { query, city, count });
    const today = todayString();

    try {
      const llm = new ChatOpenAI({ model: "gpt-4o" }).bindTools([
        { type: "web_search_preview" } as never,
      ]);

      const prompt =
        `Find up to ${count} upcoming future events for "${query}" in or near "${city}" after ${today}. ` +
        `Return ONLY a valid JSON array (no markdown, no extra text) like: ` +
        `[{"title":"...","description":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD",` +
        `"latitude":0.0,"longitude":0.0,"url":"...","image":"...","venue":"..."}]. ` +
        `CRITICAL: EVERY event MUST have latitude and longitude (not null, not missing). ` +
        `Only include events with startDate >= ${today}. If coordinates are unavailable, OMIT that event completely.`;

      const response = await llm.invoke([{ role: "user", content: prompt }]);

      const raw =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
            ? response.content
              .filter((b): b is { type: "text"; text: string } => b.type === "text")
              .map((b) => b.text)
              .join("\n")
            : "";

      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as RawEventResult[];

      // FIX: filter past events even if the LLM slipped one through
      const pins = parsed
        .map((e, i) => mapEventToPin(e, i))
        .filter((p): p is Pin => p !== null);

      console.log(`[eventSearchTool] ${pins.length} future event pins for "${query}" in "${city}"`);
      return JSON.stringify({ pins, total: pins.length });
    } catch (error) {
      console.error("[eventSearchTool] failed:", error);
      return JSON.stringify({ pins: [], message: "Event search failed." });
    }
  },
  {
    name: "event_search",
    description:
      "Search for upcoming FUTURE events (concerts, festivals, markets, sports, shows) in a specific city. " +
      "Returns structured event pin data with real start/end dates. Never returns past events. " +
      "Do NOT cache results — always fetches fresh data.",
    schema: z.object({
      query: z.string().describe("Event name or type (e.g. 'Thomas Bambo Troll', 'music festivals')"),
      city: z.string().describe("A specific city name"),
      count: z.number().optional().default(20).describe("Max number of event pins to return"),
    }),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: City Discovery — FIX: consistent model, higher default limit, proper type
// ─────────────────────────────────────────────────────────────────────────────

export const cityDiscoveryTool = tool(
  async ({ region, limit = 20 }): Promise<string> => { // FIX: default was 10
    const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }); // FIX: was gpt-4o-mini (inconsistent)

    const response = await llm.invoke([
      {
        role: "user",
        content:
          `List the top ${limit} most populous and geographically diverse cities in "${region}". ` +
          `Return ONLY a valid JSON object: {"cities":["City1","City2"]}. No markdown, no extra text.`,
      },
    ]);

    try {
      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      const clean = text.replace(/```json|```/g, "").trim();

      // FIX: use proper CityDiscoveryResult type, no hacky Record cast
      const parsed = JSON.parse(clean) as CityDiscoveryResult;
      const cities: string[] = Array.isArray(parsed)
        ? (parsed as unknown as string[])
        : parsed.cities ?? [];

      return JSON.stringify({ cities: cities.slice(0, limit) });
    } catch {
      return JSON.stringify({ cities: [] });
    }
  },
  {
    name: "city_discovery",
    description:
      "Get major cities for a broad region (country, continent, 'worldwide'). " +
      "Call this before places_search or event_search when WHERE is not a specific city. " +
      "For large pin counts (100+) use limit=30 or higher.",
    schema: z.object({
      region: z.string().describe("Country, continent, or broad scope like 'worldwide'"),
      limit: z.number().optional().default(20).describe("How many cities to return — use 30+ for large pin counts"), // FIX: was 10
    }),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Places Search
// ─────────────────────────────────────────────────────────────────────────────

export const placesSearchTool = tool(
  async ({ query, city, count = 20 }): Promise<string> => {
    console.log("[placesSearchTool]", { query, city, count });
    const pins = await searchViaGooglePlaces(query, city, count);

    if (pins.length === 0) {
      return JSON.stringify({
        pins: [],
        message: `No results found for "${query}" in "${city}".`,
      });
    }

    return JSON.stringify({ pins, total: pins.length });
  },
  {
    name: "places_search",
    description:
      "Search Google Places for LANDMARK locations matching a keyword in a SPECIFIC city. " +
      "Always pass a single city name — never a broad region like 'US' or 'Europe'.",
    schema: z.object({
      query: z.string().describe("What to search for"),
      city: z.string().describe("A specific city name"),
      count: z.number().optional().default(20).describe("How many pins to return"),
    }),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Drop Pins
// ─────────────────────────────────────────────────────────────────────────────

export const dropPinsTool = tool(
  async ({ pins }): Promise<string> => {
    console.log(`[dropPinsTool] Saving ${pins.length} pins`);
    // TODO: replace with real database write
    return JSON.stringify({ saved: pins.length, status: "ok" });
  },
  {
    name: "drop_pins",
    description:
      "Persist confirmed pins into the database. Call ONLY after explicit user confirmation.",
    schema: z.object({
      pins: z.array(z.record(z.unknown())).describe("Confirmed pins to save"),
    }),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// All tools export
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_TOOLS = [
  webSearchTool,
  cityDiscoveryTool,
  placesSearchTool,
  eventSearchTool, // FIX: was missing from exports
  dropPinsTool,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Agent System Prompt
// FIX: rewrote to fix question logic, add event detection, future-only filter,
//      structured response format with typed UI blocks
// ─────────────────────────────────────────────────────────────────────────────
export const AGENT_SYSTEM_PROMPT = `You are a location-based pin-drop agent embedded in a mapping platform. Your job is to help users find and drop location pins into a database through a smart, efficient conversation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every response MUST be a valid JSON object. Never return plain text, markdown, or any other format.
If you are unsure what to respond, return type "info". Never return anything outside these 5 structures.

1. QUESTION (ask the user something):
{
  "type": "question",
  "message": "Short friendly message explaining what you need",
  "fields": [
    {
      "id": "field_id",
      "label": "Field label",
      "inputType": "multiple_choice" | "text" | "number",
      "options": ["Option A", "Option B"],
      "placeholder": "e.g. New York"
    }
  ]
}

2. RESULTS (show found pins before confirming):
{
  "type": "results",
  "message": "Summary of what was found",
  "searchType": "EVENT" | "LANDMARK" | "MIXED",
  "pins": [ ...pin objects... ],
  "confirmPrompt": "Drop these X pins?"
}

3. CONFIRM (ask final confirmation before dropping):
{
  "type": "confirm",
  "message": "Ready to drop X pins",
  "summary": {
    "what": "...",
    "where": "...",
    "count": 0,
    "type": "LANDMARK" | "EVENT" | "MIXED"
  },
  "pins": [ ...pin objects... ]
}

4. SUCCESS (after drop_pins):
{
  "type": "success",
  "message": "Successfully dropped X pins!",
  "count": 0
}

5. INFO (error, nothing found, or general message):
{
  "type": "info",
  "message": "Plain informational text"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY EXECUTION ORDER — NEVER SKIP STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every search request MUST follow this exact order. No exceptions. No shortcuts.

STEP 1 → COLLECT PARAMETERS
  Extract WHAT, WHERE, HOW MANY from the user message.
  - WHAT: anything the user wants to find
  - WHERE: city, country, region, or scope like "worldwide"
  - HOW MANY: number of pins. Default to 20 if not given.
  If WHAT is missing → respond with type "question" asking for it.
  If WHERE is missing → respond with type "question" asking for it.
  Never proceed to STEP 2 until both WHAT and WHERE are known.

STEP 2 → CALL web_search
  Call web_search with just the WHAT term. Short query only.
  Example: WHAT="KFC" → web_search("KFC")
  Example: WHAT="jazz festivals" → web_search("jazz festivals")
  web_search MUST return this JSON shape:
  {
    "canonicalName": "short common name",
    "category": "type of place or event",
    "knownRegions": ["country1", "country2"],
    "searchHint": "reasoning only — never passed to other tools",
    "singleLocation": { "address": "...", "city": "...", "latitude": 0.0, "longitude": 0.0 } | null
  }
  Store canonicalName, category, knownRegions, singleLocation from this result.
  Never proceed to STEP 3 without completing this step.

STEP 3 → DECIDE PIN TYPE
  Use category from STEP 2:
  - Contains "event", "festival", "concert", "show", "market" → use event_search
  - Contains "place", "restaurant", "store", "museum", "landmark", "chain" → use places_search
  - Ambiguous → respond with type "question" asking user to choose EVENT or LANDMARK
  Never guess from the user's raw words. Always use category from web_search.

STEP 4 → CALL city_discovery
  This step is MANDATORY. You MUST call city_discovery before any places_search or event_search.
  Calling places_search or event_search without first calling city_discovery in this request is FORBIDDEN.
  
  Rules:
  - If WHERE is a specific city (e.g. "New York") → skip city_discovery, use that city directly in STEP 5
  - If WHERE is a country, region, or vague ("anywhere", "worldwide"):
      → If knownRegions from STEP 2 is specific → city_discovery(region="country1,country2", limit=30)
      → If knownRegions is worldwide or unclear → city_discovery(region="worldwide", limit=30)
  
  Never self-generate a city list. Never hardcode cities.
  The only cities you may search are: the specific city from WHERE, or cities returned by city_discovery.

STEP 5 → CALL places_search OR event_search
  Rules:
  - query = canonicalName from STEP 2. Use ONLY canonicalName. Never use full formal names.
    Example: canonicalName="KFC" → query="KFC". Never "Kentucky Fried Chicken".
    Example: canonicalName="Starbucks" → query="Starbucks". Never "Starbucks Coffee Company".
  - city = each city from city_discovery result (or the specific city if WHERE was specific)
  - count per city = Math.max(5, Math.ceil(totalCount / numberOfCities))
  - Run all city searches in parallel.
  - Each city is searched EXACTLY ONCE. Never search the same city twice in one request.
  - If singleLocation from STEP 2 is not null AND places_search returns 0 results:
      → Build pin directly from singleLocation data. Do not retry.
  - If all cities return 0 results AND singleLocation is null:
      → Respond with type "info". Do not retry. Do not search again.

STEP 6 → RESPOND WITH RESULTS
  Collect all pins from STEP 5.
  Respond with type "results" containing all found pins.
  Never respond with plain text. Never respond with markdown.
  Always include the full pin objects in the response.

STEP 7 → CONFIRM THEN DROP
  After user confirms → respond with type "confirm".
  After explicit user approval → call drop_pins → respond with type "success".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIN SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every pin object must include all of these fields:
{
  "id": "place_id or generated string",
  "type": "LANDMARK" or "EVENT",
  "title": "place name",
  "description": "address or description",
  "latitude": 0.0,
  "longitude": 0.0,
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "url": "google maps url or event url if available",
  "image": "image url if available",
  "pinCollectionLimit": 999999,
  "pinNumber": 1,
  "radius": 2,
  "autoCollect": false
}

LANDMARK dates: startDate = today, endDate = 100 years from today.
EVENT dates: real future dates only. Discard any event where startDate is before today.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COUNT DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When distributing pins across multiple cities:
- Minimum 5 pins per city always.
- count per city = Math.max(5, Math.ceil(totalCount / numberOfCities))
- If this gives more cities than needed, use fewer cities.
  Example: 10 pins total, 30 cities → use 2 cities at 5 each.
  Example: 60 pins total, 30 cities → use 12 cities at 5 each.
  Example: 100 pins total, 20 cities → use 20 cities at 5 each.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In all error cases, respond with type "info". Never plain text. Never markdown.
- Tool call fails → { "type": "info", "message": "Search failed, please try again." }
- 0 results found → { "type": "info", "message": "Nothing found for X in Y. Try a different term or location." }
- Past events only → { "type": "info", "message": "No upcoming events found. Try a different city or date range." }
- Any unexpected state → { "type": "info", "message": "Something went wrong. Please try again." }`;