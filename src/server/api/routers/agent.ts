// src/server/api/routers/agent.ts

import { z } from "zod";
import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import { generateText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { agentTools } from "~/lib/agent/tools";
import { randomLocation as getLocationInLatLngRad } from "~/utils/map";
import type {
  AgentState,
  AgentStep,
  EventData,
  LandmarkData,
  Message,
  PinItem,
} from "~/lib/agent/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString();
}
function in100YearsISO() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 100);
  return d.toISOString();
}

// Steps that expect a search tool call — all others must NOT re-call search tools
const SEARCH_STEPS = new Set<AgentStep>(["event_search", "landmark_search"]);

// Steps that expect generate_pins
const GENERATE_STEPS = new Set<AgentStep>(["event_final_confirm", "landmark_final_confirm"]);

// ─── Pass 1: conversational, step-aware tool gating ──────────────────────────

function buildToolPrompt(state: AgentState): string {
  const step = state.step as AgentStep;
  const canSearch = SEARCH_STEPS.has(step);
  const canGenerate = GENERATE_STEPS.has(step);

  // When not in a search step, explicitly forbid re-calling search tools.
  // This stops the model from re-searching when it sees prior search queries in history.
  const toolRules = canSearch
    ? `- Call search_events or search_landmarks to fetch real data now.`
    : canGenerate
      ? `- Call generate_pins with the confirmed pin payloads from state.pins.`
      : `- Do NOT call any tools. Just converse naturally.`;

  return `
You are the Wadzzo Pin Generation Agent.

TODAY: ${todayISO()}
CURRENT STEP: ${step}
CURRENT STATE: ${JSON.stringify(state)}

TOOL RULES FOR THIS STEP:
${toolRules}

Important:
- NEVER call search_events or search_landmarks unless CURRENT STEP is "event_search" or "landmark_search"
- NEVER call generate_pins unless CURRENT STEP is "event_final_confirm" or "landmark_final_confirm"
- For all other steps just reply naturally, no tool calls

Converse naturally. Do NOT output JSON.
`.trim();
}

// ─── Pass 2: strict JSON formatter ───────────────────────────────────────────

