import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import type {
    PinIntent,
    AgentStage,
    AgentResponse,
    Pin,
    MessageRole,
    PinOptions,
} from "../../src/lib/agent/types.js";
import {
    ALL_TOOLS,
    AGENT_SYSTEM_PROMPT,
    searchViaGooglePlacesExported,
    gapFillNicheViaWebSearch,
} from "../../src/lib/agent/pin-drop-tools.js";

// ─── LangChain helpers ────────────────────────────────────────────────────────

export function toLangChainMessages(msgs: { role: MessageRole; text: string }[]): BaseMessage[] {
    return msgs.map((m) => {
        if (m.role === "user") return new HumanMessage(m.text);
        if (m.role === "assistant") return new AIMessage(m.text);
        return new SystemMessage(m.text);
    });
}

export function parseAgentOutput(raw: string): AgentResponse | null {
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

export async function reformatToJson(rawText: string): Promise<AgentResponse> {
    const SYSTEM = `Convert the message below into one of these JSON shapes. Return ONLY valid JSON, no markdown.
1. {"type":"results","message":"...","searchType":"LANDMARK"|"EVENT","pinCount":N,"confirmPrompt":"Drop N pins?"}
2. {"type":"confirm","message":"...","summary":{"what":"...","where":"...","count":N,"type":"LANDMARK"|"EVENT"}}
3. {"type":"question","message":"...","fields":[{"id":"...","label":"...","inputType":"multiple_choice"|"text"|"number","options":["..."]}]}
4. {"type":"success","message":"...","count":N}
5. {"type":"info","message":"..."}
Rules: no pins array, strip all markdown from message fields.`;
    try {
        const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
        const res = await llm.invoke([
            { role: "system", content: SYSTEM },
            { role: "user", content: `Convert:\n\n${rawText.slice(0, 2000)}` },
        ]);
        const text = typeof res.content === "string" ? res.content : "";
        return parseAgentOutput(text) ?? { type: "info", message: rawText.replace(/[*#`[\]!]/g, "").trim().slice(0, 500) };
    } catch {
        return { type: "info", message: "Something went wrong. Please try again." };
    }
}

export function stageFromResponse(r: AgentResponse): AgentStage {
    switch (r.type) {
        case "question": return "clarifying";
        case "results": return "confirming";
        case "confirm": return "confirming";
        case "success": return "done";
        default: return "extracting_intent";
    }
}

export function mergeIntent(
    response: AgentResponse,
    current: Partial<PinIntent> | null | undefined,
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

export async function extractIntent(
    msgs: { role: string; text: string }[],
    prior: Partial<PinIntent> | null | undefined
): Promise<PinIntent> {
    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
    const convo = msgs.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n");

    const res = await llm.invoke([
        {
            role: "system",
            content: `You are an intent extractor for a map pin-drop assistant.
Return ONLY valid JSON — no markdown:
{"query":string|null,"area":string|null,"count":number,"countSpecified":boolean,"areaType":"city"|"region"|"country"|"worldwide"|"unknown","confirmed":boolean}

RULES:
- count default 1, countSpecified default false
- Explicit number → countSpecified=true
- confirmed=true ONLY if user said "yes"/"drop"/"confirm"
- PRIOR: query=${prior?.query ?? "null"}, area=${prior?.area ?? "null"}, count=${prior?.count ?? 1}, countSpecified=${prior?.countSpecified ?? false}`,
        },
        { role: "user", content: `Full conversation:\n${convo}` },
    ]);

    const raw = typeof res.content === "string" ? res.content : "";

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

export function buildIntentContext(intent: PinIntent): string {
    const today = new Date().toISOString().split("T")[0]!;
    const totalCount = intent.count ?? 1;
    const countSpecified = intent.countSpecified ?? false;

    const known: string[] = [
        countSpecified ? `count=${totalCount}` : `count=unspecified (return ALL found)`,
    ];
    const missing: string[] = [];

    if (intent.query) known.push(`query="${intent.query}"`);
    else missing.push("query (WHAT to search for)");
    if (intent.area) known.push(`area="${intent.area}"`);

    const countSection = !countSpecified
        ? `COUNT IS UNSPECIFIED — return ALL locations found.`
        : totalCount === 1
            ? `COUNT IS 1 — SINGLE PIN MODE. One web_search, one places_search or geocode_address. Stop immediately.`
            : (() => {
                const numCities = Math.ceil(totalCount / 5);
                const perCityBuffered = Math.ceil(totalCount / numCities) * 2;
                return [
                    `COUNT RULE: User wants exactly ${totalCount} pins TOTAL.`,
                    `Call web_search("${intent.query ?? ""}") FIRST.`,
                    `If isNiche=true → geocode_address per namedLocation.`,
                    `If detectedCountry set → country_city_search(query, country, ${totalCount}).`,
                    `Else → ${numCities} cities × ${perCityBuffered} each (2x buffer), capped to ${totalCount}.`,
                ].join("\n");
            })();

    return [
        `\n\n[SESSION]`,
        `Today: ${today}`,
        `KNOWN: ${known.join(", ")}`,
        missing.length ? `MISSING: ${missing.join(", ")}` : `ALL PARAMS KNOWN — proceed immediately.`,
        ``,
        countSection,
        ``,
        `OUTPUT RULES:`,
        `  * Never include pins array in your JSON response`,
        `  * Never ask for count or area`,
        `  * Only ask if query is genuinely unknown`,
        ``,
        `Results shape: {"type":"results","message":"Found N X in Y","searchType":"LANDMARK","pinCount":N,"confirmPrompt":"Drop N pin(s)?"}`,
    ].join("\n");
}

export async function gapFillPins(
    current: Pin[],
    target: number,
    query: string,
    alreadySearchedCities: string[],
    area: string | null,
    isNiche: boolean
): Promise<Pin[]> {
    if (current.length >= target) return current;

    if (isNiche) {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY ?? process.env.GOOGLE_MAP_API_KEY ?? "";
        const foundNames = current.map((p) => p.title);
        const seenIds = new Set(current.map((p) => p.id));
        const combined = [...current];
        for (let round = 0; round < 3 && combined.length < target; round++) {
            const newPins = await gapFillNicheViaWebSearch(query, foundNames, target - combined.length, apiKey);
            if (!newPins.length) break;
            for (const p of newPins) {
                if (combined.length >= target) break;
                if (!seenIds.has(p.id)) { seenIds.add(p.id); foundNames.push(p.title); combined.push(p); }
            }
        }
        return combined;
    }

    const seenIds = new Set(current.map((p) => p.id));
    const combined = [...current];
    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
    const cityRes = await llm.invoke([{
        role: "user",
        content: `List ${Math.ceil((target - current.length) / 5) + alreadySearchedCities.length} major cities in "${area ?? "worldwide"}". Return ONLY: {"cities":["City1","City2"]}`,
    }]);
    const cityText = typeof cityRes.content === "string" ? cityRes.content : "";
    let allCities: string[] = [];
    try {
        allCities = (JSON.parse(cityText.replace(/```json|```/g, "").trim()) as { cities: string[] }).cities ?? [];
    } catch { return combined; }

    const searched = new Set(alreadySearchedCities.map((c) => c.toLowerCase()));
    const newCities = allCities.filter((c) => !searched.has(c.toLowerCase()));
    const perCity = Math.ceil((target - combined.length) / Math.max(newCities.length, 1)) * 2;

    const results = await Promise.all(
        newCities.map((city) => searchViaGooglePlacesExported(query, city, perCity).catch(() => [] as Pin[]))
    );
    for (const cityPins of results) {
        for (const p of cityPins) {
            if (combined.length >= target) break;
            if (!seenIds.has(p.id)) { seenIds.add(p.id); combined.push(p); }
        }
        if (combined.length >= target) break;
    }
    return combined;
}

export function detectIsNiche(messages: BaseMessage[]): boolean {
    for (const msg of messages) {
        if (msg._getType() !== "tool") continue;
        try {
            const parsed = JSON.parse(msg.content as string) as { isNiche?: boolean; namedLocations?: unknown[] };
            if (parsed.isNiche === true) return true;
            if (Array.isArray(parsed.namedLocations) && parsed.namedLocations.length > 0) return true;
        } catch { /* skip */ }
    }
    return false;
}
