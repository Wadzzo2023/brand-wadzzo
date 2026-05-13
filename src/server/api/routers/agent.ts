// server/routers/agent.ts
import { z } from "zod";
import { publicProcedure, createTRPCRouter } from "../trpc";

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import {
  ALL_TOOLS,
  AGENT_SYSTEM_PROMPT,
  searchViaGooglePlacesExported,
  gapFillNicheViaWebSearch,
} from "~/lib/agent/tools";
import type {
  ChatCreateOutput,
  PinIntent,
  AgentStage,
  AgentResponse,
  Pin,
  MessageRole,
} from "~/lib/agent/types";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"] as const),
  text: z.string(),
});

const IntentSchema = z.object({
  count: z.number().nullable().optional(),
  countSpecified: z.boolean().optional(),
  query: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  areaType: z.enum(["city", "region", "country", "worldwide", "unknown"] as const).optional(),
  confirmed: z.boolean().optional(),
  isNiche: z.boolean().optional(),
});

// ─── New: pin options schema sent with confirm ────────────────────────────────
const PinOptionsSchema = z.object({
  autoCollect: z.boolean().default(false),
  // "per-location" = N pins into N groups (one pin per location)
  // "single-group" = N pins into 1 group
  groupingMode: z.enum(["per-location", "single-group"]).default("per-location"),
});

const ChatCreateInputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  intent: IntentSchema.optional(),
  // Passed only when the user has confirmed (stage === "confirming" → "done")
  pinOptions: PinOptionsSchema.optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLangChainMessages(msgs: { role: MessageRole; text: string }[]): BaseMessage[] {
  return msgs.map(m => {
    if (m.role === "user") return new HumanMessage(m.text);
    if (m.role === "assistant") return new AIMessage(m.text);
    return new SystemMessage(m.text);
  });
}

