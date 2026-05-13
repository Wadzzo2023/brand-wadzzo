import {
    ALL_TOOLS,
    AGENT_SYSTEM_PROMPT,
    searchViaGooglePlacesExported,
    gapFillNicheViaWebSearch,
    applyPinNumber,
    retrievePins,
} from "~/lib/agent/tools";

import type {
    PinIntent,
    AgentStage,
    AgentResponse,
    Pin,
    MessageRole,
    PinOptions,
} from "~/lib/agent/types";

import { db } from "~/server/db";
import { ChatOpenAI } from "@langchain/openai";
import {
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
} from "@langchain/core/messages";
import { createAgent } from "langchain";
import { Client } from "@upstash/qstash";
import { BASE_URL } from "~/lib/common";
import { qstash } from "~/lib/qstash";


interface JobPayload {
    jobId: string;
}

interface AgentRunInput {
    messages: { role: MessageRole; text: string }[];
    intent: Partial<PinIntent> | null;
    pinOptions: PinOptions | null;
    creatorId: string;
}

function toLangChainMessages(
    msgs: { role: MessageRole; text: string }[]
): BaseMessage[] {
    return msgs.map((m) => {
        if (m.role === "user") return new HumanMessage(m.text);
        if (m.role === "assistant") return new AIMessage(m.text);
        return new SystemMessage(m.text);
    });
}

function parseAgentOutput(raw: string): AgentResponse | null {
    const clean = raw.replace(/`json\s*/gi, "").replace(/`\s*/g, "").trim();
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
        const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
        const res = await llm.invoke([
            { role: "system", content: SYSTEM },
            {
                role: "user",
                content: `Convert:\n\n${rawText.slice(0, 2000)}`,
            },
        ]);
        const text =
            typeof res.content === "string"
                ? res.content
                : Array.isArray(res.content)
                    ? res.content
                        .filter(
                            (b): b is { type: "text"; text: string } =>
                                (b as { type: string }).type === "text"
                        )
                        .map((b) => b.text)
                        .join("")
                    : "";
        return (
            parseAgentOutput(text) ?? {
                type: "info",
                message: rawText.replace(/[*#`\[\]!]/g, "").trim().slice(0, 500),
            }
        );
    } catch {
        return {
            type: "info",
            message: "Something went wrong. Please try again.",
        };
    }
}

function stageFromResponse(r: AgentResponse): AgentStage {
    switch (r.type) {
        case "question":
            return "clarifying";
        case "results":
            return "confirming";
        case "confirm":
            return "confirming";
        case "success":
            return "done";
        default:
            return "extracting_intent";
    }
}

function mergeIntent(
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
        pinNumber: current?.pinNumber ?? 1,
        pinNumberSpecified: current?.pinNumberSpecified ?? false,
    };
    if (response.type === "confirm") {
        base.query = (response as { summary?: { what: string } }).summary?.what ?? base.query;
        base.area = (response as { summary?: { where: string } }).summary?.where ?? base.area;
        base.count = (response as { summary?: { count: number } }).summary?.count ?? base.count;
    }
    if (response.type === "results") {
        const pinCount = actualPinCount ?? (response as { pinCount?: number }).pinCount;
        if (pinCount != null) base.count = pinCount;
    }
    if (response.type === "success") {
        base.confirmed = true;
        base.count = (response as { count?: number }).count ?? base.count;
    }
    return base;
}

