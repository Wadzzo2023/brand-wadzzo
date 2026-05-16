// ~/lib/agent/types.ts
// ─── Unified types for Pin Agent (pin-drop + management) ─────────────────────

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";
export type AreaType = "city" | "region" | "country" | "worldwide" | "unknown";
export type GroupingMode = "per-location" | "single-group";
export type InputType = "multiple_choice" | "text" | "number";
export type AgentMode = "management" | "pin_drop";
export type IntentType = "management" | "pin_drop" | "ambiguous";
export type PinListMode = "view" | "edit" | "delete";
export type HotspotListMode = "view" | "edit" | "delete" | "pause" | "resume";

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
// Zod schemas — source of truth for all management response shapes
// ─────────────────────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  nextOffset: z.number().nullable(),
  showing: z.string(),
});

export const LocationSchema = z.object({
  id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  autoCollect: z.boolean(),
  hidden: z.boolean(),
});

export const PinRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.enum(["active", "expired", "fully_claimed", "collection_disabled"]),
  claimed: z.number(),
  redeemed: z.number(),
  remaining: z.number(),
  hotspotId: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  radius: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  multiPin: z.boolean().optional(),
  hidden: z.boolean().optional(),
  locations: z.array(LocationSchema).optional(),
});

export const HotspotLocationGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.enum(["active", "expired", "fully_claimed", "collection_disabled"]),
  claimed: z.number(),
  redeemed: z.number(),
  remaining: z.number(),
  locations: z.array(LocationSchema),
});

export const HotspotRowSchema = z.object({
  id: z.string(),
  hotspotName: z.string(),
  isActive: z.boolean(),
  dropEveryDays: z.number().nullable(),
  dropCount: z.number(),
  locationGroups: z.array(HotspotLocationGroupSchema),
});

export const PerPinStatSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  claimed: z.number(),
  redeemed: z.number(),
  limit: z.number(),
  remaining: z.number(),
  claimRate: z.string(),
});

export const TopPerformerSchema = z.object({
  id: z.string(),
  title: z.string(),
  claimed: z.number(),
  limit: z.number(),
  remaining: z.number(),
  claimRate: z.string(),
});

export const ReportSummarySchema = z.object({
  totalClaimed: z.number(),
  totalRedeemed: z.number(),
  claimRate: z.string(),
  redeemRate: z.string(),
  totalPins: z.number(),
  activePins: z.number(),
  expiredPins: z.number(),
  fullyClaimedPins: z.number(),
});

export const CollectorProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  totalCollected: z.number(),
  totalRedeemed: z.number(),
});

export const CollectionSchema = z.object({
  pinId: z.string(),
  pinTitle: z.string(),
  pinStartDate: z.string().nullable(),
  pinEndDate: z.string().nullable(),
  claimedAt: z.string().nullable(),
  isRedeemed: z.boolean(),
});

export const CollectorSummarySchema = z.object({
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  collected: z.number(),
  redeemed: z.number(),
  lastClaimedAt: z.string().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Derived types
// ─────────────────────────────────────────────────────────────────────────────

export type PaginationMeta = z.infer<typeof PaginationSchema>;
export type LocationRow = z.infer<typeof LocationSchema>;
export type PinListPinRow = z.infer<typeof PinRowSchema>;
export type HotspotLocationGroup = z.infer<typeof HotspotLocationGroupSchema>;
export type HotspotRow = z.infer<typeof HotspotRowSchema>;
export type PerPinStat = z.infer<typeof PerPinStatSchema>;
export type TopPerformer = z.infer<typeof TopPerformerSchema>;
export type ReportSummary = z.infer<typeof ReportSummarySchema>;
export type CollectorProfile = z.infer<typeof CollectorProfileSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type CollectorSummary = z.infer<typeof CollectorSummarySchema>;
export type PinListData = PinListResponse["data"];
export type HotspotListData = HotspotListResponse["data"];
export type AnalyticsData = AnalyticsResponse["data"];
export type ReportData = ReportResponse["data"];
export type CollectorReportData = CollectorReportResponse["data"];
// ─────────────────────────────────────────────────────────────────────────────
// Intent
// ─────────────────────────────────────────────────────────────────────────────

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  reasoning: string;
  missingInfo: string | null;
  extractedSubject: string | null;
}

export interface DbPresenceCheck {
  found: boolean;
  count: number;
  sample: { id: string; title: string; startDate: Date | null; endDate: Date | null }[];
}

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
  lastPinFilter?: "all" | "active" | "expired" | "fully_claimed" | "collection_disabled";
  lastPinSearch?: string | null;
  lastPinArea?: string | null;
}

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