function parseAgentOutput(raw: string): AgentResponse | null {
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1)) as AgentResponse;
    if (!parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function reformatToJson(rawText: string): Promise<AgentResponse> {
  const SYSTEM = `Convert the message below into one of these JSON shapes. Return ONLY valid JSON, no markdown.

1. {"type":"results","message":"...","searchType":"LANDMARK"|"EVENT","pinCount":N,"confirmPrompt":"Drop N pins?"}
2. {"type":"confirm","message":"...","summary":{"what":"...","where":"...","count":N,"type":"LANDMARK"|"EVENT"}}
3. {"type":"question","message":"...","fields":[{"id":"...","label":"...","inputType":"multiple_choice"|"text"|"number","options":["..."]}]}
4. {"type":"success","message":"...","count":N}
5. {"type":"info","message":"..."}

Rules: no pins array, strip all markdown from message fields.`;

  try {
    const llm = new ChatOpenAI({ model: "gpt-5.4-mini", temperature: 0 });
    const res = await llm.invoke([
      { role: "system", content: SYSTEM },
      { role: "user", content: `Convert:\n\n${rawText.slice(0, 2000)}` },
    ]);
    const text =
      typeof res.content === "string"
        ? res.content
        : Array.isArray(res.content)
          ? res.content
            .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
            .map(b => b.text)
            .join("")
          : "";
    return (
      parseAgentOutput(text) ?? {
        type: "info",
        message: rawText.replace(/[*#`[\]!]/g, "").trim().slice(0, 500),
      }
    );
  } catch {
    return { type: "info", message: "Something went wrong. Please try again." };
  }
}

function stageFromResponse(r: AgentResponse): AgentStage {
  switch (r.type) {
    case "question": return "clarifying";
    case "results": return "confirming";
    case "confirm": return "confirming";
    case "success": return "done";
    default: return "extracting_intent";
  }
}

function mergeIntent(
  response: AgentResponse,
  current: Partial<PinIntent> | undefined,
  actualPinCount?: number
): PinIntent {
  const base: PinIntent = {
    count: current?.count ?? 1,
    countSpecified: current?.countSpecified ?? false,
    query: current?.query ?? null,
    area: current?.area ?? null,
    areaType: current?.areaType ?? "unknown",
    confirmed: current?.confirmed ?? false,
    isNiche: current?.isNiche ?? false,
  };
  if (response.type === "confirm") {
    base.query = response.summary?.what ?? base.query;
    base.area = response.summary?.where ?? base.area;
    base.count = response.summary?.count ?? base.count;
  }
  if (response.type === "results") {
    const pinCount = actualPinCount ?? (response as { pinCount?: number }).pinCount;
    if (pinCount != null) base.count = pinCount;
  }
  if (response.type === "success") {
    base.confirmed = true;
    base.count = response.count ?? base.count;
  }
  return base;
}

// ─── Intent Extractor ─────────────────────────────────────────────────────────

async function extractIntent(
  msgs: { role: string; text: string }[],
  prior: Partial<PinIntent> | undefined
): Promise<PinIntent> {
  const llm = new ChatOpenAI({ model: "gpt-5.4-mini", temperature: 0 });
  const convo = msgs.map(m => `${m.role.toUpperCase()}: ${m.text}`).join("\n");

  const res = await llm.invoke([
    {
      role: "system",
      content: `You are an intent extractor for a map pin-drop assistant.
Read the FULL conversation history and extract the most complete intent.
Return ONLY valid JSON — no markdown, no explanation:
{"query":string|null,"area":string|null,"count":number,"countSpecified":boolean,"areaType":"city"|"region"|"country"|"worldwide"|"unknown","confirmed":boolean}

EXTRACTION RULES:

COUNT + countSpecified:
- count default is 1, countSpecified default is false
- If user gave an EXPLICIT number ("10 museums", "find 5", reply "20") -> count=N, countSpecified=true
- If no number given ("find a museum", "thomas dambo troll", "show me cafes") -> count=1, countSpecified=false
- countSpecified=false means "user didn't say how many" -- the agent will return ALL it finds

QUERY:
- Extract WHAT the user wants to find: "museums", "cafes", "KFC", "hospitals"
- Short replies like "cafe", "museum" after agent asked "what?" -> that is the query
- Typos are fine -- "muesam" = "museum", "resturant" = "restaurant"

AREA:
- Extract WHERE: city, country, region
- Short replies like "dhaka", "bangladesh", "usa" after agent asked "where?" -> that is the area
- If not mentioned -> null (do not assume)
- "anywhere"/"worldwide"/"everywhere"/"find all X anywhere" -> area="worldwide", areaType="worldwide"

CONFIRMED:
- true ONLY if user said "yes", "drop", "confirm", "go ahead", "ok drop"
- Never true on a regular search message

CONTEXT PRIORITY:
- Read ALL messages -- early messages matter as much as recent ones
- A short reply (e.g. "10", "dhaka", "cafe") is always an answer to the agent's last question
- Never discard an already-established field unless user explicitly changes it

PRIOR KNOWN VALUES (fallback if conversation is ambiguous):
query=${prior?.query ?? "null"}, area=${prior?.area ?? "null"}, count=${prior?.count ?? "1"}, countSpecified=${prior?.countSpecified ?? "false"}`,
    },
    { role: "user", content: `Full conversation:\n${convo}` },
  ]);

  const raw =
    typeof res.content === "string"
      ? res.content
      : Array.isArray(res.content)
        ? res.content
          .filter((b): b is { type: "text"; text: string } => (b as { type: string }).type === "text")
          .map(b => b.text)
          .join("")
        : "";

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as PinIntent;
    return {
      count: parsed.count ?? prior?.count ?? 1,
      countSpecified: parsed.countSpecified ?? prior?.countSpecified ?? false,
      query: parsed.query ?? prior?.query ?? null,
      area: parsed.area ?? prior?.area ?? null,
      areaType: parsed.areaType ?? prior?.areaType ?? "unknown",
      confirmed: parsed.confirmed ?? prior?.confirmed ?? false,
      isNiche: prior?.isNiche ?? false,
    };
  } catch {
    return {
      count: prior?.count ?? 1,
      countSpecified: prior?.countSpecified ?? false,
      query: prior?.query ?? null,
      area: prior?.area ?? null,
      areaType: prior?.areaType ?? "unknown",
      confirmed: prior?.confirmed ?? false,
      isNiche: prior?.isNiche ?? false,
    };
  }
}

// ─── Intent Context Builder ───────────────────────────────────────────────────

function buildIntentContext(intent: PinIntent): string {
  const today = new Date().toISOString().split("T")[0]!;
  const currentYear = new Date().getFullYear();
  const totalCount = intent.count ?? 1;
  const countSpecified = intent.countSpecified ?? false;

  const known: string[] = [
    countSpecified ? `count=${totalCount}` : `count=unspecified (return ALL found)`,
  ];
  const missing: string[] = [];

  if (intent.query) known.push(`query="${intent.query}"`);
  else missing.push("query (WHAT to search for)");

  if (intent.area) known.push(`area="${intent.area}"`);

  const countSection =
    countSpecified && totalCount === 1
      ? [
        `COUNT IS 1 (explicitly requested) -- SINGLE PIN MODE. STRICT RULES:`,
        `  * Call web_search ONCE for the query first (MANDATORY).`,
        `  * If isNiche=true or namedLocations non-empty: call geocode_address for the best address.`,
        `  * If isNiche=false: call places_search ONCE with count=1 in ONE city only.`,
        `    - If area is known: use that city/area.`,
        `    - If area is null: pick the single most globally iconic city for this query.`,
        `  * NEVER call city_discovery -- it is FORBIDDEN when count=1.`,
        `  * NEVER call places_search more than once.`,
        `  * Stop after the first result. Return immediately.`,
      ].join("\n")
      : !countSpecified
        ? [
          `COUNT IS UNSPECIFIED -- the user did not give a number.`,
          `  * ALWAYS call web_search first (MANDATORY).`,
          `  * Return ALL locations the agent finds -- do not limit results artificially.`,
          `  * If web_search returns isNiche=true or non-empty namedLocations:`,
          `    → geocode ALL named locations in parallel (niche path).`,
          `    → Do NOT call places_search or city_discovery.`,
          `  * If web_search returns isNiche=false and empty namedLocations:`,
          `    → Use places_search per city. Do NOT use city_discovery on top of a worldwide web_search result.`,
        ].join("\n")
        : (() => {
          const numCities = Math.ceil(totalCount / 5);
          const perCityBase = Math.ceil(totalCount / numCities);
          const perCityBuffered = perCityBase * 2;
          return [
            `COUNT RULE: User wants exactly ${totalCount} pin(s) TOTAL across all cities.`,
            ``,
            `MANDATORY: Call web_search("${intent.query ?? ""}") FIRST before anything else.`,
            ``,
            `IF web_search returns isNiche=true OR namedLocations.length > 0 (NICHE PATH):`,
            `  → Call geocode_address for EACH named location in parallel.`,
            `  → If total < ${totalCount} after geocoding all known locations:`,
            `    → Call web_search again asking for more locations not already found.`,
            `    → Geocode the new addresses returned.`,
            `    → Repeat until ${totalCount} reached or no new locations found.`,
            `  → NEVER call places_search or city_discovery for niche queries.`,
            ``,
            `IF web_search returns isNiche=false AND namedLocations is empty (CHAIN PATH):`,
            `  Distribution: ${numCities} cities × ${perCityBuffered} pins requested each (2x buffer; router caps to ${totalCount}).`,
            `  ${intent.area
              ? `Area is known ("${intent.area}") -- do NOT call city_discovery. Use places_search per district/area directly.`
              : `Area is broad -- call city_discovery(limit=${numCities}) first, then places_search(count=${perCityBuffered}) per city.`
            }`,
            `  GAP-FILL (chain): search additional cities not yet covered.`,
          ].join("\n");
        })();

  return [
    `\n\n[SESSION]`,
    `Today: ${today} | Year: ${currentYear}`,
    ``,
    `KNOWN (do NOT ask user for these again): ${known.join(", ")}`,
    missing.length
      ? `MISSING (ask user for ONLY these): ${missing.join(", ")}`
      : `ALL PARAMS KNOWN -- proceed to search immediately. Do not ask any questions.`,
    ``,
    countSection,
    ``,
    `OUTPUT RULES:`,
    `  * Never include a pins array in your JSON response`,
    `  * Never ask for count -- it is always known (unspecified = return all)`,
    `  * Never ask for area -- search a sensible default if not provided`,
    `  * Only ask if query (WHAT) is genuinely unknown`,
    ``,
    `Results shape: {"type":"results","message":"Found N X in Y","searchType":"LANDMARK","pinCount":N,"confirmPrompt":"Drop N pin(s)?"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Gap-fill helper ──────────────────────────────────────────────────────────

async function gapFillPins(
  current: Pin[],
  target: number,
  query: string,
  alreadySearchedCities: string[],
  area: string | null,
  isNiche: boolean
): Promise<Pin[]> {
  const gap = target - current.length;
  if (gap <= 0) return current;

  console.log(`[gapFill] Need ${gap} more pins. isNiche=${isNiche}. Already searched: ${alreadySearchedCities.join(", ")}`);

  if (isNiche) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY ?? "";
    const alreadyFoundNames = current.map(p => p.title);
    const seenIds = new Set(current.map(p => p.id));
    const combined = [...current];

    for (let round = 0; round < 3 && combined.length < target; round++) {
      const stillNeeded = target - combined.length;
      const newPins = await gapFillNicheViaWebSearch(query, alreadyFoundNames, stillNeeded, apiKey);

      if (newPins.length === 0) {
        console.log(`[gapFill] Niche gap-fill round ${round + 1} returned 0 — stopping`);
        break;
      }

      for (const pin of newPins) {
        if (combined.length >= target) break;
        if (!seenIds.has(pin.id)) {
          seenIds.add(pin.id);
          alreadyFoundNames.push(pin.title);
          combined.push(pin);
        }
      }
      console.log(`[gapFill] Niche round ${round + 1}: now have ${combined.length}/${target}`);
    }

    console.log(`[gapFill] After niche gap-fill: ${combined.length} pins (target was ${target})`);
    return combined;
  }

  const seenIds = new Set(current.map((p) => p.id));
  const combined = [...current];

  const regionForDiscovery = area ?? "worldwide";
  const llm = new ChatOpenAI({ model: "gpt-5.4-mini", temperature: 0 });
  const cityRes = await llm.invoke([{
    role: "user",
    content:
      `List ${Math.ceil(gap / 5) + alreadySearchedCities.length} major cities in "${regionForDiscovery}". ` +
      `Return ONLY: {"cities":["City1","City2"]}`,
  }]);
  const cityText = typeof cityRes.content === "string" ? cityRes.content : "";
  let allCities: string[] = [];
  try {
    const parsed = JSON.parse(cityText.replace(/```json|```/g, "").trim()) as { cities: string[] };
    allCities = parsed.cities ?? [];
  } catch {
    console.warn("[gapFill] Could not parse city list");
    return combined;
  }

  const searchedSet = new Set(alreadySearchedCities.map((c) => c.toLowerCase()));
  const newCities = allCities.filter((c) => !searchedSet.has(c.toLowerCase()));
  const perCity = Math.ceil(gap / Math.max(newCities.length, 1)) * 2;

  console.log(`[gapFill] Searching ${newCities.length} new cities, ${perCity} per city`);

  const results = await Promise.all(
    newCities.map((city) =>
      searchViaGooglePlacesExported(query, city, perCity).catch(() => [] as Pin[])
    )
  );

  for (const cityPins of results) {
    for (const pin of cityPins) {
      if (combined.length >= target) break;
      if (!seenIds.has(pin.id)) {
        seenIds.add(pin.id);
        combined.push(pin);
      }
    }
    if (combined.length >= target) break;
  }

  console.log(`[gapFill] After chain gap-fill: ${combined.length} pins (target was ${target})`);
  return combined;
}

// ─── Detect isNiche from agent tool calls ────────────────────────────────────

function detectIsNicheFromMessages(messages: BaseMessage[]): boolean {
  for (const msg of messages) {
    if (msg._getType() !== "tool") continue;
    try {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const parsed = JSON.parse(content) as {
        isNiche?: boolean;
        namedLocations?: unknown[];
      };
      if (parsed.isNiche === true) return true;
      if (Array.isArray(parsed.namedLocations) && parsed.namedLocations.length > 0) return true;
    } catch {
      // not a JSON tool response — skip
    }
  }
  return false;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const agentRouter = createTRPCRouter({
  create: publicProcedure
    .input(ChatCreateInputSchema)
    .mutation(async ({ input }): Promise<ChatCreateOutput> => {
      const { messages, intent: currentIntent, pinOptions } = input;

      // ── 1. Extract intent from full conversation ─────────────────────────
      const intent = await extractIntent(messages, currentIntent);
      console.log("[agentRouter] Input intent:", intent);

      // ── 2. Build system prompt with injected intent context ──────────────
      const systemPrompt = AGENT_SYSTEM_PROMPT + buildIntentContext(intent);

      // ── 3. Invoke agent ──────────────────────────────────────────────────
      const agent = createAgent({
        model: new ChatOpenAI({ model: "gpt-5.4-mini", temperature: 0.2 }),
        tools: [...ALL_TOOLS],
        systemPrompt,
        name: "pin_drop_agent",
      });

      const result = await agent.invoke({
        messages: toLangChainMessages(messages),
      });
      console.log("result:", result.messages);
      console.log(
        "[agentRouter] Message types:",
        result.messages.map(m => m._getType())
      );

      // ── 4. Extract pins + track which cities were searched ───────────────
      const responsePins: Pin[] = [];
      const searchedCities: string[] = [];

      for (const msg of result.messages) {
        if (msg._getType() !== "tool") continue;

        try {
          const toolInput = (msg as unknown as { name?: string; additional_kwargs?: { tool_input?: string } })
            .additional_kwargs?.tool_input;
          if (toolInput) {
            const parsed = JSON.parse(toolInput) as { city?: string };
            if (parsed.city) searchedCities.push(parsed.city);
          }
        } catch { /* ignore */ }

        try {
          const parsed = JSON.parse(msg.content as string) as {
            pins?: Pin[];
            total?: number;
          };
          if (Array.isArray(parsed.pins) && parsed.pins.length > 0) {
            responsePins.push(...parsed.pins);
            (msg as unknown as { content: string }).content = JSON.stringify({
              total: parsed.pins.length,
              message: `Found ${parsed.pins.length} pins.`,
            });
          }
        } catch {
          /* not a pin result -- skip */
        }
      }

      // ── 5. Detect isNiche from agent's web_search response ───────────────
      const isNiche = detectIsNicheFromMessages(result.messages) || (intent.isNiche ?? false);
      console.log(`[agentRouter] isNiche=${isNiche}`);

      // ── 6. Cap or gap-fill based on countSpecified ───────────────────────
      let cappedPins: Pin[];

      if (!intent.countSpecified || intent.count == null) {
        cappedPins = responsePins;
        console.log(
          `[agentRouter] Unspecified count — returning all ${cappedPins.length} pins`
        );
      } else {
        const target = intent.count;

        if (responsePins.length >= target) {
          cappedPins = responsePins.slice(0, target);
          console.log(
            `[agentRouter] Have ${responsePins.length} pins, capping to ${target}`
          );
        } else {
          console.log(
            `[agentRouter] Gap detected: have ${responsePins.length}/${target} — attempting gap-fill (isNiche=${isNiche})`
          );
          const filled = await gapFillPins(
            responsePins,
            target,
            intent.query ?? "",
            searchedCities,
            intent.area ?? null,
            isNiche
          );
          cappedPins = filled.slice(0, target);
          console.log(
            `[agentRouter] After gap-fill: ${cappedPins.length}/${target} pins`
          );
        }
      }

      console.log(
        `[agentRouter] Extracted ${responsePins.length} raw pins → returning ${cappedPins.length} (countSpecified=${intent.countSpecified ?? false})`
      );

      // ── 7. Parse agent final response ────────────────────────────────────
      const lastMsg = result.messages.at(-1);
      const rawOutput =
        typeof lastMsg?.content === "string"
          ? lastMsg.content
          : JSON.stringify(lastMsg?.content ?? "");

      let agentResponse = parseAgentOutput(rawOutput);
      if (!agentResponse) {
        console.warn(
          "[agentRouter] Non-JSON output, reformatting...",
          rawOutput.slice(0, 200)
        );
        agentResponse = await reformatToJson(rawOutput);
      }

      // ── 8. Guard: results with 0 actual pins -> info ─────────────────────
      if (agentResponse.type === "results" && cappedPins.length === 0) {
        console.warn("[agentRouter] Agent claimed results but 0 pins extracted");
        agentResponse = {
          type: "info",
          message: `No locations found for "${intent.query}" in "${intent.area ?? "worldwide"}". Try a different search.`,
        };
      }

      if (agentResponse.type === "results" && cappedPins.length > 0) {
        (agentResponse as Record<string, unknown>).pinCount = cappedPins.length;
        agentResponse.message = agentResponse.message?.replace(/\d+/, String(cappedPins.length));
        if ((agentResponse as Record<string, unknown>).confirmPrompt) {
          (agentResponse as Record<string, unknown>).confirmPrompt =
            `Drop these ${cappedPins.length} pins?`;
        }
      }

      // ── 9. Apply pinOptions when the user confirms ────────────────────────
      // pinOptions is sent by the frontend when the user clicks "Confirm" after
      // choosing autoCollect and groupingMode on the results screen.
      // We apply those settings to each pin before persisting.
      if (pinOptions && cappedPins.length > 0) {
        const { autoCollect, groupingMode } = pinOptions;
        console.log(`[agentRouter] Applying pinOptions: autoCollect=${autoCollect}, groupingMode=${groupingMode}`);

        cappedPins = cappedPins.map((pin, idx) => ({
          ...pin,
          autoCollect,
          // "per-location": each pin is its own collection group (pinNumber = index)
          // "single-group": all pins share the same group (pinNumber = 1)
          pinNumber: groupingMode === "single-group" ? 1 : idx + 1,
          // Keep pinCollectionLimit as-is; callers may override per use-case
        }));
      }

      // ── 10. Build output intent and return ───────────────────────────────
      const outputIntent = mergeIntent(
        agentResponse,
        { ...intent, isNiche },
        cappedPins.length > 0 ? cappedPins.length : undefined
      );
      console.log("[agentRouter] Output intent:", outputIntent);

      return {
        reply: JSON.stringify(agentResponse),
        stage: stageFromResponse(agentResponse),
        intent: outputIntent,
        questions:
          agentResponse.type === "question" ? agentResponse.fields : undefined,
        pins: cappedPins.length > 0 ? cappedPins : undefined,
        // ── NEW: surface default pin options on the results stage ──────────
        // The frontend uses these as initial values for the two UI questions.
        pinOptions: agentResponse.type === "results"
          ? { autoCollect: false, groupingMode: "per-location" }
          : undefined,
      };
    }),
});