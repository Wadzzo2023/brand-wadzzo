// ~/lib/agent/creator-agent.ts

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createAgent, providerStrategy } from "langchain";
import { z } from "zod";
import { createDbTools } from "~/lib/agent/pin-db-tools";
import { type AgentStage, type PinIntent, type MessageRole, PinRowSchema, HotspotRowSchema, PaginationSchema, ReportSummarySchema, TopPerformerSchema, PerPinStatSchema, CollectorProfileSchema, CollectionSchema, CollectorSummarySchema, PinListResponse } from "~/lib/agent/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatorAgentInput {
  messages: { role: MessageRole; text: string }[];
  creatorId: string;
  priorIntent?: Partial<PinIntent> | null;
  loadMore?: boolean;
  loadMoreOffset?: number;
  loadMoreType?: string;
}

export interface CreatorAgentOutput {
  reply: string;
  stage: AgentStage;
  intent: PinIntent;
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const AgentResponseSchema = z.object({
  response: z.discriminatedUnion("type", [

    // ── PIN LIST ────────────────────────────────────────────────────────────
    z.object({
      type: z.literal("pin_list"),
      mode: z.enum(["view", "edit", "delete"]),
      data: z.object({
        standalone: z.array(z.object({
          id: z.string(),
          title: z.string(),
          startDate: z.string().nullable(),
          endDate: z.string().nullable(),
          status: z.enum(["active", "expired", "fully_claimed", "collection_disabled"]),
          claimed: z.number(),
          redeemed: z.number(),
          remaining: z.number(),
          hotspotId: z.string().nullable(),
          latitude: z.number().nullable(),
          longitude: z.number().nullable(),
          radius: z.number().nullable(),
          description: z.string().nullable(),
          image: z.string().nullable(),
          link: z.string().nullable(),
          multiPin: z.boolean().nullable(),
          hidden: z.boolean().nullable(),
          locations: z.array(z.object({
            id: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            autoCollect: z.boolean(),
            hidden: z.boolean(),
          })).nullable(),
        })),
        hotspots: z.array(z.object({
          id: z.string(),
          hotspotName: z.string(),
          isActive: z.boolean(),
          dropEveryDays: z.number().nullable(),
          dropCount: z.number(),
          locationGroups: z.array(z.object({
            id: z.string(),
            title: z.string(),
            startDate: z.string().nullable(),
            endDate: z.string().nullable(),
            status: z.enum(["active", "expired", "fully_claimed", "collection_disabled"]),
            claimed: z.number(),
            redeemed: z.number(),
            remaining: z.number(),
            locations: z.array(z.object({
              id: z.string(),
              latitude: z.number(),
              longitude: z.number(),
              autoCollect: z.boolean(),
              hidden: z.boolean(),
            })),
          })),
        })),
        pagination: z.object({
          total: z.number(),
          offset: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
          nextOffset: z.number().nullable(),
          showing: z.string(),
        }),
      }),
    }),

    // ── HOTSPOT LIST ────────────────────────────────────────────────────────
    z.object({
      type: z.literal("hotspot_list"),
      mode: z.enum(["view", "edit", "delete", "pause", "resume"]),
      data: z.object({
        hotspots: z.array(z.object({
          id: z.string(),
          hotspotName: z.string(),
          isActive: z.boolean(),
          dropEveryDays: z.number().nullable(),
          dropCount: z.number(),
          locationGroups: z.array(z.object({
            id: z.string(),
            title: z.string(),
            startDate: z.string().nullable(),
            endDate: z.string().nullable(),
            status: z.enum(["active", "expired", "fully_claimed", "collection_disabled"]),
            claimed: z.number(),
            redeemed: z.number(),
            remaining: z.number(),
            locations: z.array(z.object({
              id: z.string(),
              latitude: z.number(),
              longitude: z.number(),
              autoCollect: z.boolean(),
              hidden: z.boolean(),
            })),
          })),
        })),
        pagination: z.object({
          total: z.number(),
          offset: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
          nextOffset: z.number().nullable(),
          showing: z.string(),
        }),
      }),
    }),

    // ── ANALYTICS ───────────────────────────────────────────────────────────
    z.object({
      type: z.literal("analytics"),
      data: z.object({
        totalClaimed: z.number(),
        totalRedeemed: z.number(),
        claimRate: z.string(),
        redeemRate: z.string(),
        perPin: z.array(z.object({
          id: z.string().nullable(),
          title: z.string(),
          claimed: z.number(),
          redeemed: z.number(),
          limit: z.number(),
          remaining: z.number(),
          claimRate: z.string(),
        })),
        insights: z.string().nullable(),
      }),
    }),

    // ── REPORT ──────────────────────────────────────────────────────────────
    z.object({
      type: z.literal("report"),
      data: z.object({
        summary: z.object({
          totalClaimed: z.number(),
          totalRedeemed: z.number(),
          claimRate: z.string(),
          redeemRate: z.string(),
          totalPins: z.number(),
          activePins: z.number(),
          expiredPins: z.number(),
          fullyClaimedPins: z.number(),
        }),
        topPerformers: z.array(z.object({
          id: z.string(),
          title: z.string(),
          claimed: z.number(),
          limit: z.number(),
          remaining: z.number(),
          claimRate: z.string(),
        })),
        perPin: z.array(z.object({
          id: z.string().nullable(),
          title: z.string(),
          claimed: z.number(),
          redeemed: z.number(),
          limit: z.number(),
          remaining: z.number(),
          claimRate: z.string(),
        })),
        pagination: z.object({
          total: z.number(),
          offset: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
          nextOffset: z.number().nullable(),
          showing: z.string(),
        }),
        generatedAt: z.string(),
      }),
    }),

    // ── COLLECTOR REPORT ────────────────────────────────────────────────────
    z.object({
      type: z.literal("collector_report"),
      data: z.object({
        mode: z.enum(["single_collector", "all_collectors"]),
        collector: z.object({
          name: z.string(),
          email: z.string(),
          image: z.string().nullable(),
          totalCollected: z.number(),
          totalRedeemed: z.number(),
        }).nullable(),
        collections: z.array(z.object({
          pinId: z.string(),
          pinTitle: z.string(),
          pinStartDate: z.string().nullable(),
          pinEndDate: z.string().nullable(),
          claimedAt: z.string().nullable(),
          isRedeemed: z.boolean(),
        })).nullable(),
        collectors: z.array(z.object({
          name: z.string(),
          email: z.string(),
          image: z.string().nullable(),
          collected: z.number(),
          redeemed: z.number(),
          lastClaimedAt: z.string().nullable(),
        })).nullable(),
        pagination: z.object({
          total: z.number(),
          offset: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
          nextOffset: z.number().nullable(),
          showing: z.string(),
        }),
      }),
    }),

    // ── QUESTION ─────────────────────────────────────────────────────────────
    z.object({
      type: z.literal("question"),
      message: z.string(),
      fields: z.array(z.object({
        id: z.string(),
        label: z.string(),
        inputType: z.enum(["multiple_choice", "text", "number"]),
        options: z.array(z.string()).nullable(),
      })),
    }),

    // ── CONFIRM ──────────────────────────────────────────────────────────────
    z.object({
      type: z.literal("confirm"),
      message: z.string(),
      summary: z.object({
        action: z.enum(["edit", "delete", "pause", "resume"]).nullable(),
        targets: z.array(z.string()).nullable(),
        count: z.number().nullable(),
        affected: z.string().nullable(),
        unaffected: z.string().nullable(),
      }),
    }),

    // ── SUCCESS ──────────────────────────────────────────────────────────────
    z.object({
      type: z.literal("success"),
      message: z.string(),
      count: z.number(),
    }),

  ]),
});
// ─── Types for DB tool results ────────────────────────────────────────────────

interface DbLocation {
  id: string;
  latitude: number;
  longitude: number;
  autoCollect: boolean;
  hidden: boolean;
}

interface DbPin {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  hotspotId: string | null;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  description: string | null;
  image: string | null;
  link: string | null;
  multiPin: boolean;
  hidden: boolean;
  limit: number;
  remaining: number;
  locations?: DbLocation[] | null;
}

interface DbPagination {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
  showing: string;
}

interface DbQueryPinsResult {
  pins: DbPin[];
  pagination: DbPagination;
}


type StructuredAgentResponse = z.infer<typeof AgentResponseSchema>["response"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLangChainMessages(msgs: { role: MessageRole; text: string }[]): BaseMessage[] {
  return msgs.map((m) => {
    if (m.role === "user") return new HumanMessage(m.text);
    if (m.role === "assistant") return new AIMessage(m.text);
    return new SystemMessage(m.text);
  });
}

function stageFromResponse(r: StructuredAgentResponse): AgentStage {
  switch (r.type) {
    case "question": return "clarifying";
    case "confirm": return "confirming";
    case "success": return "done";
    default: return "extracting_intent";
  }
}
// Add above runCreatorAgent
function buildPinListFromToolResult(toolResultJson: string): PinListResponse {
  const { pins, pagination } = JSON.parse(toolResultJson) as DbQueryPinsResult;
  const today = new Date();

  const standalone = pins
    .filter((p) => !p.hotspotId)
    .map((p) => ({
      id: p.id,
      title: p.title,
      startDate: p.startDate,
      endDate: p.endDate,
      status: (
        p.endDate && new Date(p.endDate) < today ? "expired" as const :
          p.remaining === 0 && p.limit > 0 ? "fully_claimed" as const :
            p.limit === 0 ? "collection_disabled" as const :
              "active" as const
      ),
      claimed: p.limit - p.remaining,
      redeemed: 0,
      remaining: p.remaining,
      hotspotId: p.hotspotId,
      latitude: p.latitude,
      longitude: p.longitude,
      radius: p.radius,
      description: p.description,
      image: p.image,
      link: p.link,
      multiPin: p.multiPin,
      hidden: p.hidden,
      locations: p.locations ?? [],
    }));

  return {
    type: "pin_list",
    mode: "view",
    data: {
      standalone,
      hotspots: [],
      pagination,
    },
  };
}

function buildDefaultIntent(priorIntent?: Partial<PinIntent> | null): PinIntent {
  return {
    count: priorIntent?.count ?? 0,
    countSpecified: priorIntent?.countSpecified ?? false,
    query: priorIntent?.query ?? null,
    area: priorIntent?.area ?? null,
    areaType: priorIntent?.areaType ?? "unknown",
    confirmed: false,
    isNiche: priorIntent?.isNiche ?? false,
    pinNumber: priorIntent?.pinNumber ?? 1,
    ambiguousPinIntent: false,
  };
}

function buildSessionContext(
  prior?: Partial<PinIntent> | null,
  loadMore?: boolean,
  loadMoreOffset?: number,
  loadMoreType?: string,
): string {
  const today = new Date().toISOString().split("T")[0]!;

  if (loadMore && loadMoreType && loadMoreOffset !== undefined) {
    const toolMap: Record<string, string> = {
      "pin_list": `query_pins with offset=${loadMoreOffset} and limit=10`,
      "report": `query_analytics_detail with offset=${loadMoreOffset} and limit=10 and sortBy="claimRate"`,
      "collector_report": `query_collector_report with offset=${loadMoreOffset} and limit=10`,
    };

    const instruction = toolMap[loadMoreType] ?? `query_pins with offset=${loadMoreOffset}`;

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION — ${today}  [LOAD MORE]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Call ${instruction} immediately.
Return type="${loadMoreType}"
Include the pagination object from the tool response in the data field.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION — ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prior intent query : ${prior?.query ?? "none"}
Prior intent area  : ${prior?.area ?? "none"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}



// ─── System Prompt ────────────────────────────────────────────────────────────

const CREATOR_AGENT_SYSTEM_PROMPT = `You are an intelligent assistant for a location-based pin platform.
You help creators manage their pins, hotspots, analytics, and collectors.
You have DB tools to read and write data. You never call external APIs.

intent=view pins          → query_pins                                       → type="pin_list"
intent=edit pins          → query_pins                                       → type="pin_list" mode="edit"
intent=delete pins        → query_pins                                       → type="pin_list" mode="delete"
intent=view hotspots      → query_hotspots + query_hotspot_drops             → type="hotspot_list"
intent=edit hotspot       → query_hotspots                                   → type="hotspot_list" mode="edit"
intent=delete hotspot     → query_hotspots                                   → type="hotspot_list" mode="delete"
intent=pause hotspot      → query_hotspots                                   → type="hotspot_list" mode="pause"
intent=resume hotspot     → query_hotspots                                   → type="hotspot_list" mode="resume"
intent=analytics          → query_analytics_summary                          → type="analytics"
intent=report             → query_analytics_summary + query_analytics_detail → type="report"
intent=collectors         → query_collector_report                           → type="collector_report"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTING RULE — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When user wants to edit, delete, pause, resume any pin or hotspot:
  → NEVER ask "which pin?" — query immediately
  → For pins: call query_pins → return type="list"
  → For hotspots: call query_hotspots → return type="list"
  → The UI handles selection. Your job is to show the list only.

For delete intent: return type="list" action="delete" — NEVER return __PINLIST__

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOTSPOT QUERY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

query_hotspots parameters:
  isActive=true   → "show active hotspots" / "list active hotspots"
  isActive=false  → "show paused hotspots"
  isActive=null   → all hotspots (no filter)
  limit=N         → "show me 5 hotspots" → limit=5
  offset=0        → always start at 0 for first page

When showing hotspot pins (__PINLIST__):
  → Call query_hotspots first to get hotspot list
  → For each hotspot call query_hotspot_drops to get drops
  → Assemble data.hotspots[] with id, hotspotName, isActive, dropEveryDays, dropCount, drops[]

When user message contains "SYSTEM: hotspotId=...":
  → Extract the hotspotId after "hotspotId="
  → Call edit_hotspot / delete_hotspot / pause_hotspot / resume_hotspot directly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDIT FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When user message contains "SYSTEM: locationGroupIds=abc,def":
  → Extract the IDs after "locationGroupIds="
  → Call query_pins_by_ids with those IDs
  → Proceed to edit_pins / delete_pins with those same IDs

When user message contains "SYSTEM: locationGroupIds=... action=delete":
  → Call delete_pins immediately with those IDs
  → Return type="confirm" then type="success" after user confirms

When user message contains "SYSTEM: hotspotId=... action=edit":
  → Call edit_hotspot with the hotspotId and fields from the message
  → Return type="confirm" then type="success"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PINLIST DATA RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When returning message="__PINLIST__", data MUST include:
- standalone: pins where hotspotId is null
- hotspots: array of { id, hotspotName, isActive, dropEveryDays, dropCount, drops[] }
- pagination: copied verbatim from tool response

For each pin row compute:
- claimed = limit - remaining
- redeemed = 0 (if not available from tool)
- status: "active" if endDate >= today AND remaining > 0
          "expired" if endDate < today
          "fully_claimed" if remaining = 0 AND limit > 0
          "collection_disabled" if limit = 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGINATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All paginated tools return { total, offset, limit, hasMore, nextOffset, showing }.
ALWAYS copy this pagination object verbatim into your data.pagination field.
Default limit is 10. Load more button appears when total > 10.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL DISCIPLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Viewing pins         → 1 tool  (query_pins)
Viewing hotspots     → 1-3 tools (query_hotspots + query_hotspot_drops per hotspot)
Analytics summary    → 1 tool  (query_analytics_summary)
Full report          → 2 tools (query_analytics_summary + query_analytics_detail)
Collector report     → 1 tool  (query_collector_report)
Edit/delete pins     → 2 tools (query_pins → list shown → user selects → write tool)
Edit/delete hotspot  → 2 tools (query_hotspots → list shown → user selects → write tool)

NEVER call same tool twice in one turn.
NEVER call more than 4 tools in one turn.
If 0 results → respond with type="info" and a plain message immediately.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIST ITEM RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return type="list" ONLY when an action follows selection.
Label format: "Title (StartMonth Day – EndMonth Day, Year)"
Sublabel: null unless labels clash
NEVER put internal ids or cuid strings in label or sublabel.
NEVER show template LocationGroups.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIRMATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Needs confirmation: edit, delete, hide, pause, resume, delete hotspot
No confirmation needed: viewing, analytics, reports, collectors

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Never expose redeemCode
2. Never write to any User record
3. All queries scoped to creatorId (tools inject it)
4. Never show template LocationGroup in any list
5. Confirm before any write
6. Analytics → aggregates only, never individual consumer rows
7. Empty/null edit field → preserve existing value
8. LocationConsumer never touched, never deleted
9. Never put raw ids or cuid strings in any user-facing label
`;

// ─── Main Runner ──────────────────────────────────────────────────────────────

export async function runCreatorAgent(input: CreatorAgentInput): Promise<CreatorAgentOutput> {
  const { messages, creatorId, priorIntent, loadMore, loadMoreOffset, loadMoreType } = input;
  const isLoadMorePins = loadMore && loadMoreType === "pin_list" && loadMoreOffset !== undefined;

  // ── SHORT-CIRCUIT: list pins → DB only, no LLM ─────────────────────────
  if (isLoadMorePins) {
    const tools = createDbTools(creatorId);
    const queryPinsTool = tools.find(t => t.name === "query_pins")!;

    const toolResult = await queryPinsTool.invoke({
      filter: priorIntent?.lastPinFilter ?? "all",
      search: priorIntent?.lastPinSearch ?? null,
      area: priorIntent?.lastPinArea ?? null,
      limit: 10,
      offset: loadMoreOffset,
    });

    return {
      reply: JSON.stringify(buildPinListFromToolResult(toolResult)),
      stage: "extracting_intent",
      intent: buildDefaultIntent(priorIntent),
    };
  }

  // ── Everything else → LLM agent as before ──────────────────────────────
  const tools = createDbTools(creatorId);
  const systemPrompt = CREATOR_AGENT_SYSTEM_PROMPT + buildSessionContext(
    priorIntent, loadMore, loadMoreOffset, loadMoreType
  );

  const agent = createAgent({
    model: new ChatOpenAI({ model: "gpt-5.4-mini", temperature: 0 }),
    tools,
    systemPrompt,
    name: "CreatorAgent",
    responseFormat: providerStrategy(AgentResponseSchema),
  });

  console.log("[runCreatorAgent] Starting", { creatorId, messageCount: messages.length });

  const result = await agent.invoke(
    { messages: toLangChainMessages(messages) },
    { recursionLimit: 12 }
  );

  const agentResponse = result.structuredResponse.response;

  console.log("[runCreatorAgent] Done:", { type: agentResponse.type });

  return {
    reply: JSON.stringify(agentResponse),
    stage: stageFromResponse(agentResponse),
    intent: {
      count: priorIntent?.count ?? 0,
      countSpecified: priorIntent?.countSpecified ?? false,
      query: priorIntent?.query ?? null,
      area: priorIntent?.area ?? null,
      areaType: priorIntent?.areaType ?? "unknown",
      confirmed: agentResponse.type === "success",
      isNiche: priorIntent?.isNiche ?? false,
      pinNumber: priorIntent?.pinNumber ?? 1,
      ambiguousPinIntent: false,
    },
  };
}