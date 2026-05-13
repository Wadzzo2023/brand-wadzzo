// server/routers/chat.ts
// ─── tRPC route: agent.create ─────────────────────────────────────────────────

import { z } from "zod";
import { publicProcedure, createTRPCRouter } from "../trpc";

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { ALL_TOOLS, AGENT_SYSTEM_PROMPT } from "~/lib/agent/tools";
import type {
  ChatCreateOutput,
  PinIntent,
  AgentStage,
  AgentResponse,
  Pin,
  MessageRole,
} from "~/lib/agent/types";

// ─── Input schemas ────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"] as const),
  text: z.string(),
});

const IntentSchema = z.object({
  count: z.number().nullable().optional(),
  query: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  areaType: z
    .enum(["city", "region", "country", "worldwide", "unknown"] as const)
    .optional(),
  confirmed: z.boolean().optional(),
});

const ChatCreateInputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  intent: IntentSchema.optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLangChainMessages(
  msgs: { role: MessageRole; text: string }[]
): BaseMessage[] {
  return msgs.map((m) => {
    if (m.role === "user") return new HumanMessage(m.text);
    if (m.role === "assistant") return new AIMessage(m.text);
    return new SystemMessage(m.text);
  });
}

/**
 * Try to parse the raw agent output as a structured AgentResponse JSON.
 * The agent is instructed to return pure JSON — no markdown fences, no wrapper.
 * Falls back gracefully if parsing fails.
 */
function parseAgentOutput(raw: string): AgentResponse | null {
  // Strip any accidental markdown code fences the model might add
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Find the outermost JSON object
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(clean.slice(start, end + 1)) as AgentResponse;
    if (!parsed.type) return null;
    return parsed;
  } catch (err) {
    console.error("[parseAgentOutput] JSON parse failed:", err);
    return null;
  }
}

/**
 * When the agent returns plain text / markdown instead of JSON,
 * make a fast direct GPT-4o call to reformat it into the correct structure.
 * This is the safety net for when the agent ignores its system prompt instructions.
 */