function buildJsonPrompt(state: AgentState, toolData: ToolPassData): string {
  const t = todayISO();
  const y = in100YearsISO();

  return `
You are the Wadzzo response formatter. Output ONLY a single JSON object — no prose, no markdown, no code fences.

TODAY: ${t}
IN_100_YEARS: ${y}

CURRENT STATE:
${JSON.stringify(state, null, 2)}

TOOL RESULTS THIS TURN:
${JSON.stringify(toolData, null, 2)}

━━━ FLOW ━━━

EVENT FLOW
  idle/clarify_task       → ask Event or Landmark? uiData={type:"task_select"}
  clarify_task            → user picks event: step="event_search", ask city/area
  event_search            → after search_events: step="event_confirm_list" uiData={type:"event_list",data:{events}}
  event_confirm_list      → after confirmed: step="event_pin_dates" uiData={type:"date_picker",data:{items:[{id,title,defaultStart,defaultEnd}]}}
  event_pin_dates         → after dates: step="event_pin_config" uiData={type:"pin_config_form",data:{items:[{id,title}],isLandmark:false}}
  event_pin_config        → after config: step="event_final_confirm" uiData={type:"confirm",data:{pins}}
  event_final_confirm     → after approved + generate_pins: step="done" uiData={type:"pin_result",data:{count}}

LANDMARK FLOW
  clarify_task            → user picks landmark: step="landmark_search", ask type+count+area
  landmark_search         → after search_landmarks: step="landmark_confirm_list" uiData={type:"landmark_list",data:{landmarks}}
  landmark_confirm_list   → after confirmed: step="landmark_pin_config" (NO date step) uiData={type:"pin_config_form",data:{items,isLandmark:true}}
  landmark_pin_config     → after config: step="landmark_final_confirm" uiData={type:"confirm",data:{pins}}
  landmark_final_confirm  → after approved + generate_pins: step="done" uiData={type:"pin_result",data:{count}}

━━━ RULES ━━━
- Landmark: pinCollectionLimit=999999, pinNumber=1, startDate=${t}, endDate=${y} (always fixed)
- Default: radius=50, autoCollect=false, multiPin=false
- If toolData.eventsFound → step="event_confirm_list"
- If toolData.landmarksFound → step="landmark_confirm_list"
- If toolData.pinsGenerated → step="done"

━━━ OUTPUT ━━━
{
  "message": string,
  "step": string,
  "stateUpdates": {
    "task"?: "event"|"landmark"|null,
    "searchArea"?: string,
    "events"?: EventData[],
    "selectedEvents"?: EventData[],
    "landmarks"?: LandmarkData[],
    "selectedLandmarks"?: LandmarkData[],
    "pins"?: PinItem[]
  },
  "uiData": {type:string,data:any}|null
}
`.trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolPassData {
  eventsFound: EventData[] | null;
  landmarksFound: LandmarkData[] | null;
  pinsGenerated: { count: number; pins: PinItem[] } | null;
}

interface ParsedResponse {
  message: string;
  step: AgentStep;
  stateUpdates: Partial<AgentState>;
  uiData: Message["uiData"] | null;
}

// ─── Extract tool results from response.messages ──────────────────────────────

function extractToolData(responseMessages: CoreMessage[]): ToolPassData {
  const data: ToolPassData = { eventsFound: null, landmarksFound: null, pinsGenerated: null };

  for (const msg of responseMessages) {
    if (msg.role !== "tool") continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (block.type !== "tool-result") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = block.result as Record<string, any>;
      if (block.toolName === "search_events" && Array.isArray(result?.events))
        data.eventsFound = result.events as EventData[];
      if (block.toolName === "search_landmarks" && Array.isArray(result?.landmarks))
        data.landmarksFound = result.landmarks as LandmarkData[];
      if (block.toolName === "generate_pins" && result?.success === true)
        data.pinsGenerated = { count: result.count as number, pins: result.pins as PinItem[] };
    }
  }
  return data;
}

// ─── DB write ─────────────────────────────────────────────────────────────────

async function createLocationGroup(
  db: Parameters<Parameters<typeof creatorProcedure.mutation>[0]>[0]["ctx"]["db"],
  creatorId: string,
  pin: PinItem,
) {
  const pinCount = pin.pinNumber ?? 1;
  const radius = pin.radius ?? 50;

  const locations = Array.from({ length: pinCount }).map(() => {
    const loc = getLocationInLatLngRad(pin.latitude, pin.longitude, radius);
    return { latitude: loc.latitude, longitude: loc.longitude, autoCollect: pin.autoCollect ?? false };
  });

  await db.locationGroup.create({
    data: {
      creatorId,
      title: pin.title,
      description: pin.description,
      startDate: new Date(pin.startDate),
      endDate: new Date(pin.endDate),
      limit: pin.pinCollectionLimit ?? 999999,
      remaining: pin.pinCollectionLimit ?? 999999,
      image: pin.image ?? null,
      link: pin.url ?? null,
      multiPin: pin.multiPin ?? false,
      locations: { createMany: { data: locations } },
    },
  });
}

// ─── Deterministic step transitions ───────────────────────────────────────────
// Priority order:
//   1. Current step transitions (enforced in code — always happen if step matches)
//   2. Tool results (only applied when expected by the current step)
//
// This ordering prevents tool results from overriding mid-flow steps
// (e.g., prevents re-showing event list when user is confirming events)