async function extractIntent(
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
{"query":string|null,"area":string|null,"count":number,"countSpecified":boolean,"areaType":"city"|"region"|"country"|"worldwide"|"unknown","confirmed":boolean,"pinNumber":number,"pinNumberSpecified":boolean}

RULES:
- count default 1, countSpecified default false
- pinNumber default 1, pinNumberSpecified default false
- Explicit pin count (pins per location) → pinNumberSpecified=true
- Explicit location count (total locations) → countSpecified=true
- confirmed=true ONLY if user said "yes"/"drop"/"confirm"
- PRIOR: query=${prior?.query ?? "null"}, area=${prior?.area ?? "null"}, count=${prior?.count ?? 1}, countSpecified=${prior?.countSpecified ?? false}, pinNumber=${prior?.pinNumber ?? 1}, pinNumberSpecified=${prior?.pinNumberSpecified ?? false}`,
        },
        { role: "user", content: `Full conversation:\n${convo}` },
    ]);

    const raw =
        typeof res.content === "string"
            ? res.content
            : Array.isArray(res.content)
                ? res.content
                    .filter(
                        (b): b is { type: "text"; text: string } =>
                            (b as { type: string }).type === "text"
                    )
                    .map((b) => b.text)
                    .join("")
                : "";

    try {
        const parsed = JSON.parse(raw.replace(/`json|`/g, "").trim()) as PinIntent;
        return {
            count: parsed.count ?? prior?.count ?? 1,
            countSpecified: parsed.countSpecified ?? prior?.countSpecified ?? false,
            query: parsed.query ?? prior?.query ?? null,
            area: parsed.area ?? prior?.area ?? null,
            areaType: parsed.areaType ?? prior?.areaType ?? "unknown",
            confirmed: parsed.confirmed ?? prior?.confirmed ?? false,
            isNiche: prior?.isNiche ?? false,
            pinNumber: parsed.pinNumber ?? prior?.pinNumber ?? 1,
            pinNumberSpecified:
                parsed.pinNumberSpecified ?? prior?.pinNumberSpecified ?? false,
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
            pinNumber: prior?.pinNumber ?? 1,
            pinNumberSpecified: prior?.pinNumberSpecified ?? false,
        };
    }
}

function buildIntentContext(intent: PinIntent): string {
    const today = new Date().toISOString().split("T")[0]!;
    const totalCount = intent.count ?? 1;
    const countSpecified = intent.countSpecified ?? false;
    const pinNumber = intent.pinNumber ?? 1;

    const known: string[] = [
        countSpecified ? `count=${totalCount}` : `count=unspecified (return ALL found)`,
        `pinNumber=${pinNumber}`,
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
        countSection,
        `PIN NUMBER: Each pin will have pinNumber=${pinNumber}`,
        `OUTPUT RULES:`,
        ` * Never include pins array in your JSON response`,
        ` * Never ask for count or area`,
        ` * Only ask if query is genuinely unknown`,
        ``,
        `Results shape: {"type":"results","message":"Found N X in Y","searchType":"LANDMARK","pinCount":N,"confirmPrompt":"Drop N pin(s)?"}`,
    ].join("\n");
}

async function gapFillPins(
    current: Pin[],
    target: number,
    query: string,
    alreadySearchedCities: string[],
    area: string | null,
    isNiche: boolean
): Promise<Pin[]> {
    if (current.length >= target) return current;

    if (isNiche) {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY ?? "";
        const foundNames = current.map((p) => p.title);
        const seenIds = new Set(current.map((p) => p.id));
        const combined = [...current];
        for (let round = 0; round < 3 && combined.length < target; round++) {
            const newPins = await gapFillNicheViaWebSearch(
                query,
                foundNames,
                target - combined.length,
                apiKey
            );
            if (!newPins.length) break;
            for (const p of newPins) {
                if (combined.length >= target) break;
                if (!seenIds.has(p.id)) {
                    seenIds.add(p.id);
                    foundNames.push(p.title);
                    combined.push(p);
                }
            }
        }
        return combined;
    }

    const seenIds = new Set(current.map((p) => p.id));
    const combined = [...current];
    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
    const cityRes = await llm.invoke([
        {
            role: "user",
            content: `List ${Math.ceil((target - current.length) / 5) + alreadySearchedCities.length} major cities in "${area ?? "worldwide"}". Return ONLY: {"cities":["City1","City2"]}`,
        },
    ]);
    const cityText =
        typeof cityRes.content === "string" ? cityRes.content : "";
    let allCities: string[] = [];
    try {
        allCities = (
            JSON.parse(cityText.replace(/`json|`/g, "").trim()) as {
                cities: string[];
            }
        ).cities ?? [];
    } catch {
        return combined;
    }

    const searched = new Set(alreadySearchedCities.map((c) => c.toLowerCase()));
    const newCities = allCities.filter(
        (c) => !searched.has(c.toLowerCase())
    );
    const perCity =
        Math.ceil((target - combined.length) / Math.max(newCities.length, 1)) * 2;

    const results = await Promise.all(
        newCities.map((city) =>
            searchViaGooglePlacesExported(query, city, perCity).catch(
                () => [] as Pin[]
            )
        )
    );
    for (const cityPins of results) {
        for (const p of cityPins) {
            if (combined.length >= target) break;
            if (!seenIds.has(p.id)) {
                seenIds.add(p.id);
                combined.push(p);
            }
        }
        if (combined.length >= target) break;
    }
    return combined;
}

function detectIsNiche(messages: BaseMessage[]): boolean {
    for (const msg of messages) {
        if (msg._getType() !== "tool") continue;
        try {
            const parsed = JSON.parse(msg.content as string) as {
                isNiche?: boolean;
                namedLocations?: unknown[];
            };
            if (parsed.isNiche === true) return true;
            if (
                Array.isArray(parsed.namedLocations) &&
                parsed.namedLocations.length > 0
            )
                return true;
        } catch {
            /* skip */
        }
    }
    return false;
}

async function runAgent(input: AgentRunInput): Promise<{
    reply: string;
    stage: AgentStage;
    intent: PinIntent;
    pins?: Pin[];
    pinOptions?: {
        autoCollect: boolean;
        groupingMode: "per-location" | "single-group";
    };
    locationGroupJobId?: string;
}> {
    const { messages, intent: currentIntent, pinOptions, creatorId } = input;

    // 1. Extract intent
    const intent = await extractIntent(messages, currentIntent);

    // 2. Build system prompt
    const systemPrompt = AGENT_SYSTEM_PROMPT + buildIntentContext(intent);

    // 3. Run LLM agent
    const agent = createAgent({
        model: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 }),
        tools: [...ALL_TOOLS],
        systemPrompt,
        name: "pin_drop_agent",
    });

    const result = await agent.invoke({
        messages: toLangChainMessages(messages),
    });

    // 4. Harvest pins from tool call results
    const responsePins: Pin[] = [];
    const searchedCities: string[] = [];

    for (const msg of result.messages) {
        if (msg._getType() !== "tool") continue;
        try {
            const toolInput = (
                msg as unknown as {
                    additional_kwargs?: { tool_input?: string };
                }
            ).additional_kwargs?.tool_input;
            if (toolInput) {
                const parsed = JSON.parse(toolInput) as { city?: string };
                if (parsed.city) searchedCities.push(parsed.city);
            }
        } catch {
            /* ignore */
        }

        try {
            const parsed = JSON.parse(msg.content as string) as { pins?: Pin[] };
            if (Array.isArray(parsed.pins) && parsed.pins.length > 0) {
                responsePins.push(...parsed.pins);
                (msg as unknown as { content: string }).content = JSON.stringify({
                    total: parsed.pins.length,
                    message: `Found ${parsed.pins.length} pins.`,
                });
            }
        } catch {
            /* not a pin result */
        }
    }

    // 5. Detect niche flag
    const isNiche = detectIsNiche(result.messages) || (intent.isNiche ?? false);

    // 6. Cap / gap-fill
    let cappedPins: Pin[];
    if (!intent.countSpecified || intent.count == null) {
        cappedPins = responsePins;
    } else {
        const target = intent.count;
        cappedPins =
            responsePins.length >= target
                ? responsePins.slice(0, target)
                : (
                    await gapFillPins(
                        responsePins,
                        target,
                        intent.query ?? "",
                        searchedCities,
                        intent.area ?? null,
                        isNiche
                    )
                ).slice(0, target);
    }

    // 7. Apply pinNumber to all pins
    const pinsWithPinNumber = applyPinNumber(cappedPins, intent.pinNumber ?? 1);

    // 8. Parse response JSON
    const lastMsg = result.messages.at(-1);
    const rawOutput =
        typeof lastMsg?.content === "string"
            ? lastMsg.content
            : JSON.stringify(lastMsg?.content ?? "");
    let agentResponse = parseAgentOutput(rawOutput) ?? (await reformatToJson(rawOutput));

    // 9. Guard: 0 pins → info
    if (agentResponse.type === "results" && pinsWithPinNumber.length === 0) {
        agentResponse = {
            type: "info",
            message: `No locations found for "${intent.query}" in "${intent.area ?? "worldwide"}". Try a different search.`,
        };
    }

    if (agentResponse.type === "results" && pinsWithPinNumber.length > 0) {
        (agentResponse as Record<string, unknown>).pinCount = pinsWithPinNumber.length;
        agentResponse.message = agentResponse.message?.replace(
            /\d+/,
            String(pinsWithPinNumber.length)
        );
        if ((agentResponse as Record<string, unknown>).confirmPrompt) {
            (agentResponse as Record<string, unknown>).confirmPrompt = `Drop these ${pinsWithPinNumber.length} pins?`;
        }
    }

    // 10. If confirmed → enqueue pin-creation job
    let locationGroupJobId: string | undefined;

    if (pinOptions && pinsWithPinNumber.length > 0) {
        const { autoCollect, groupingMode } = pinOptions;

        const pinsForCreation = pinsWithPinNumber.map((pin) => ({
            ...pin,
            autoCollect,
        }));

        // Create LocationGroupJob
        const lgJob = await db.locationGroupJob.create({
            data: {
                creatorId,
                status: "pending",
                total: pinsForCreation.length,
                completed: 0,
                payload: JSON.stringify({
                    pins: pinsForCreation,
                    redeemMode: groupingMode,
                }),
                log: [],
            },
        });
        locationGroupJobId = lgJob.id;

        await qstash.publishJSON({
            url: `${BASE_URL}/api/create-pins`,
            body: {
                jobId: lgJob.id,
                creatorId,
                pins: pinsForCreation,
                redeemMode: groupingMode,
            },
            retries: 3,
        });

        agentResponse = {
            type: "success",
            message: `Queued ${pinsForCreation.length} pin${pinsForCreation.length !== 1 ? "s" : ""} for creation…`,
            count: pinsForCreation.length,
        };
    }

    const outputIntent = mergeIntent(
        agentResponse,
        { ...intent, isNiche },
        pinsWithPinNumber.length || undefined
    );

    return {
        reply: JSON.stringify(agentResponse),
        stage: stageFromResponse(agentResponse),
        intent: outputIntent,
        pins:
            !pinOptions && pinsWithPinNumber.length > 0
                ? pinsWithPinNumber
                : undefined,
        pinOptions:
            agentResponse.type === "results"
                ? { autoCollect: false, groupingMode: "per-location" }
                : undefined,
        locationGroupJobId,
    };
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as JobPayload;
        const { jobId } = body;

        if (!jobId) {
            return Response.json({ error: "Missing jobId" }, { status: 400 });
        }

        // Load the AgentJob row
        const job = await db.agentJob.findUnique({ where: { id: jobId } });
        if (!job) {
            return Response.json({ error: "Job not found" }, { status: 404 });
        }

        // Mark as processing
        await db.agentJob.update({
            where: { id: jobId },
            data: { status: "processing" },
        });

        let agentInput: AgentRunInput;
        try {
            agentInput = JSON.parse(job.payload as string) as AgentRunInput;
        } catch {
            await db.agentJob.update({
                where: { id: jobId },
                data: { status: "failed", error: "Invalid job payload" },
            });
            return Response.json(
                { ok: false, error: "Invalid payload" },
                { status: 200 }
            );
        }

        try {
            const result = await runAgent(agentInput);

            await db.agentJob.update({
                where: { id: jobId },
                data: {
                    status: "completed",
                    result: result as object,
                },
            });

            return Response.json({ ok: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            console.error(`[/api/agent] Job ${jobId} failed:`, err);

            await db.agentJob.update({
                where: { id: jobId },
                data: { status: "failed", error: message },
            }).catch(() => null);

            return Response.json({ ok: false, error: message }, { status: 200 });
        }
    } catch {
        return Response.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        );
    }
}