export interface PinOptions {
  autoCollect: boolean;
  groupingMode: GroupingMode;
  pinNumber: number;
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
// Agent response shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface PinListResponse {
  type: "pin_list";
  mode: PinListMode;
  data: {
    standalone: PinListPinRow[];
    hotspots: HotspotRow[];
    pagination: PaginationMeta;
  };
}

export interface HotspotListResponse {
  type: "hotspot_list";
  mode: HotspotListMode;
  data: {
    hotspots: HotspotRow[];
    pagination: PaginationMeta;
  };
}

export interface AnalyticsResponse {
  type: "analytics";
  data: {
    totalClaimed: number;
    totalRedeemed: number;
    claimRate: string;
    redeemRate: string;
    perPin: PerPinStat[];
    insights: string | null;
  };
}

export interface ReportResponse {
  type: "report";
  data: {
    summary: ReportSummary;
    topPerformers: TopPerformer[];
    perPin: PerPinStat[];
    pagination: PaginationMeta;
    generatedAt: string;
  };
}
export interface InfoResponse {
  type: "info";
  message: string;
  data?: Record<string, unknown>;
}

export interface CollectorReportResponse {
  type: "collector_report";
  data: {
    mode: "single_collector" | "all_collectors";
    collector?: CollectorProfile;
    collections?: Collection[];
    collectors?: CollectorSummary[];
    pagination: PaginationMeta;
  };
}

export interface QuestionResponse {
  type: "question";
  message: string;
  fields: ClarifyQuestion[];
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
    action: "edit" | "delete" | "pause" | "resume" | null;
    targets: string[] | null;
    count: number | null;
    affected: string | null;
    unaffected: string | null;
  };
}

export interface SuccessResponse {
  type: "success";
  message: string;
  count: number;
}

export type AgentResponse =
  | PinListResponse
  | HotspotListResponse
  | AnalyticsResponse
  | ReportResponse
  | CollectorReportResponse
  | QuestionResponse
  | ConfirmResponse
  | SuccessResponse
  | ResultsResponse
  | InfoResponse
  ;

// ─────────────────────────────────────────────────────────────────────────────
// tRPC / poll output
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

export interface AgentPollResult {
  reply: string;
  stage: AgentStage;
  intent: PinIntent;
  pins?: Pin[];
  pinOptions?: PinOptions;
  jobId?: string;
  mode?: AgentMode;
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
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export const isPinListResponse = (r: AgentResponse): r is PinListResponse => r.type === "pin_list";
export const isHotspotListResponse = (r: AgentResponse): r is HotspotListResponse => r.type === "hotspot_list";
export const isAnalyticsResponse = (r: AgentResponse): r is AnalyticsResponse => r.type === "analytics";
export const isReportResponse = (r: AgentResponse): r is ReportResponse => r.type === "report";
export const isCollectorReportResponse = (r: AgentResponse): r is CollectorReportResponse => r.type === "collector_report";
export const isQuestionResponse = (r: AgentResponse): r is QuestionResponse => r.type === "question";
export const isConfirmResponse = (r: AgentResponse): r is ConfirmResponse => r.type === "confirm";
export const isSuccessResponse = (r: AgentResponse): r is SuccessResponse => r.type === "success";

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
    return {
      type: "pin_list",
      mode: "view",
      data: { standalone: [], hotspots: [], pagination: { total: 0, offset: 0, limit: 10, hasMore: false, nextOffset: null, showing: "0–0 of 0" } },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage labels
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