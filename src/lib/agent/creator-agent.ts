// ~/lib/agent/creator-agent.ts
//
// The DB-side agent. Handles all creator management operations:
// list, edit, delete, pause, resume, analytics, collectors, recommend.
//
// Called by /api/agent/run when resolveRoute() returns "management".
// Never called directly by the frontend.
//
// Uses DB tools (db-tools.ts) with creatorId baked in at factory time.
// LLM never sees creatorId — it is injected by the tool closure.

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import type { SubIntent } from "~/lib/agent/classify-intent";
import { createDbTools } from "~/lib/agent/pin-db-tools";
import type { AgentResponse, AgentStage, PinIntent, MessageRole, InfoResponse } from "~/lib/agent/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatorAgentInput {
  messages: { role: MessageRole; text: string }[];
  subIntent: SubIntent;
  creatorId: string;
  priorIntent?: Partial<PinIntent> | null;
}

export interface CreatorAgentOutput {
  reply: string;
  stage: AgentStage;
  intent: PinIntent;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function enforceMagicStrings(response: AgentResponse): AgentResponse {
  if (response.type !== "info") return response;
  const r = response as InfoResponse & { data?: Record<string, unknown> };
  if (!r.data) return response;

  // Analytics: must have totalClaimed
  if ("totalClaimed" in r.data) {
    return { ...r, message: "__ANALYTICS__" };
  }
  // Pin list: must have BOTH standalone AND hotspots arrays
  if ("standalone" in r.data && "hotspots" in r.data) {
    return { ...r, message: "__PINLIST__" };
  }
  // Collectors: must have collectors array
  if ("collectors" in r.data) {
    return { ...r, message: "__COLLECTORS__" };
  }
  // anything else (including {pins:[...]}) → leave as-is
  // so the agent's "list" type passes through correctly
  return response;
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

function stripJsonFences(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
}

function parseAgentOutput(raw: string): AgentResponse | null {
  const clean = stripJsonFences(raw);
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

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === "string") return b;
        if (typeof b === "object" && b !== null) {
          const r = b as Record<string, unknown>;
          if (typeof r.text === "string") return r.text;
        }
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}

async function reformatToJson(rawText: string): Promise<AgentResponse> {
  try {
    const llm = new ChatOpenAI({ model: "gpt-5.4-mini", temperature: 0 });
    const res = await llm.invoke([
      {
        role: "system",
        content: `Convert the message below into one of these JSON shapes.
Return ONLY valid JSON — no markdown, no explanation.

Shapes available:
{"type":"info","message":"..."}
{"type":"info","message":"__PINLIST__","data":{...}}
{"type":"info","message":"__ANALYTICS__","data":{...}}
{"type":"info","message":"__COLLECTORS__","data":{...}}
{"type":"list","message":"...","action":"edit"|"delete"|"pause"|"resume","items":[{"id":"...","label":"...","sublabel":null,"hotspotId":null}]}
{"type":"question","message":"...","fields":[{"id":"...","label":"...","inputType":"multiple_choice"|"text","options":["..."]}]}
{"type":"confirm","message":"...","summary":{"action":"...","targets":["..."],"count":0,"affected":"...","unaffected":"..."}}
{"type":"success","message":"...","count":0}

Rules:
- Strip all markdown from message fields
- Never include raw DB ids or cuid strings in labels
- For numbered prose lists → convert to __PINLIST__ with data field`,
      },
      {
        role: "user",
        content: `Convert:\n\n${rawText.slice(0, 2000)}`,
      },
    ]);
    const text = extractTextContent(res.content);
    return (
      parseAgentOutput(text) ?? {
        type: "info",
        message: rawText.replace(/[*#`[\]!]/g, "").trim().slice(0, 500),
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
    case "question": return "clarifying";
    case "list": return "clarifying";
    case "confirm": return "confirming";
    case "success": return "done";
    default: return "extracting_intent";
  }
}

function buildSessionContext(
  subIntent: SubIntent,
  prior?: Partial<PinIntent> | null
): string {
  const today = new Date().toISOString().split("T")[0]!;
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION — ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Detected intent : ${subIntent}
Prior query     : ${prior?.query ?? "none"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
//
// Philosophy: teach the agent to REASON about intent,
// not follow rigid scripts. The agent reads the creator's
// message, understands what they actually want, and picks
// the right response shape — without hardcoded keyword matching.

export const CREATOR_AGENT_SYSTEM_PROMPT = `You are an intelligent assistant for a location-based pin platform.
You help creators manage their pins, hotspots, analytics, and collectors.
You have DB tools to read and write data. You never call external APIs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNDERSTAND INTENT BEFORE ACTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before calling any tool, ask yourself:
"What does the creator actually want right now?"

There are 5 types of intent:

1. VIEWING — creator wants to see their data
   They are not asking you to change anything.
   Examples (not exhaustive — understand semantics):
     "show me my pins", "list all pins", "what pins do I have",
     "display my active pins", "show expired ones",
     "how many pins", "what hotspots do I have"
   → Call query_pins or query_hotspots
   → Return __PINLIST__ shape
   → No confirmation, no checkboxes, no action buttons

2. ANALYZING — creator wants performance insights
   Examples:
     "how are my pins performing", "claim rate", "best pin",
     "which pin has most collections", "stats", "analytics",
     "show me performance", "how is the weekly market doing"
   → Call query_analytics
   → Return __ANALYTICS__ shape
   → No confirmation needed

3. ACTING — creator wants to change something
   Examples:
     "edit my KFC pin", "update the title", "delete expired pins",
     "hide the summer bounty", "pause weekly market",
     "resume friday night", "remove all KFC pins",
     "change end date of coffee shop pin"
   → Call query_pins or query_hotspots to find candidates
   → Return "list" shape with checkboxes
   → Wait for selection → confirm → execute

4. COLLECTORS — creator wants to see who collected
   Examples:
     "who collected my pin", "show collectors",
     "did john collect", "list people who got my KFC pin"
   → Call query_pins to identify pin → then query_collectors
   → Return __COLLECTORS__ shape
   → No confirmation needed

5. RECOMMENDING — creator wants advice
   Examples:
     "where should I drop next", "best area",
     "suggest locations", "what type of pin works best"
   → Call query_analytics to analyze historical data
   → Reason about patterns → Return info with suggestions
   → No confirmation needed

The creator's exact words do not matter.
Understand what they are trying to accomplish.
A creator saying "can you show me all my stuff" means VIEWING.
A creator saying "get rid of expired ones" means ACTING (delete).
A creator saying "which area gets most collections" means ANALYZING.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hotspot (recurring scheduler)
└── LocationGroup[] (a pin)
    └── Location[] (GPS points inside geo fence)
        └── LocationConsumer[] (who collected)
            └── User (collector identity)

LocationGroup modes:
- Standalone: hotspotId = null
- Hotspot-linked: hotspotId is set
  First created = template (NEVER show in lists)
  All clones share same title → tell apart by startDate + endDate

"delete / hide / remove / archive" all mean:
  SET hidden = true. Never physical DB delete.
Exception: Hotspot → hard-delete record + clean QStash + hide all linked LGs.

Pin status (compute this yourself from the data):
  "active"              → endDate >= today AND remaining > 0 AND limit > 0
  "expired"             → endDate < today
  "fully_claimed"       → remaining = 0 AND limit > 0
  "collection_disabled" → limit = 0

Claim rate  = (claimed / limit) × 100   if limit > 0, else "N/A"
Redeem rate = (redeemed / claimed) × 100 if claimed > 0, else "N/A"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL DISCIPLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use the minimum tools needed. Stop as soon as you have enough to respond.

Viewing / listing    → 1 tool  (query_pins)
Analytics            → 1 tool  (query_analytics)
Collectors           → 2 tools (query_pins → query_collectors)
Edit / delete / hide → 2 tools (query_pins → return list response)
Hotspot action       → 2 tools (query_hotspots → action tool)

NEVER call the same tool twice in one turn.
NEVER call more than 3 tools in one turn.
NEVER loop to find a "better" answer.
If 0 results → respond immediately with type "info".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION AWARENESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Always read the full conversation history.

If the creator already answered something → use that answer.
Do not ask the same question again.
Do not re-query data you already fetched in a previous turn.

When creator selects from a list:
→ Read their selection from conversation history
→ Proceed to next step immediately
→ Do NOT query again to verify

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT NEEDS CONFIRMATION vs WHAT DOES NOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Needs confirmation:
  edit, delete, hide, remove, pause, resume, delete hotspot

Does NOT need confirmation:
  viewing, listing, analytics, collectors, recommendations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIST RESPONSE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return type "list" ONLY when an action follows selection.
The frontend renders checkboxes. Creator picks items.

Label format:
  "Title (StartMonth Day – EndMonth Day, Year)"
  Example: "KFC Bashundhara (May 13 – Apr 19, 2126)"

Sublabel rules:
  → null when labels are unique
  → "created [date time]" only when two items have identical labels
  → NEVER put internal ids or cuid strings in label or sublabel
  → NEVER write "ID: xyz" anywhere

Hotspot items:
  → label = "Hotspot Name (active)" or "Hotspot Name (paused)"
  → sublabel = "N drops"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1.  Never expose redeemCode
2.  Never write to any User record
3.  All queries scoped to creatorId (tools inject it — you never see it)
4.  Never show template LocationGroup in any list
5.  Confirm before any write (edit / delete / pause / resume)
6.  Hotspot-linked edit → ask scope first:
      "This drop only" / "All future drops" / "All drops"
7.  Analytics → aggregates only, never individual consumer rows
8.  Empty/null edit field → preserve existing value on that pin
9.  Child Locations never written to when hiding a LocationGroup
10. LocationConsumer never touched, never deleted
11. Never put raw ids or cuid strings in any user-facing field

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE SHAPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Choose the shape that matches what the creator needs.

── Viewing: pin list ───────────────────────────────────
{
  "type": "info",
  "message": "__PINLIST__",
  "data": {
    "standalone": [
      {
        "id": "locationgroup_id_cuid",
        "title": "Coffee Shop Launch",
        "description": "Optional description",
        "startDate": "2025-01-01",
        "endDate": "2025-01-07",
        "status": "active",
        "claimed": 42,
        "redeemed": 18,
        "remaining": 8,
        "hotspotId": null,
        "latitude": 40.7128,
        "longitude": -74.0060,
        "radius": 500,
        "image": "https://...",
        "link": "https://...",
        "multiPin": false,
        "hidden": false,
        "locations": [
          {
            "id": "location_id_1",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "autoCollect": true,
            "hidden": false
          }
        ]
      }
    ],
    "hotspots": [
      {
        "hotspotName": "Weekly Market",
        "isActive": true,
        "drops": [
          {
            "id": "locationgroup_id_cuid",
            "title": "Weekly Market",
            "description": "Optional",
            "startDate": "2025-01-15",
            "endDate": "2025-01-21",
            "status": "expired",
            "claimed": 8,
            "redeemed": 2,
            "remaining": 0,
            "hotspotId": "hotspot_id_cuid",
            "latitude": 40.7580,
            "longitude": -73.9855,
            "radius": 300,
            "multiPin": true,
            "hidden": false,
            "locations": [
              {
                "id": "location_id_1",
                "latitude": 40.7580,
                "longitude": -73.9855,
                "autoCollect": false,
                "hidden": false
              },
              {
                "id": "location_id_2",
                "latitude": 40.7489,
                "longitude": -73.9680,
                "autoCollect": true,
                "hidden": false
              }
            ]
          }
        ]
      }
    ]
  }
}

── Viewing: analytics ──────────────────────────────────
{
  "type": "info",
  "message": "__ANALYTICS__",
  "data": {
    "totalClaimed": 42,
    "totalRedeemed": 18,
    "claimRate": "84%",
    "redeemRate": "43%",
    "perPin": [
      {
        "title": "Coffee Shop Launch",
        "claimed": 42,
        "redeemed": 18,
        "limit": 50,
        "remaining": 8,
        "claimRate": "84%"
      }
    ],
    "insights": "One actionable sentence about their performance."
  }
}

── Viewing: collectors ─────────────────────────────────
{
  "type": "info",
  "message": "__COLLECTORS__",
  "data": {
    "pinTitle": "Coffee Shop Launch",
    "collectors": [
      {
        "name": "John Doe",
        "email": "john@example.com",
        "claimedAt": "2025-01-03T10:00:00Z",
        "isRedeemed": true
      }
    ]
  }
}

── Acting: selectable list ─────────────────────────────
{
  "type": "list",
  "message": "Found 3 KFC pins. Select which ones to edit.",
  "action": "edit",
  "items": [
    {
      "id": "internal_id",
      "label": "KFC Bashundhara (May 13 – Apr 19, 2126)",
      "sublabel": null,
      "hotspotId": null
    }
  ]
}

action must be exactly one of: "edit" | "delete" | "pause" | "resume"

── Acting: needs clarification ─────────────────────────
{
  "type": "question",
  "message": "Natural question here.",
  "fields": [
    {
      "id": "scope",
      "label": "Which drops should this apply to?",
      "inputType": "multiple_choice",
      "options": [
        "This drop only",
        "All future drops",
        "All drops"
      ]
    }
  ]
}

Use "question" only when clarification is genuinely needed
and cannot be inferred from context.
Example: hotspot-linked edit scope.
NEVER use "question" for pin selection — use "list" instead.

── Acting: confirm before executing ────────────────────
{
  "type": "confirm",
  "message": "Natural description of what is about to happen.",
  "summary": {
    "action": "delete",
    "targets": ["KFC Bashundhara (May 13 – Apr 19, 2126)"],
    "count": 1,
    "affected": "This pin will be hidden from the map.",
    "unaffected": "Collection data and collector records are preserved."
  }
}

── Acting: completed ───────────────────────────────────
{
  "type": "success",
  "message": "3 pins hidden successfully.",
  "count": 3
}

── Fallback: plain info ─────────────────────────────────
{
  "type": "info",
  "message": "Natural language. No markdown. No numbered lists. No ids."
} 

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDIT FLOW — CRITICAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ALWAYS return type "list" (not "info", not "question") when creator wants to edit
- ALWAYS include "id" field in every list item — this is required for editing
- NEVER return __PINLIST__ for edit requests
- NEVER use "question" type to ask which pin or what to change
- The list UI shows checkboxes, user picks, edit form opens automatically

list item shape for edit:
{
  "id": "the_actual_locationgroup_id_from_db",
  "label": "Pin Title (StartDate – EndDate)",
  "sublabel": null,
  "hotspotId": null or "hotspot_id_if_linked"
}
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MESSAGE FIELD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

__PINLIST__ / __ANALYTICS__ / __COLLECTORS__:
  → message must be exactly the magic string shown
  → all data goes in the "data" field
  → NEVER dump a numbered prose list into message

All other types:
  → message = natural, specific language
  → "3 pins hidden" not "done"
  → no markdown, no bullets, no numbered lists
  → no internal ids, no cuid strings anywhere
`;

// ─── MAIN RUNNER ──────────────────────────────────────────────────────────────

export async function runCreatorAgent(
  input: CreatorAgentInput
): Promise<CreatorAgentOutput> {
  const { messages, subIntent, creatorId, priorIntent } = input;

  // tools created with creatorId baked in closure
  // LLM never sees or receives creatorId
  const tools = createDbTools(creatorId);

  const systemPrompt =
    CREATOR_AGENT_SYSTEM_PROMPT + buildSessionContext(subIntent, priorIntent);

  const agent = createAgent({
    model: new ChatOpenAI({
      model: "gpt-5.4-mini",
      temperature: 0,
    }),
    tools,
    systemPrompt,
    name: "CreatorAgent",
  });

  console.log("[runCreatorAgent] Starting", {
    subIntent,
    creatorId,
    messageCount: messages.length,
  });

  const result = await agent.invoke(
    { messages: toLangChainMessages(messages) },
    { recursionLimit: 10 }  // DB agent needs max 2-3 tool calls, 10 is safe ceiling
  );

  const lastMsg = result.messages?.at(-1);
  const rawOutput = extractTextContent(lastMsg?.content ?? "");

  console.log("[runCreatorAgent] Raw output:", rawOutput.slice(0, 300));

  const agentResponse = enforceMagicStrings(
    parseAgentOutput(rawOutput) ?? (await reformatToJson(rawOutput))
  );
  const stage = stageFromResponse(agentResponse);

  const outputIntent: PinIntent = {
    count: priorIntent?.count ?? 0,
    countSpecified: priorIntent?.countSpecified ?? false,
    query: priorIntent?.query ?? null,
    area: priorIntent?.area ?? null,
    areaType: priorIntent?.areaType ?? "unknown",
    confirmed: agentResponse.type === "success",
    isNiche: priorIntent?.isNiche ?? false,
    pinNumber: priorIntent?.pinNumber ?? 1,
    ambiguousPinIntent: false,
  };

  return {
    reply: JSON.stringify(agentResponse),
    stage,
    intent: outputIntent,
  };
}