async function reformatToJson(rawMarkdown: string): Promise<AgentResponse> {
  const today = new Date().toISOString().split("T")[0];

  const REFORMAT_SYSTEM = `You are a JSON formatter. Convert the assistant message below into one of these exact JSON shapes. Return ONLY valid JSON — no markdown, no extra text, no explanation.

Shapes:
1. Results found (locations/events listed): {"type":"results","message":"...short summary...","searchType":"LANDMARK"|"EVENT"|"MIXED","pins":[...],"confirmPrompt":"Drop N pins?"}
2. Confirmation ready: {"type":"confirm","message":"...","summary":{"what":"...","where":"...","count":N,"type":"LANDMARK"|"EVENT"|"MIXED"},"pins":[...]}
3. Asking a question: {"type":"question","message":"...","fields":[{"id":"...","label":"...","inputType":"multiple_choice"|"text"|"number","options":["..."]}]}
4. Success: {"type":"success","message":"...","count":N}
5. Info/error: {"type":"info","message":"...plain text, no markdown..."}

Pin shape (required fields):
{"id":"unique_string","type":"EVENT"|"LANDMARK","title":"...","description":"...","latitude":0.0,"longitude":0.0,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","url":"...","image":"...","pinCollectionLimit":999999,"pinNumber":1,"radius":2,"autoCollect":false,"address":"...","category":"..."}

Rules:
- MANDATORY: Every pin MUST have valid latitude and longitude (not null, not 0/0 unless that's the actual location). If a pin lacks coordinates, REJECT it completely — do not include it.
- If the message lists found locations or events → use "results" type with pins array
- If the message says "ready to drop" or asks for confirmation → use "confirm" type
- For EVENT pins: startDate and endDate must be real future dates (>= ${today}). If the text has no date, omit those pins.
- For LANDMARK pins: startDate="${today}", endDate="2126-01-01"
- Extract ALL pins mentioned in the text — do not truncate
- The "message" field must be plain text only, no markdown, no bullet points
- For "info" type: strip ALL markdown from the message field (no **, no -, no #, no brackets)`;

  try {
    const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
    const response = await llm.invoke([
      { role: "system", content: REFORMAT_SYSTEM },
      { role: "user", content: `Convert this to JSON:\n\n${rawMarkdown}` },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("")
          : "";

    const result = parseAgentOutput(text);
    if (result) {
      // FIX: filter out any pins missing latitude or longitude
      if ((result.type === "results" || result.type === "confirm") && result.pins) {
        result.pins = result.pins.filter(
          (p) =>
            p.latitude != null &&
            p.longitude != null &&
            typeof p.latitude === "number" &&
            typeof p.longitude === "number"
        );
      }
      return result;
    }

    // If the reformat also failed, return a sanitized info message
    const sanitized = rawMarkdown
      .replace(/\*\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip markdown links → keep label
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")     // strip markdown images
      .replace(/`{1,3}[^`]*`{1,3}/g, "")        // strip code spans
      .trim();
    return { type: "info", message: sanitized };
  } catch (err) {
    console.error("[reformatToJson] reformat failed:", err);
    return { type: "info", message: "Something went wrong. Please try again." };
  }
}


function stageFromResponse(response: AgentResponse): AgentStage {
  switch (response.type) {
    case "question": return "clarifying";
    case "results": return "confirming";
    case "confirm": return "confirming";
    case "success": return "done";
    case "info": return "extracting_intent";
    default: return "extracting_intent";
  }
}

/**
 * Merge intent from a parsed AgentResponse (if it carries intent fields)
 * with the current accumulated intent, preferring new values.
 */
function mergeIntent(
  response: AgentResponse,
  currentIntent: Partial<PinIntent> | undefined
): PinIntent {
  // Some response types carry pin metadata we can use to infer intent
  const base: PinIntent = {
    count: currentIntent?.count ?? null,
    query: currentIntent?.query ?? null,
    area: currentIntent?.area ?? null,
    areaType: currentIntent?.areaType ?? "unknown",
    confirmed: currentIntent?.confirmed ?? false,
  };

  if (response.type === "confirm" || response.type === "results") {
    const pins = response.pins;
    if (pins?.length) {
      base.count = pins.length;
    }
    if (response.type === "confirm") {
      base.query = response.summary.what ?? base.query;
      base.area = response.summary.where ?? base.area;
      base.count = response.summary.count ?? base.count;
    }
  }

  if (response.type === "success") {
    base.confirmed = true;
    base.count = response.count ?? base.count;
  }

  return base;
}

// ─── tRPC Router ──────────────────────────────────────────────────────────────

export const agentRouter = createTRPCRouter({
  create: publicProcedure
    .input(ChatCreateInputSchema)
    .mutation(async ({ input }): Promise<ChatCreateOutput> => {
      const { messages, intent: currentIntent } = input;

      // ── Build intent context injected into the system prompt ───────────────
      const today = new Date().toISOString().split("T")[0];
      const currentYear = new Date().getFullYear();

      let intentContext =
        `\n\n[CURRENT SESSION STATE]\n` +
        `Today: ${today} | Year: ${currentYear}\n` +
        `Always use year ${currentYear} in web search queries, never a past year.\n`;

      if (currentIntent) {
        const known: string[] = [];
        const missing: string[] = [];

        if (currentIntent.count != null) known.push(`count=${currentIntent.count}`);
        else missing.push("count (HOW MANY)");

        if (currentIntent.query) known.push(`query="${currentIntent.query}"`);
        else missing.push("query (WHAT)");

        if (currentIntent.area) known.push(`area="${currentIntent.area}"`);
        else missing.push("area (WHERE)");

        intentContext +=
          (known.length
            ? `Known (DO NOT ask again): ${known.join(", ")}\n`
            : "") +
          (missing.length
            ? `Still missing: ${missing.join(", ")}\n` +
            `Combine ALL missing params into ONE clarifying message.\n`
            : "All params known — proceed to search immediately.\n");
      }

      const systemPrompt = AGENT_SYSTEM_PROMPT + intentContext;

      // ── Build and invoke the agent ─────────────────────────────────────────
      const agent = createAgent({
        model: new ChatOpenAI({ model: "gpt-4o", temperature: 0.3 }),
        tools: [...ALL_TOOLS],
        systemPrompt,
        name: "pin_drop_agent",
      });

      const langChainMessages = toLangChainMessages(messages);
      const result = await agent.invoke({ messages: langChainMessages });

      // The last message in the result is the final assistant reply
      const lastMsg = result.messages[result.messages.length - 1];
      const rawOutput: string =
        typeof lastMsg?.content === "string"
          ? lastMsg.content
          : JSON.stringify(lastMsg?.content ?? "");

      // ── Parse the agent's structured JSON response ─────────────────────────
      let agentResponse = parseAgentOutput(rawOutput);

      if (!agentResponse) {
        // The agent returned plain text / markdown instead of JSON.
        // Run a fast reformat pass to convert it into the correct structure.
        console.warn(
          "[agentRouter] Agent returned non-JSON output, reformatting…\n",
          rawOutput.slice(0, 300)
        );
        agentResponse = await reformatToJson(rawOutput);
      }

      // ── Derive stage and merge intent from the structured response ─────────
      const stage = stageFromResponse(agentResponse);
      const mergedIntent = mergeIntent(agentResponse, currentIntent);

      // ── The `reply` field must be the raw JSON string of the AgentResponse.
      //    The frontend parses this with JSON.parse() inside sendMessage().
      //    Do NOT strip or transform it — pass it verbatim so the frontend
      //    can render the correct block (QuestionBlock, ResultsBlock, etc.).
      const reply = JSON.stringify(agentResponse);

      return {
        reply,
        stage,
        intent: mergedIntent,
        // Expose pins and questions at the top level for convenience
        questions:
          agentResponse.type === "question"
            ? agentResponse.fields
            : undefined,
        pins:
          agentResponse.type === "results" || agentResponse.type === "confirm"
            ? agentResponse.pins
            : undefined,
      };
    }),
});