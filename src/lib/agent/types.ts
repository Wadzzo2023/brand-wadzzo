// ~/lib/agent/types.ts
// ─── Unified types for Pin Agent (pin-drop + management) ─────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export type AreaType = "city" | "region" | "country" | "worldwide" | "unknown";

export type GroupingMode = "per-location" | "single-group";

export type InputType = "multiple_choice" | "text" | "number";

export type AgentStage =
  | "idle"
  | "extracting_intent"
  | "clarifying"
  | "searching"
  | "confirming"
  | "dropping_pins"
  | "done"
  | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Pagination (shared envelope used by all paginated tools)
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
  showing: string; // e.g. "1–25 of 87"
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent classification (from classify-intent.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type IntentType = "management" | "pin_drop" | "ambiguous";

export type SubIntent =
  | "edit"
  | "delete"
  | "pause"
  | "resume"
  | "list"
  | "analytics"
  | "collectors"
  | "recommend"
  | "search"
  | "create"
  | "unknown";

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  subIntent: SubIntent;
  reasoning: string;
  missingInfo: string | null;
  extractedSubject: string | null;
}

export interface DbPresenceCheck {
  found: boolean;
  count: number;
  sample: {
    id: string;
    title: string;
    startDate: Date | null;
    endDate: Date | null;
  }[];
}

export type AgentMode = "management" | "pin_drop";

