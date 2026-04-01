// src/server/api/routers/agent.ts
// Key changes vs previous version:
//   • DETERMINISTIC_STEPS removed — all steps now route through the LLM
//     so user messages are always read and responded to naturally
//   • detectIntentReset() — checks if the user is abandoning the current
//     flow before any step logic runs; resets state to clarify_task
//   • Tool prompt now instructs model on mid-flow intent changes
//   • buildQuickMessagePrompt receives userMessage so it can respond to
//     the actual message, not just emit a canned confirmation
//   • enforceStepTransition only fires if detectIntentReset() is false

import { z } from "zod";
import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import { generateText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { agentTools } from "~/lib/agent/tools";
import { qstash } from "~/lib/qstash";
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

// Steps that previously bypassed the LLM entirely. Now they still run through
// the LLM — but enforceStepTransition still fires AFTER the LLM responds, so
// the UI progression is preserved while the user's message is actually read.
const TRANSITION_STEPS = new Set<AgentStep>([
  "landmark_confirm_list",
  "landmark_redeem_mode",
  "landmark_pin_config",
  "event_confirm_list",
  "event_pin_dates",
  "event_pin_config",
]);

// ─── Intent reset detection ───────────────────────────────────────────────────
// Called before any step logic. Returns true if the user clearly wants to
// abandon the current flow and start fresh.

const RESET_PHRASES = [
  /\bstart over\b/i,
  /\bstart again\b/i,
  /\brestart\b/i,
  /\bcancel\b/i,
  /\bdiscard\b/i,
  /\bnever mind\b/i,
  /\bforget it\b/i,
  /\bgo back\b/i,
  /\bi (want|need|would like|wanna) (to )?(create|make|add|do) (a |an )?(landmark|event)/i,
  /\bswitch to (landmark|event)/i,
  /\binstead (of|do|create|make)/i,
  /\bactually (i want|let's do|do)/i,
];

function detectIntentReset(message: string, currentStep: AgentStep): boolean {
  if (currentStep === "idle" || currentStep === "clarify_task" || currentStep === "done") {
    return false;
  }
  return RESET_PHRASES.some((re) => re.test(message));
}

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

function buildToolPrompt(state: AgentState, userMessage: string): string {
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
USER'S MESSAGE: "${userMessage}"

TOOL RULES FOR THIS STEP:
${toolRules}

INTENT CHANGE RULES:
- If the user's message clearly wants to switch task (e.g. "I want to do landmarks instead",
  "actually let's do events", "cancel and start over"), do NOT call any tools. Just reply
  warmly acknowledging the change and ask what they'd like to do. The system will reset state.
- If the user asks a question mid-flow (e.g. "what does auto-collect mean?"), answer it
  naturally, then gently remind them where they were in the flow.
- If the user is confused or frustrated, acknowledge it and offer to restart or continue.

IMPORTANT:
- NEVER call search_events or search_landmarks unless CURRENT STEP is "event_search" or "landmark_search"
- NEVER call generate_pins unless CURRENT STEP is "event_final_confirm" or "landmark_final_confirm"
- For all other steps just reply naturally, no tool calls
Converse naturally. Do NOT output JSON.
`.trim();
}

function buildJsonPrompt(state: AgentState, toolData: ToolPassData, userMessage: string): string {
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
USER'S ACTUAL MESSAGE: "${userMessage}"
CURRENT STATE:
${JSON.stringify(slimStateForJsonPrompt(state), null, 2)}
TOOL RESULTS THIS TURN:
${JSON.stringify(slimToolData, null, 2)}

━━━ INTENT CHANGE HANDLING ━━━
If the user's message signals they want to switch task, cancel, or restart (e.g. "actually I want
landmarks", "cancel", "start over", "I changed my mind"), output:
{
  "message": "<warm acknowledgement + ask what they want to do>",
  "step": "clarify_task",
  "stateUpdates": { "task": null },
  "uiData": { "type": "task_select", "data": {} }
}

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
- If the user asks a clarifying question mid-flow, answer it in "message" and keep "step" the same
- If the user seems confused or asks something off-topic, respond helpfully and keep "step" the same

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

// buildQuickMessagePrompt is now used only for TRANSITION_STEPS — but the
// model receives the actual user message so it can respond to it properly.
function buildQuickMessagePrompt(step: AgentStep, state: AgentState, userMessage: string): string {
  const stepContext: Partial<Record<AgentStep, string>> = {
    landmark_confirm_list: `The user just confirmed their landmark selection. ${(state.selectedLandmarks ?? state.landmarks ?? []).length} landmarks are selected. You're about to show pin configuration options.`,
    landmark_pin_config: `The user just configured their landmark pins. You're about to show the final review.`,
    event_confirm_list: `The user just confirmed their event selection. ${(state.selectedEvents ?? state.events ?? []).length} events are selected. You're about to set up dates.`,
    event_pin_dates: `The user just set the dates for their event pins. You're about to show pin configuration options.`,
    event_pin_config: `The user just configured their event pins. You're about to show the final review.`,
    landmark_redeem_mode: `The user just chose their redeem mode. You're about to show the final review.`,
  };

  const ctx = stepContext[step] ?? `Current step: ${step}.`;

  return `You are a friendly assistant for a pin generation app called Wadzzo.
Context: ${ctx}
The user just said: "${userMessage}"

First, respond to what the user actually said — if they asked a question, answer it.
If they said something off-topic or showed hesitation, acknowledge it warmly.
Then in 1-2 sentences, tell them what's happening next in the flow.
Be concise and natural. No JSON, no lists, no markdown.`;
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
// These still run AFTER the LLM has responded and the user's message has been
// read. They just enforce the UI progression, not block the conversation.

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
    const items = (state.selectedEvents ?? state.events ?? []).map((e) => ({
      id: e.id, title: e.title, latitude: e.latitude, longitude: e.longitude,
    }));
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
        type: "EVENT",
      };
    });
    return { ...parsed, step: "event_final_confirm", uiData: { type: "confirm", data: { pins } } };
  }

  if (currentStep === "landmark_confirm_list") {
    const items = (state.selectedLandmarks ?? state.landmarks ?? []).map((l) => ({
      id: l.id, title: l.title, latitude: l.latitude, longitude: l.longitude,
    }));
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
        type: "LANDMARK",
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
  searchQuery: z.string().nullish(),
  searchArea: z.string().nullish(),
  events: z.array(z.any()).nullish(),
  selectedEvents: z.array(z.any()).nullish(),
  landmarks: z.array(z.any()).nullish(),
  selectedLandmarks: z.array(z.any()).nullish(),
  pinConfig: z.record(z.string(), z.any()).nullish(),
  pins: z.array(z.any()).nullish(),
  redeemMode: z.enum(["separate", "single"]).nullish(),
  pendingModification: z.object({
    indices: z.array(z.number()).optional(),
    names: z.array(z.string()).optional(),
  }).nullish(),
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

      // ── Check for intent reset FIRST ──────────────────────────────────────
      // If the user wants to abandon the current flow, reset everything and
      // let a fresh LLM call handle the response naturally.
      if (detectIntentReset(message, currentStep)) {
        const resetResponse = await generateText({
          model: openai("gpt-4o-mini"),
          messages: [{
            role: "user" as const,
            content: `You are a friendly assistant for a pin creation app called Wadzzo.
The user was in the middle of creating ${state.task ?? "pins"} but they said: "${message}"
Respond warmly, acknowledge what they said, confirm you're starting fresh, and ask whether
they'd like to create event pins or landmark pins. Be brief and natural.`,
          }],
        });
        return {
          message: resetResponse.text.trim(),
          state: {
            step: "clarify_task" as AgentStep,
            task: null,
            searchQuery: undefined,
            searchArea: undefined,
            events: [],
            selectedEvents: [],
            landmarks: [],
            selectedLandmarks: [],
            pinConfig: {},
            pins: [],
            redeemMode: undefined,
          },
          uiData: { type: "task_select", data: {} },
          jobId: undefined,
        };
      }

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
      const isTransitionStep = TRANSITION_STEPS.has(currentStep);

      // ── Transition steps: LLM reads the message, then we enforce UI ───────
      // Previously these were "deterministic" and bypassed the LLM entirely.
      // Now the LLM responds to the actual user message first.
      if (isTransitionStep) {
        const quickMsg = await generateText({
          model: openai("gpt-4o-mini"),
          messages: [{ role: "user" as const, content: buildQuickMessagePrompt(currentStep, state as AgentState, message) }],
        });

        const emptyParsed: ParsedResponse = {
          message: quickMsg.text.trim(),
          step: currentStep,
          stateUpdates: {},
          uiData: null,
        };
        const enforced = enforceStepTransition(
          currentStep,
          state as AgentState,
          { eventsFound: null, landmarksFound: null, pinsGenerated: null },
          emptyParsed,
        );
        return {
          message: enforced.message,
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
          system: buildToolPrompt(state as AgentState, message),
          tools: scopedTools,
          maxSteps: 5,
          messages: baseMessages,
        });

        toolData = extractToolData(pass1.response.messages);

        // ── Enqueue QStash job instead of inline DB writes ────────────────
        if (toolData.pinsGenerated?.pins.length) {
          const generatedPins = toolData.pinsGenerated.pins;
          const statePins = (state as AgentState).pins ?? [];
          const pins = generatedPins.map((p, idx) => ({
            ...statePins[idx],
            ...p,
          }));
          const redeemMode = (state as AgentState).redeemMode ?? "separate";
          const creatorId = ctx.session.user.id;

          const job = await ctx.db.locationGroupJob.create({
            data: {
              creatorId,
              status: "pending",
              total: pins.length,
              payload: pins as object[],
              redeemMode,
            },
          });

          await qstash.publishJSON({
            url: `${BASE_URL}/api/create-pins`,
            body: { jobId: job.id, creatorId, pins, redeemMode },
            retries: 2,
          });

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

        // ── Fast-path: search results → skip Pass 2 ───────────────────────
        const hasResults = (toolData.landmarksFound?.length ?? 0) + (toolData.eventsFound?.length ?? 0) > 0;

        if (hasResults && SEARCH_STEPS.has(currentStep)) {
          const syntheticParsed: ParsedResponse = {
            message: toolData.landmarksFound?.length && currentStep === "landmark_search"
              ? `Found ${toolData.landmarksFound.length} landmarks. Please select which ones you'd like to use.`
              : toolData.eventsFound?.length && currentStep === "event_search"
                ? `Found ${toolData.eventsFound.length} events. Please select which ones you'd like to use.`
                : "Search complete.",
            step: currentStep,
            stateUpdates: {},
            uiData: null,
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
        system: buildJsonPrompt(state as AgentState, toolData, message),
        messages: baseMessages,
      });

      let parsed: ParsedResponse;
      try {
        const clean = pass2.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(clean) as ParsedResponse;
      } catch {
        parsed = { message: pass2.text || (pass1?.text ?? ""), step: currentStep, stateUpdates: {}, uiData: null };
      }

      // Only enforce step transition if the formatter didn't already reset
      // the state (i.e. user changed intent and formatter set step=clarify_task)
      const enforced = parsed.step === "clarify_task"
        ? parsed
        : enforceStepTransition(currentStep, state as AgentState, toolData, parsed);

      const updatedState: AgentState = { ...(state as AgentState), ...enforced.stateUpdates, step: enforced.step };

      return {
        message: enforced.message,
        state: updatedState,
        uiData: enforced.uiData ?? undefined,
        jobId: undefined,
      };
    }),
});