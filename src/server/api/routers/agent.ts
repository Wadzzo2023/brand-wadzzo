// src/server/api/routers/agent.ts
// Changes vs original:
//   • DB writes removed from the mutation handler
//   • After generate_pins fires, we enqueue a QStash job and create a
//     LocationGroupJob row, returning jobId to the client
//   • New `jobStatus` query so the frontend can poll progress

import { z } from "zod";
import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import { generateText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { agentTools } from "~/lib/agent/tools";
import { qstash } from "~/lib/qstash"; // your existing QStash client
import type {
  AgentState,
  AgentStep,
  EventData,
  LandmarkData,
  Message,
  PinItem,
} from "~/lib/agent/types";
import { BASE_URL } from "~/lib/common";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString();
}
function in100YearsISO() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 100);
  return d.toISOString();
}

const SEARCH_STEPS = new Set<AgentStep>(["event_search", "landmark_search"]);
const GENERATE_STEPS = new Set<AgentStep>([
  "event_final_confirm",
  "landmark_final_confirm",
]);
const DETERMINISTIC_STEPS = new Set<AgentStep>([
  "landmark_confirm_list",
  "landmark_redeem_mode",
  "landmark_pin_config",
  "event_confirm_list",
  "event_pin_dates",
  "event_pin_config",
]);

// ─── Slim state helpers ───────────────────────────────────────────────────────