function enforceStepTransition(
  currentStep: AgentStep,
  state: AgentState,
  toolData: ToolPassData,
  parsed: ParsedResponse,
): ParsedResponse {
  type CfgMap = Record<string, Record<string, unknown>>;

  // ── 1. Step-based transitions (highest priority) ──────────────────────────

  // Event: list confirmed → date picker
  if (currentStep === "event_confirm_list") {
    const items = (state.selectedEvents ?? state.events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      defaultStart: e.startDate,
      defaultEnd: e.endDate,
    }));
    return {
      ...parsed,
      step: "event_pin_dates",
      uiData: { type: "date_picker", data: { items } },
    };
  }

  // Event: dates confirmed → pin config form
  if (currentStep === "event_pin_dates") {
    const items = (state.selectedEvents ?? state.events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
    }));
    return {
      ...parsed,
      step: "event_pin_config",
      uiData: { type: "pin_config_form", data: { items, isLandmark: false } },
    };
  }

  // Event: pin config confirmed → final review
  if (currentStep === "event_pin_config") {
    const cfgMap = (state.pinConfig ?? {}) as CfgMap;
    const pins: PinItem[] = (state.selectedEvents ?? []).map((e) => {
      const cfg = cfgMap[e.id] ?? {};
      return {
        title: e.title,
        description: e.description,
        latitude: e.latitude,
        longitude: e.longitude,
        venue: e.venue,
        address: e.address,
        url: e.url,
        image: e.image,
        startDate: (cfg.startDate as string) ?? e.startDate,
        endDate: (cfg.endDate as string) ?? e.endDate,
        pinNumber: (cfg.pinNumber as number) ?? 5,
        pinCollectionLimit: (cfg.pinCollectionLimit as number) ?? 100,
        autoCollect: (cfg.autoCollect as boolean) ?? false,
        multiPin: (cfg.multiPin as boolean) ?? false,
        radius: (cfg.radius as number) ?? 50,
      };
    });
    return {
      ...parsed,
      step: "event_final_confirm",
      uiData: { type: "confirm", data: { pins } },
    };
  }

  // Landmark: list confirmed → pin config (SKIP date step entirely)
  if (currentStep === "landmark_confirm_list") {
    const items = (state.selectedLandmarks ?? state.landmarks ?? []).map((l) => ({
      id: l.id,
      title: l.title,
    }));
    return {
      ...parsed,
      step: "landmark_pin_config",
      uiData: { type: "pin_config_form", data: { items, isLandmark: true } },
    };
  }

  // Landmark: pin config confirmed → final review
  if (currentStep === "landmark_pin_config") {
    const cfgMap = (state.pinConfig ?? {}) as CfgMap;
    const start = todayISO();
    const end = in100YearsISO();
    const pins: PinItem[] = (state.selectedLandmarks ?? []).map((l) => {
      const cfg = cfgMap[l.id] ?? {};
      return {
        title: l.title,
        description: l.description,
        latitude: l.latitude,
        longitude: l.longitude,
        venue: l.venue,
        address: l.address,
        url: l.url,
        image: l.image,
        startDate: start,
        endDate: end,
        pinNumber: 1,
        pinCollectionLimit: 999999,
        autoCollect: (cfg.autoCollect as boolean) ?? false,
        multiPin: (cfg.multiPin as boolean) ?? false,
        radius: (cfg.radius as number) ?? 50,
      };
    });
    return {
      ...parsed,
      step: "landmark_final_confirm",
      uiData: { type: "confirm", data: { pins } },
    };
  }

  // ── 2. Tool results (only when on a search step or final confirm step) ─────

  if (toolData.pinsGenerated) {
    return {
      ...parsed,
      step: "done",
      stateUpdates: { ...parsed.stateUpdates, pins: toolData.pinsGenerated.pins },
      uiData: { type: "pin_result", data: { count: toolData.pinsGenerated.count } },
    };
  }

  // Only apply search results when we're actually on a search step
  if (toolData.eventsFound?.length && currentStep === "event_search") {
    return {
      ...parsed,
      step: "event_confirm_list",
      stateUpdates: {
        ...parsed.stateUpdates,
        events: toolData.eventsFound,
        selectedEvents: toolData.eventsFound,
      },
      uiData: { type: "event_list", data: { events: toolData.eventsFound } },
    };
  }

  if (toolData.landmarksFound?.length && currentStep === "landmark_search") {
    return {
      ...parsed,
      step: "landmark_confirm_list",
      stateUpdates: {
        ...parsed.stateUpdates,
        landmarks: toolData.landmarksFound,
        selectedLandmarks: toolData.landmarksFound,
      },
      uiData: { type: "landmark_list", data: { landmarks: toolData.landmarksFound } },
    };
  }

  // ── 3. Trust model for everything else (idle, clarify_task, searches) ──────
  return parsed;
}

