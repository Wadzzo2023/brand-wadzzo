// types.ts
// ─── Shared types for the PinDrop Agent ──────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export type AreaType = "city" | "region" | "country" | "worldwide" | "unknown";

// ─────────────────────────────────────────────────────────────────────────────
// Pin
// ─────────────────────────────────────────────────────────────────────────────

export interface Pin {
  id: string;
  type: "EVENT" | "LANDMARK";
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  url?: string;
  image?: string;
  pinCollectionLimit: number;
  pinNumber: number;
  radius: number;
  autoCollect: boolean;
  category?: string;
  address?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent
// ─────────────────────────────────────────────────────────────────────────────

export interface PinIntent {
  query: string | null;
  area: string | null;
  count: number | null;
  areaType: AreaType;
  confirmed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentStage
// FIX: added "idle" and "error" which were used in the frontend but missing here
// ─────────────────────────────────────────────────────────────────────────────

export type AgentStage =
  | "idle"               // FIX: was missing — used as initial state in the frontend
  | "extracting_intent"
  | "clarifying"
  | "searching"
  | "confirming"
  | "dropping_pins"
  | "done"
  | "error";             // FIX: was missing — used in error paths in the frontend

// ─────────────────────────────────────────────────────────────────────────────
// Clarify question
// ─────────────────────────────────────────────────────────────────────────────

export type InputType = "multiple_choice" | "text" | "number";

export interface ClarifyQuestion {
  id: string;
  label: string;
  inputType: InputType;
  options?: string[];
  placeholder?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// City discovery
// ─────────────────────────────────────────────────────────────────────────────

export interface CityDiscoveryResult {
  cities: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// tRPC output
// FIX: reply is always a JSON string of AgentResponse — frontend parses it
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatCreateOutput {
  /**
   * JSON string of an AgentResponse object.
   * The frontend calls JSON.parse(reply) to get the typed AgentResponse,
   * then renders the appropriate block (QuestionBlock, ResultsBlock, etc.).
   */
  reply: string;
  stage: AgentStage;
  intent: PinIntent;
  questions?: ClarifyQuestion[];
  pins?: Pin[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured agent response types (what the agent returns as JSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuestionResponse {
  type: "question";
  message: string;
  fields: ClarifyQuestion[];
}

export interface ResultsResponse {
  type: "results";
  message: string;
  searchType: "EVENT" | "LANDMARK" | "MIXED";
  pins: Pin[];
  confirmPrompt: string;
}

export interface ConfirmResponse {
  type: "confirm";
  message: string;
  summary: {
    what: string;
    where: string;
    count: number;
    type: "EVENT" | "LANDMARK" | "MIXED";
  };
  pins: Pin[];
}

export interface SuccessResponse {
  type: "success";
  message: string;
  count: number;
}

export interface InfoResponse {
  type: "info";
  message: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: AgentResponse[];
  createdAt: Date;
}

export type AgentResponse =
  | QuestionResponse
  | ResultsResponse
  | ConfirmResponse
  | SuccessResponse
  | InfoResponse;

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export const isQuestionResponse = (r: AgentResponse): r is QuestionResponse => r.type === "question";
export const isResultsResponse = (r: AgentResponse): r is ResultsResponse => r.type === "results";
export const isConfirmResponse = (r: AgentResponse): r is ConfirmResponse => r.type === "confirm";
export const isSuccessResponse = (r: AgentResponse): r is SuccessResponse => r.type === "success";
export const isInfoResponse = (r: AgentResponse): r is InfoResponse => r.type === "info";

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseAgentResponse(raw: string): AgentResponse {
  try {
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(clean) as AgentResponse;
    if (!parsed.type) throw new Error("Missing type field");
    return parsed;
  } catch (err) {
    console.error("[parseAgentResponse] Failed to parse:", err);
    return { type: "info", message: raw };
  }
}