function slimPinForPrompt(p: PinItem) {
  return {
    title: p.title,
    description: p.description?.slice(0, 80),
    latitude: p.latitude,
    longitude: p.longitude,
    startDate: p.startDate,
    endDate: p.endDate,
    pinNumber: p.pinNumber,
    pinCollectionLimit: p.pinCollectionLimit,
    autoCollect: p.autoCollect,
    radius: p.radius,
  };
}
function slimEventForPrompt(e: EventData) {
  return { id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate, latitude: e.latitude, longitude: e.longitude };
}
function slimLandmarkForPrompt(l: LandmarkData) {
  return { id: l.id, title: l.title, latitude: l.latitude, longitude: l.longitude };
}
function slimStateForToolPrompt(state: AgentState) {
  const step = state.step as AgentStep;
  if (GENERATE_STEPS.has(step)) {
    return { step: state.step, task: state.task, redeemMode: state.redeemMode, pins: (state.pins ?? []).map(slimPinForPrompt) };
  }
  return { step: state.step, task: state.task, searchArea: state.searchArea };
}
function slimStateForJsonPrompt(state: AgentState) {
  return {
    step: state.step, task: state.task, searchArea: state.searchArea,
    redeemMode: state.redeemMode, pinConfig: state.pinConfig,
    selectedEvents: (state.selectedEvents ?? []).map(slimEventForPrompt),
    selectedLandmarks: (state.selectedLandmarks ?? []).map(slimLandmarkForPrompt),
    pins: (state.pins ?? []).map(slimPinForPrompt),
  };
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildToolPrompt(state: AgentState): string {
  const step = state.step as AgentStep;
  const canSearch = SEARCH_STEPS.has(step);
  const canGenerate = GENERATE_STEPS.has(step);
  const toolRules = canSearch
    ? `- Call search_events or search_landmarks to fetch real data now.`
    : canGenerate
      ? `- Call generate_pins with the confirmed pin payloads from state.pins.`
      : `- Do NOT call any tools. Just converse naturally.`;

  return `
You are the Wadzzo Pin Generation Agent.
TODAY: ${todayISO()}
CURRENT STEP: ${step}
CURRENT STATE: ${JSON.stringify(slimStateForToolPrompt(state))}
TOOL RULES FOR THIS STEP:
${toolRules}
Important:
- NEVER call search_events or search_landmarks unless CURRENT STEP is "event_search" or "landmark_search"
- NEVER call generate_pins unless CURRENT STEP is "event_final_confirm" or "landmark_final_confirm"
- For all other steps just reply naturally, no tool calls
Converse naturally. Do NOT output JSON.
`.trim();
}

function buildJsonPrompt(state: AgentState, toolData: ToolPassData): string {
  const t = todayISO();
  const y = in100YearsISO();
  const slimToolData = {
    eventsFound: toolData.eventsFound ? toolData.eventsFound.map(slimEventForPrompt) : null,
    landmarksFound: toolData.landmarksFound ? toolData.landmarksFound.map(slimLandmarkForPrompt) : null,
    pinsGenerated: toolData.pinsGenerated ? { count: toolData.pinsGenerated.count } : null,
  };

  return `
You are the Wadzzo response formatter. Output ONLY a single JSON object — no prose, no markdown, no code fences.
TODAY: ${t}
IN_100_YEARS: ${y}
CURRENT STATE:
${JSON.stringify(slimStateForJsonPrompt(state), null, 2)}
TOOL RESULTS THIS TURN:
${JSON.stringify(slimToolData, null, 2)}

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
- Default: radius=2, autoCollect=false
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

function buildQuickMessagePrompt(step: AgentStep, state: AgentState): string {
  const stepMessages: Partial<Record<AgentStep, string>> = {
    landmark_confirm_list: `The user just confirmed their landmark selection. ${(state.selectedLandmarks ?? state.landmarks ?? []).length} landmarks are selected. Write one short friendly sentence telling them you're showing the pin configuration options now.`,
    landmark_pin_config: `The user just configured their landmark pins. Write one short friendly sentence telling them you're showing the final review.`,
    event_confirm_list: `The user just confirmed their event selection. ${(state.selectedEvents ?? state.events ?? []).length} events are selected. Write one short friendly sentence telling them you'll now set up the dates.`,
    event_pin_dates: `The user just set the dates for their event pins. Write one short friendly sentence telling them you're showing the pin configuration options now.`,
    event_pin_config: `The user just configured their event pins. Write one short friendly sentence telling them you're showing the final review.`,
    landmark_redeem_mode: `The user just chose their redeem code mode. Write one short friendly sentence telling them you're now showing the final review.`,
  };
  const context = stepMessages[step] ?? `Current step: ${step}. Write one short friendly confirmation sentence.`;
  return `You are a friendly assistant for a pin generation app called Wadzzo. ${context} Be concise and natural. No JSON, no lists, no markdown.`;
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

// ─── Extract tool results ─────────────────────────────────────────────────────

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

// ─── Deterministic step transitions ───────────────────────────────────────────

function enforceStepTransition(
  currentStep: AgentStep,
  state: AgentState,
  toolData: ToolPassData,
  parsed: ParsedResponse,
): ParsedResponse {
  type CfgMap = Record<string, Record<string, unknown>>;

  if (currentStep === "event_confirm_list") {
    const items = (state.selectedEvents ?? state.events ?? []).map((e) => ({
      id: e.id, title: e.title, defaultStart: e.startDate, defaultEnd: e.endDate,
    }));
    return { ...parsed, step: "event_pin_dates", uiData: { type: "date_picker", data: { items } } };
  }

  if (currentStep === "event_pin_dates") {
    const items = (state.selectedEvents ?? state.events ?? []).map((e) => ({ id: e.id, title: e.title, latitude: e.latitude, longitude: e.longitude }));
    return { ...parsed, step: "event_pin_config", uiData: { type: "pin_config_form", data: { items, isLandmark: false } } };
  }

  if (currentStep === "event_pin_config") {
    const cfgMap = (state.pinConfig ?? {}) as CfgMap;
    const pins: PinItem[] = (state.selectedEvents ?? []).map((e) => {
      const cfg = cfgMap[e.id] ?? {};
      return {
        title: e.title, description: e.description, latitude: e.latitude, longitude: e.longitude,
        venue: e.venue, address: e.address, url: e.url, image: e.image,
        startDate: (cfg.startDate as string) ?? e.startDate,
        endDate: (cfg.endDate as string) ?? e.endDate,
        pinNumber: (cfg.pinNumber as number) ?? 5,
        pinCollectionLimit: (cfg.pinCollectionLimit as number) ?? 100,
        autoCollect: (cfg.autoCollect as boolean) ?? false,
        radius: (cfg.radius as number) ?? 2,
      };
    });
    return { ...parsed, step: "event_final_confirm", uiData: { type: "confirm", data: { pins } } };
  }

  if (currentStep === "landmark_confirm_list") {
    const items = (state.selectedLandmarks ?? state.landmarks ?? []).map((l) => ({ id: l.id, title: l.title, latitude: l.latitude, longitude: l.longitude }));
    return { ...parsed, step: "landmark_pin_config", uiData: { type: "pin_config_form", data: { items, isLandmark: true } } };
  }

  if (currentStep === "landmark_pin_config") {
    return { ...parsed, step: "landmark_redeem_mode", uiData: { type: "redeem_mode_select", data: {} } };
  }

  if (currentStep === "landmark_redeem_mode") {
    const cfgMap = (state.pinConfig ?? {}) as CfgMap;
    const start = todayISO();
    const end = in100YearsISO();
    const pins: PinItem[] = (state.selectedLandmarks ?? []).map((l) => {
      const cfg = cfgMap[l.id] ?? {};
      return {
        title: l.title, description: l.description, latitude: l.latitude, longitude: l.longitude,
        venue: l.venue, address: l.address, url: l.url, image: l.image,
        startDate: start, endDate: end,
        pinNumber: 1, pinCollectionLimit: 999999,
        autoCollect: (cfg.autoCollect as boolean) ?? false,
        radius: (cfg.radius as number) ?? 2,
      };
    });
    return { ...parsed, step: "landmark_final_confirm", uiData: { type: "confirm", data: { pins } } };
  }

  if (toolData.pinsGenerated) {
    return {
      ...parsed, step: "done",
      stateUpdates: { ...parsed.stateUpdates, pins: toolData.pinsGenerated.pins },
      uiData: { type: "pin_result", data: { count: toolData.pinsGenerated.count } },
    };
  }

  if (toolData.eventsFound?.length && currentStep === "event_search") {
    return {
      ...parsed, step: "event_confirm_list",
      stateUpdates: { ...parsed.stateUpdates, events: toolData.eventsFound, selectedEvents: toolData.eventsFound },
      uiData: { type: "event_list", data: { events: toolData.eventsFound } },
    };
  }

  if (toolData.landmarksFound?.length && currentStep === "landmark_search") {
    return {
      ...parsed, step: "landmark_confirm_list",
      stateUpdates: { ...parsed.stateUpdates, landmarks: toolData.landmarksFound, selectedLandmarks: toolData.landmarksFound },
      uiData: { type: "landmark_list", data: { landmarks: toolData.landmarksFound } },
    };
  }

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
  redeemMode: z.enum(["separate", "single"]).optional(),
  pendingModification: z.object({
    indices: z.array(z.number()).optional(),
    names: z.array(z.string()).optional(),
  }).optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const agentRouter = createTRPCRouter({
  // ── poll job progress ──────────────────────────────────────────────────────
  jobStatus: creatorProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.locationGroupJob.findUnique({
        where: { id: input.jobId },
        select: {
          id: true,
          status: true,
          total: true,
          completed: true,
          log: true,
          error: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!job) throw new Error("Job not found");
      return {
        jobId: job.id,
        status: job.status as "pending" | "processing" | "completed" | "failed",
        total: job.total,
        completed: job.completed,
        log: job.log as Array<{ title: string; status: "ok" | "error"; error?: string }>,
        error: job.error,
        createdAt: job.createdAt.getTime(),
        updatedAt: job.updatedAt.getTime(),
      };
    }),

  // ── main chat mutation ─────────────────────────────────────────────────────
  chat: creatorProcedure
    .input(z.object({
      message: z.string(),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      state: AgentStateSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { message, history, state } = input;
      const currentStep = state.step as AgentStep;

      const MAX_HISTORY = 6;
      const trimmedHistory = history.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.content.length > 400
          ? m.content.slice(0, 400) + "…"
          : m.content,
      }));

      const baseMessages: CoreMessage[] = [
        ...trimmedHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message },
      ];

      const needsToolCall = SEARCH_STEPS.has(currentStep) || GENERATE_STEPS.has(currentStep);
      const isDeterministic = DETERMINISTIC_STEPS.has(currentStep);

      // ── Fast path: deterministic steps ──────────────────────────────────

      if (isDeterministic) {
        const emptyParsed: ParsedResponse = { message: "", step: currentStep, stateUpdates: {}, uiData: null };
        const enforced = enforceStepTransition(
          currentStep, state as AgentState,
          { eventsFound: null, landmarksFound: null, pinsGenerated: null },
          emptyParsed,
        );
        const quickMsg = await generateText({
          model: openai("gpt-4o-mini"),
          messages: [{ role: "user" as const, content: buildQuickMessagePrompt(currentStep, state as AgentState) }],
        });
        return {
          message: quickMsg.text.trim(),
          state: { ...(state as AgentState), ...enforced.stateUpdates, step: enforced.step },
          uiData: enforced.uiData ?? undefined,
          jobId: undefined,
        };
      }

      // ── Pass 1: Tool calling ─────────────────────────────────────────────

      let pass1: Awaited<ReturnType<typeof generateText>> | null = null;
      let toolData: ToolPassData = { eventsFound: null, landmarksFound: null, pinsGenerated: null };

      if (needsToolCall) {
        const scopedTools = GENERATE_STEPS.has(currentStep)
          ? { generate_pins: agentTools.generate_pins }
          : { search_events: agentTools.search_events, search_landmarks: agentTools.search_landmarks };

        pass1 = await generateText({
          model: openai("gpt-4o"),
          system: buildToolPrompt(state as AgentState),
          tools: scopedTools,
          maxSteps: 5,
          messages: baseMessages,
        });

        toolData = extractToolData(pass1.response.messages);

        // ── CHANGED: enqueue QStash job instead of inline DB writes ──────
        if (toolData.pinsGenerated?.pins.length) {
          const { pins } = toolData.pinsGenerated;
          const redeemMode = (state as AgentState).redeemMode ?? "separate";
          const creatorId = ctx.session.user.id;

          // 1. Create the job row (pending)
          const job = await ctx.db.locationGroupJob.create({
            data: {
              creatorId,
              status: "pending",
              total: pins.length,
              payload: pins as object[],
              redeemMode,
            },
          });

          // 2. Enqueue the QStash job pointing at our API route
          await qstash.publishJSON({
            url: `${BASE_URL}/api/create-pins`,
            body: { jobId: job.id, creatorId, pins, redeemMode },
            // Retry up to 2 times on non-2xx
            retries: 2,
          });

          // 3. Return jobId to client so it can poll progress
          const count = pins.length;
          return {
            message: `✅ Got it! Creating ${count} pin${count !== 1 ? "s" : ""} in the background — you can track progress below.`,
            state: {
              ...(state as AgentState),
              step: "done" as AgentStep,
              pins,
            },
            uiData: {
              type: "pin_result" as const,
              data: { count, jobId: job.id },
            },
            jobId: job.id,
          };
        }

        // ── Fast-path: search results → skip Pass 2 ───────────────────
        const hasResults = (toolData.landmarksFound?.length ?? 0) + (toolData.eventsFound?.length ?? 0) > 0;

        if (hasResults && SEARCH_STEPS.has(currentStep)) {
          const syntheticParsed: ParsedResponse = {
            message: toolData.landmarksFound?.length && currentStep === "landmark_search"
              ? `Found ${toolData.landmarksFound.length} landmarks. Please select which ones you'd like to use.`
              : toolData.eventsFound?.length && currentStep === "event_search"
                ? `Found ${toolData.eventsFound.length} events. Please select which ones you'd like to use.`
                : "Search complete.",
            step: currentStep, stateUpdates: {}, uiData: null,
          };
          const enforced = enforceStepTransition(currentStep, state as AgentState, toolData, syntheticParsed);
          return {
            message: enforced.message,
            state: { ...(state as AgentState), ...enforced.stateUpdates, step: enforced.step },
            uiData: enforced.uiData ?? undefined,
            jobId: undefined,
          };
        }
      }

      // ── Pass 2: JSON formatter ─────────────────────────────────────────

      const pass2 = await generateText({
        model: openai("gpt-4o-mini"),
        system: buildJsonPrompt(state as AgentState, toolData),
        messages: baseMessages,
      });

      let parsed: ParsedResponse;
      try {
        const clean = pass2.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(clean) as ParsedResponse;
      } catch {
        parsed = { message: pass2.text || (pass1?.text ?? ""), step: currentStep, stateUpdates: {}, uiData: null };
      }

      const enforced = enforceStepTransition(currentStep, state as AgentState, toolData, parsed);
      const updatedState: AgentState = { ...(state as AgentState), ...enforced.stateUpdates, step: enforced.step };

      return {
        message: enforced.message,
        state: updatedState,
        uiData: enforced.uiData ?? undefined,
        jobId: undefined,
      };
    }),
});