// ─── Zod input schema ─────────────────────────────────────────────────────────

const AgentStateSchema = z.object({
  step: z.string(),
  task: z.enum(["event", "landmark"]).nullable().optional(),
  searchQuery: z.string().optional(),
  searchArea: z.string().optional(),
  events: z.array(z.any()).optional(),
  selectedEvents: z.array(z.any()).optional(),
  landmarks: z.array(z.any()).optional(),
  selectedLandmarks: z.array(z.any()).optional(),
  pinConfig: z.record(z.string(), z.any()).optional(),
  pins: z.array(z.any()).optional(),
  pendingModification: z
    .object({
      indices: z.array(z.number()).optional(),
      names: z.array(z.string()).optional(),
    })
    .optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const agentRouter = createTRPCRouter({
  chat: creatorProcedure
    .input(
      z.object({
        message: z.string(),
        history: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          }),
        ),
        state: AgentStateSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { message, history, state } = input;
      const currentStep = state.step as AgentStep;

      const baseMessages: CoreMessage[] = [
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ];

      // ── PASS 1: Tool calling (step-gated) ─────────────────────────────────
      // Only pass tools when current step actually expects them.
      // This prevents the model from re-calling search_events mid-flow.

      const shouldUseTool = SEARCH_STEPS.has(currentStep) || GENERATE_STEPS.has(currentStep);

      const pass1 = await generateText({
        model: openai("gpt-4o"),
        system: buildToolPrompt(state as AgentState),
        tools: shouldUseTool ? agentTools : undefined,
        maxSteps: shouldUseTool ? 5 : 1,
        messages: baseMessages,
      });

      const toolData = extractToolData(pass1.response.messages);

      // ── Persist pins immediately after generate_pins fires ─────────────────

      if (toolData.pinsGenerated?.pins.length) {
        await Promise.all(
          toolData.pinsGenerated.pins.map((pin) =>
            createLocationGroup(ctx.db, ctx.session.user.id, pin),
          ),
        );
      }

      // ── PASS 2: Structured JSON ────────────────────────────────────────────

      const pass2Messages: CoreMessage[] = [
        ...baseMessages,
        ...pass1.response.messages,
      ];

      const pass2 = await generateText({
        model: openai("gpt-4o"),
        system: buildJsonPrompt(state as AgentState, toolData),
        messages: pass2Messages,
      });

      // ── Parse JSON ────────────────────────────────────────────────────────

      let parsed: ParsedResponse;
      try {
        const clean = pass2.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(clean) as ParsedResponse;
      } catch {
        parsed = {
          message: pass2.text || pass1.text,
          step: currentStep,
          stateUpdates: {},
          uiData: null,
        };
      }

      // ── Enforce deterministic step transitions ────────────────────────────

      const enforced = enforceStepTransition(currentStep, state as AgentState, toolData, parsed);

      // ── Merge state ───────────────────────────────────────────────────────

      const updatedState: AgentState = {
        ...(state as AgentState),
        ...enforced.stateUpdates,
        step: enforced.step,
      };

      return {
        message: enforced.message,
        state: updatedState,
        uiData: enforced.uiData ?? undefined,
      };
    }),
});