// ─────────────────────────────────────────────────────────────────────────────
// Pin
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratedPin {
  id: string;
  type: "EVENT" | "LANDMARK";
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  url?: string;
  image?: string;
  address?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface Pin extends GeneratedPin {
  startDate: string;
  endDate: string;
  pinCollectionLimit: number;
  pinNumber: number;
  radius: number;
  autoCollect: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin options
// ─────────────────────────────────────────────────────────────────────────────

export interface PinOptions {
  autoCollect: boolean;
  groupingMode: GroupingMode;
  pinNumber: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin intent (search pipeline)
// ─────────────────────────────────────────────────────────────────────────────

export interface PinIntent {
  query: string | null;
  area: string | null;
  count: number | null;
  countSpecified: boolean;
  areaType: AreaType;
  confirmed: boolean;
  isNiche: boolean;
  pinNumber?: number;
  ambiguousPinIntent: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clarify question
// ─────────────────────────────────────────────────────────────────────────────

export interface ClarifyQuestion {
  id: string;
  label: string;
  inputType: InputType;
  options?: string[];
  placeholder?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Magic-string payload types (returned in InfoResponse.data)
// ─────────────────────────────────────────────────────────────────────────────

export interface PinListPinRow {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: "active" | "expired" | "fully_claimed" | "collection_disabled";
  claimed: number;
  redeemed: number;
  remaining: number;
  hotspotId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number | null;
  description?: string | null;
  image?: string | null;
  link?: string | null;
  multiPin?: boolean;
  hidden?: boolean;
  locations?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    autoCollect: boolean;
    hidden: boolean;
  }>;
}

export interface PinListData {
  standalone: PinListPinRow[];
  hotspots: Array<{
    hotspotName: string;
    isActive: boolean;
    drops: PinListPinRow[];
  }>;
  // pagination added in all paginated responses
  pagination?: PaginationMeta;
}

export interface AnalyticsData {
  totalClaimed: number;
  totalRedeemed: number;
  claimRate: string;
  redeemRate?: string;
  perPin: Array<{
    title: string;
    claimed: number;
    redeemed: number;
    limit: number;
    remaining: number;
    claimRate: string;
  }>;
  insights?: string;
}

export interface CollectorsData {
  pinTitle: string;
  collectors: Array<{
    name: string;
    email: string;
    claimedAt: string;
    isRedeemed: boolean;
  }>;
}

// ─── ReportData ───────────────────────────────────────────────────────────────
// Returned when user says "generate report / pin report".
// Combines query_analytics_summary + query_analytics_detail in one response.

export interface ReportData {
  summary: {
    totalClaimed: number;
    totalRedeemed: number;
    claimRate: string;
    redeemRate: string;
    totalPins: number;
    activePins: number;
    expiredPins: number;
    fullyClaimedPins: number;
  };
  topPerformers: Array<{
    id: string;
    title: string;
    claimed: number;
    limit: number;
    remaining: number;
    claimRate: string;
  }>;
  perPin: Array<{
    id: string;
    title: string;
    claimed: number;
    redeemed: number;
    limit: number;
    remaining: number;
    claimRate: string;
  }>;
  pagination?: PaginationMeta;
  generatedAt: string; // ISO string
}

// ─── CollectorReportData ──────────────────────────────────────────────────────
// Returned when user says "show collection report for [email]" or
// "show collection report" (all collectors).

export interface CollectorReportData {
  mode: "single_collector" | "all_collectors";

  // mode === "single_collector"
  collector?: {
    name: string;
    email: string;
    image: string | null;
    totalCollected: number;
    totalRedeemed: number;
  };
  collections?: Array<{
    pinId: string;
    pinTitle: string;
    pinStartDate: string | null;
    pinEndDate: string | null;
    claimedAt: string | null;
    isRedeemed: boolean;
  }>;

  // mode === "all_collectors"
  collectors?: Array<{
    name: string;
    email: string;
    image: string | null;
    collected: number;
    redeemed: number;
    lastClaimedAt: string | null;
  }>;

  pagination: PaginationMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent response shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface QuestionResponse {
  type: "question";
  message: string;
  fields: ClarifyQuestion[];
}

export interface ListResponse {
  type: "list";
  message: string;
  action: "edit" | "delete" | "pause" | "resume";
  items: {
    id: string;
    label: string;
    sublabel?: string;
    hotspotId?: string | null;
  }[];
}

export interface ResultsResponse {
  type: "results";
  message: string;
  searchType: "EVENT" | "LANDMARK";
  pinCount: number;
  confirmPrompt: string;
}

export interface ConfirmResponse {
  type: "confirm";
  message: string;
  summary: {
    what: string;
    where: string;
    count: number;
    type: "EVENT" | "LANDMARK";
    action?: "edit" | "delete" | "pause" | "resume";
    targets?: string[];
    affected?: string;
    unaffected?: string;
  };
}

export interface SuccessResponse {
  type: "success";
  message: string;
  count: number;
}

// InfoResponse carries an optional `data` field for magic strings:
//   message === "__PINLIST__"          → data is PinListData
//   message === "__ANALYTICS__"        → data is AnalyticsData
//   message === "__COLLECTORS__"       → data is CollectorsData
//   message === "__REPORT__"           → data is ReportData
//   message === "__COLLECTOR_REPORT__" → data is CollectorReportData
export interface InfoResponse {
  type: "info";
  message: string;
  data?: PinListData | AnalyticsData | CollectorsData | ReportData | CollectorReportData;
}

export type AgentResponse =
  | QuestionResponse
  | ListResponse
  | ResultsResponse
  | ConfirmResponse
  | SuccessResponse
  | InfoResponse;

// ─────────────────────────────────────────────────────────────────────────────
// tRPC output
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatCreateOutput {
  reply: string;
  stage: AgentStage;
  intent: PinIntent;
  questions?: ClarifyQuestion[];
  pins?: Pin[];
  pinOptions?: PinOptions;
  jobId?: string;
}

export interface CityDiscoveryResult {
  cities: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Local chat message (frontend only)
// ─────────────────────────────────────────────────────────────────────────────

export type LocalMessageContent =
  | { kind: "text"; text: string }
  | { kind: "loading"; label?: string }
  | {
    kind: "response";
    data: AgentResponse;
    pins: Pin[];
    mode?: AgentMode;
    questionAnswered?: boolean;
    questionAnsweredValues?: Record<string, string>;
    resultsConfirmed?: boolean;
    resultsJobId?: string;
    managementConfirmed?: boolean;
  };

export interface LocalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: LocalMessageContent;
  createdAt: Date;
  mode?: AgentMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Management data shapes (returned inside InfoResponse for DB agent)
// ─────────────────────────────────────────────────────────────────────────────

export interface MgmtPin {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  hotspotId: string | null;
  status: "active" | "expired" | "fully_claimed" | "collection_disabled";
  claimed: number;
  redeemed: number;
  limit: number;
  remaining: number;
  claimRate: string;
}

export interface MgmtHotspot {
  id: string;
  displayName: string;
  isActive: boolean;
  dropEveryDays: number;
  dropCount: number;
  qstashScheduleId: string | null;
}

export interface MgmtCollector {
  name: string;
  image: string | null;
  email: string;
  claimedAt: string;
  isRedeemed: boolean;
}

export interface MgmtAnalytics {
  totalClaimed: number;
  totalRedeemed: number;
  claimRate: string;
  redeemRate?: string;
  perPin: Array<{
    id: string;
    title: string;
    claimed: number;
    redeemed: number;
    limit: number;
    remaining: number;
    claimRate: string;
  }>;
}

export interface AgentPollResult {
  reply: string;
  stage: AgentStage;
  intent: PinIntent;
  pins?: Pin[];
  pinOptions?: PinOptions;
  jobId?: string;
  mode?: AgentMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export const isQuestionResponse = (r: AgentResponse): r is QuestionResponse =>
  r.type === "question";
export const isResultsResponse = (r: AgentResponse): r is ResultsResponse =>
  r.type === "results";
export const isConfirmResponse = (r: AgentResponse): r is ConfirmResponse =>
  r.type === "confirm";
export const isSuccessResponse = (r: AgentResponse): r is SuccessResponse =>
  r.type === "success";
export const isInfoResponse = (r: AgentResponse): r is InfoResponse =>
  r.type === "info";

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseAgentResponse(raw: string): AgentResponse {
  try {
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON found");
    const parsed = JSON.parse(clean.slice(start, end + 1)) as AgentResponse;
    if (!parsed.type) throw new Error("Missing type field");
    return parsed;
  } catch (err) {
    console.error("[parseAgentResponse] Failed to parse:", err);
    return { type: "info", message: raw };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage labels (shared)
// ─────────────────────────────────────────────────────────────────────────────

export const STAGE_LABEL: Record<AgentStage, string> = {
  idle: "",
  extracting_intent: "Understanding request…",
  clarifying: "",
  searching: "Searching for places…",
  confirming: "Ready to drop pins",
  dropping_pins: "Dropping pins…",
  done: "All done!",
  error: "Something went wrong",
};