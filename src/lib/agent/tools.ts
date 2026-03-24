// src/lib/agent/tools.ts
// Tool definitions using Vercel AI SDK `tool()` helper.
// Real data fetched via OpenAI Responses API `web_search_preview` built-in tool.
// A second `gpt-4o` call with `response_format: json_object` parses results into typed structs.

import { tool } from "ai";
import { z } from "zod";
import OpenAI from "openai";
import type { EventData, LandmarkData, PinItem } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Step 1: web_search_preview via Responses API ────────────────────────────

async function webSearch(query: string): Promise<string> {
  const response = await openai.responses.create({
    model: "gpt-4o",
    tools: [{ type: "web_search_preview" }],
    input: query,
  });

  return response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("\n");
}

// ─── Step 2a: Parse search text → EventData[] ────────────────────────────────

async function parseEvents(rawText: string, area: string, queryType?: string): Promise<EventData[]> {
  const today = new Date().toISOString().split("T")[0]!;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract upcoming events from web search text and return JSON.
Return ONLY valid JSON: { "events": EventData[] }

EventData fields (all required unless marked optional):
  id          string   – sequential, e.g. "evt_1"
  title       string
  description string   – 1–2 sentences
  startDate   string   – ISO 8601, e.g. "2026-04-15T00:00:00.000Z"
  endDate     string   – ISO 8601
  latitude    number   – estimate from venue/city if unknown
  longitude   number
  venue       string?  – venue or location name
  address     string?  – full street address
  url         string?
  image       string?

Rules:
- Today is ${today}. Omit events where startDate < today.
- Omit events with unknown dates.
- Return 3–10 (if user doesn't mention a specific number) events if available.
- If NO events found, return empty array: { "events": [] }
- Area context: "${area}"${queryType ? `\n- Event type: "${queryType}"` : ""}`,
      },
      { role: "user", content: rawText },
    ],
  });

  try {
    const json = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { events?: EventData[] };
    return (json.events ?? []).map((e, i) => {
      let endDate = e.endDate;
      if (!endDate && e.startDate) {
        // If no end date, default to 1 week after start date
        const start = new Date(e.startDate);
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        endDate = end.toISOString();
      }
      return { ...e, id: e.id || `evt_${i + 1}`, endDate };
    });
  } catch {
    return [];
  }
}

// ─── Step 2b: Parse search text → LandmarkData[] ─────────────────────────────

async function parseLandmarks(
  rawText: string,
  query: string,
  count: number,
): Promise<LandmarkData[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract landmark places from web search text and return JSON.
Return ONLY valid JSON: { "landmarks": LandmarkData[] }

LandmarkData fields (all required unless marked optional):
  id          string   – sequential, e.g. "lm_1"
  title       string   – place name
  description string   – 1–2 sentences
  latitude    number   – estimate from address/city if unknown
  longitude   number
  venue       string?  – same as title
  address     string?  – full street address
  url         string?  – official website
  image       string?
  category    string?  – e.g. Restaurant | Cafe | Park | Bookstore | Museum | Shop | Market

Return up to ${count} results. Query: "${query}"`,
      },
      { role: "user", content: rawText },
    ],
  });

  try {
    const json = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { landmarks?: LandmarkData[] };
    return (json.landmarks ?? [])
      .slice(0, count)
      .map((l, i) => ({ ...l, id: l.id || `lm_${i + 1}` }));
  } catch {
    return [];
  }
}

// ─── Zod schema matching PinItem exactly ─────────────────────────────────────

const PinItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  url: z.string().optional(),
  image: z.string().optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  pinCollectionLimit: z.number().int().min(1).optional(),
  pinNumber: z.number().int().min(1).optional(),
  autoCollect: z.boolean().optional(),
  multiPin: z.boolean().optional(),
  radius: z.number().optional(),
}) satisfies z.ZodType<PinItem>;

// ─── Exported tool definitions ────────────────────────────────────────────────

export const agentTools = {
  search_events: tool({
    description:
      "Search the web for real upcoming events of a specific type in a given area using web_search_preview. Returns EventData[].",
    parameters: z.object({
      query: z.string().describe("Type of event to search for, e.g. 'music', 'sports', 'conference', 'festival'"),
      area: z.string().describe("City or area to search, e.g. 'dhaka', 'New York'"),
    }),
    execute: async ({ query, area }) => {
      console.log("agentTools.search_events called with:", { query, area });
      const rawText = await webSearch(`upcoming ${query} events in ${area} ${new Date().getFullYear()}`);
      const events = await parseEvents(rawText, area, query);
      return { events };
    }
  }),
  search_landmarks: tool({
    description:
      "Search the web for real landmark places (restaurants, shops, parks, etc.) using web_search_preview. Returns LandmarkData[].",
    parameters: z.object({
      query: z.string().describe("Type of landmark, e.g. 'restaurant', 'bookstore', 'park'"),
      count: z.number().int().min(1).max(100).describe("How many results to return"),
      area: z.string().describe("City or area to search in"),
    }),
    execute: async ({ query, count, area }) => {
      const rawText = await webSearch(`top ${count} ${query} in ${area}`);
      const landmarks = await parseLandmarks(rawText, `${query} in ${area}`, count);
      return { landmarks };
    },
  }),


  generate_pins: tool({
    description:
      "Called after the user confirms all configuration. Receives the final PinItem[] array and persists the pins.",
    parameters: z.object({
      pins: z.array(PinItemSchema).describe("Fully configured PinItem array ready for creation"),
    }),
    execute: async ({ pins }) => {
      // Production: await Promise.all(pins.map(p => ctx.db.locationGroup.create({ data: buildDbPayload(p) })))
      return { success: true, count: pins.length, pins };
    },
  }),
};