"use client";

// ~/components/agent/AgentChat.tsx
//
// Orchestration only — all state, polling, and callbacks.
// Zero UI. All rendering delegated to AgentBlockDisplay.
//
// New in this version:
//   - onListConfirm: handles list selection → sends agent message
//   - onListDismiss: cancels list interaction
//   - onEditHotspot: hotspot-level edit → sends agent message
//   - onDeleteHotspot / onPauseHotspot / onResumeHotspot
//   - load-more bypasses full agent when possible

import { useState, useRef, useCallback, useMemo } from "react";
import { api } from "~/utils/api";
import { parseAgentResponse } from "~/lib/agent/types";
import type {
    LocalChatMessage,
    PinIntent,
    AgentStage,
    Pin,
    PinOptions,
    AgentPollResult,
    AgentMode,
    SuccessResponse,
    PinListData,
    ReportData,
    CollectorReportData,
    PinListResponse,
    ReportResponse,
    CollectorReportResponse,

} from "~/lib/agent/types";
import type { PinEditFields, HotspotScope, LocationEditFields } from "~/components/agent/pins/pin-edit-form";
import type { HotspotEditFields } from "~/components/agent/hotspot/hotspot-edit-form";
import AgentBlockDisplay from "~/components/agent/AgentBlockDisplay";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_INTENT: PinIntent = {
    count: null,
    query: null,
    area: null,
    areaType: "unknown",
    confirmed: false,
    countSpecified: false,
    isNiche: false,
    pinNumber: undefined,
    ambiguousPinIntent: false,
};

// ─── Poll hook ────────────────────────────────────────────────────────────────

function usePollAgentJob() {
    const utils = api.useUtils();

    const poll = useCallback(
        (jobId: string, onStatusChange?: (status: string) => void): Promise<AgentPollResult> =>
            new Promise((resolve, reject) => {
                const TIMEOUT_MS = 90_000;
                const INTERVAL_MS = 1_500;
                const startedAt = Date.now();

                const tick = async () => {
                    if (Date.now() - startedAt > TIMEOUT_MS) {
                        reject(new Error("Timed out waiting for agent job"));
                        return;
                    }
                    try {
                        const job = await utils.agent.pollJobResult.fetch({ jobId });
                        onStatusChange?.(job.status);
                        if (job.status === "completed" && job.result) {
                            resolve(job.result as AgentPollResult);
                        } else if (job.status === "failed") {
                            reject(new Error(job.error ?? "Agent job failed"));
                        } else {
                            setTimeout(() => void tick(), INTERVAL_MS);
                        }
                    } catch (err) {
                        reject(err);
                    }
                };

                void tick();
            }),
        [utils],
    );

    return poll;
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

function mergePinListData(existing: PinListData, incoming: PinListData): PinListData {
    return {
        standalone: [...existing.standalone, ...(incoming.standalone ?? [])],
        hotspots: mergeHotspots(existing.hotspots, incoming.hotspots ?? []),
        pagination: incoming.pagination,
    };
}

function mergeHotspots(
    existing: PinListData["hotspots"],
    incoming: PinListData["hotspots"],
): PinListData["hotspots"] {
    const merged = [...existing];
    for (const hs of incoming) {
        const idx = merged.findIndex((h) => h.hotspotName === hs.hotspotName);
        if (idx >= 0) {
            merged[idx] = {
                ...merged[idx]!,
                locationGroups: [...merged[idx]!.locationGroups, ...hs.locationGroups],
            };
        } else {
            merged.push(hs);
        }
    }
    return merged;
}
function mergeReportData(existing: ReportData, incoming: ReportData): ReportData {
    return {
        ...existing,
        perPin: [...existing.perPin, ...(incoming.perPin ?? [])],
        pagination: incoming.pagination,
    };
}

function mergeCollectorReportData(
    existing: CollectorReportData,
    incoming: CollectorReportData,
): CollectorReportData {
    if (existing.mode === "single_collector") {
        return {
            ...existing,
            collections: [...(existing.collections ?? []), ...(incoming.collections ?? [])],
            pagination: incoming.pagination,
        };
    }
    return {
        ...existing,
        collectors: [...(existing.collectors ?? []), ...(incoming.collectors ?? [])],
        pagination: incoming.pagination,
    };
}

// ─── Stage label map ──────────────────────────────────────────────────────────

export const STAGE_LABEL: Record<AgentStage, string> = {
    idle: "",
    extracting_intent: "Understanding request…",
    clarifying: "",
    searching: "Searching…",
    confirming: "Ready",
    dropping_pins: "Dropping pins…",
    done: "All done!",
    error: "Something went wrong",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentChat({ creatorId }: { creatorId?: string }) {
    const [messages, setMessages] = useState<LocalChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [intent, setIntent] = useState<PinIntent>(DEFAULT_INTENT);
    const [stage, setStage] = useState<AgentStage>("idle");
    const [isLoading, setIsLoading] = useState(false);
    const [isDropping, setIsDropping] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [currentPins, setCurrentPins] = useState<Pin[]>([]);
    const [isOpen, setIsOpen] = useState(true);
    const [isMinimized, setIsMinimized] = useState(true);

    const inputRef = useRef<HTMLInputElement>(null);
    const chatCreate = api.agent.create.useMutation();
    const pollJob = usePollAgentJob();

    // ── History builder ───────────────────────────────────────────────────────

    const buildHistory = useCallback(
        (extraUserText?: string) => {
            const history = messages
                .map((m) => {
                    if (m.content.kind === "text") {
                        return { role: m.role as "user" | "assistant", text: m.content.text };
                    }
                    if (m.content.kind === "response") {
                        const d = m.content.data;
                        const text =
                            d.type === "question" || d.type === "success" || d.type === "confirm"
                                ? d.message : "";
                        return { role: "assistant" as const, text };
                    }
                    return null;
                })
                .filter(Boolean) as { role: "user" | "assistant"; text: string }[];

            if (extraUserText) history.push({ role: "user", text: extraUserText });
            return history;
        },
        [messages],
    );

    // ── Core send ─────────────────────────────────────────────────────────────

    const sendMessage = useCallback(
        async (userText: string, intentOverride?: Partial<PinIntent>) => {
            if (!userText.trim() || isLoading) return;

            const mergedIntent = { ...intent, ...intentOverride };
            const loadingId = uid();

            setMessages((prev) => [
                ...prev,
                { id: uid(), role: "user", content: { kind: "text", text: userText }, createdAt: new Date() },
                { id: loadingId, role: "assistant", content: { kind: "loading", label: STAGE_LABEL.extracting_intent }, createdAt: new Date() },
            ]);
            setIsLoading(true);
            setInput("");

            try {
                const { jobId } = await chatCreate.mutateAsync({
                    messages: buildHistory(userText),
                    intent: mergedIntent,
                    creatorId,
                });

                const result = await pollJob(jobId, (status) => {
                    const label = status === "processing"
                        ? STAGE_LABEL.searching
                        : STAGE_LABEL.extracting_intent;
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === loadingId
                                ? { ...m, content: { kind: "loading" as const, label } }
                                : m,
                        ),
                    );
                });

                const serverPins = result.pins ?? [];
                if (serverPins.length > 0) setCurrentPins(serverPins);

                const agentResponse = parseAgentResponse(result.reply);
                const mode: AgentMode | undefined = result.mode;

                // ── Reset area if user switched to a different topic ──────────────
                if (result.intent.query !== intent.query && intent.query !== null) {
                    result.intent.area = null;
                    result.intent.areaType = "unknown";
                }
                // ─────────────────────────────────────────────────────────────────

                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: agentResponse,
                            pins: serverPins.length > 0 ? serverPins : currentPins,
                            mode,
                        },
                        createdAt: new Date(),
                    },
                ]);

                setStage(result.stage);
                setIntent(result.intent);
            }// new — use kind: "text" for plain error messages
            catch (err) {
                console.error("[AgentChat] sendMessage error:", err);
                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "text",
                            text: "Sorry, something went wrong. Please try again.",
                        },
                        createdAt: new Date(),
                    },
                ]);
                setStage("error");
            } finally {
                setIsLoading(false);
                inputRef.current?.focus();
            }
        },
        [isLoading, intent, currentPins, buildHistory, chatCreate, pollJob, creatorId],
    );

    // ── Load more ─────────────────────────────────────────────────────────────

    const handleLoadMore = useCallback(
        async (nextOffset: number) => {
            if (isLoadingMore) return;
            setIsLoadingMore(true);

            let targetMsgId: string | null = null;
            let magicString: string | null = null;
            let lastQuery: string | null = null;

            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i]!;
                if (m.content.kind !== "response") continue;
                const d = m.content.data;
                if (d.type === "pin_list" || d.type === "report" || d.type === "collector_report") {
                    targetMsgId = m.id;
                    magicString = d.type;
                    break;
                }
            }

            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i]!;
                if (m.role === "user" && m.content.kind === "text") {
                    lastQuery = m.content.text;
                    break;
                }
            }

            if (!targetMsgId || !magicString) { setIsLoadingMore(false); return; }

            try {
                const minimalHistory: { role: "user" | "assistant"; text: string }[] = [
                    { role: "user", text: lastQuery ?? "show my pins" },
                ];

                const { jobId } = await chatCreate.mutateAsync({
                    messages: minimalHistory,
                    intent,
                    creatorId,
                    loadMore: true,
                    loadMoreOffset: nextOffset,
                    loadMoreType: magicString
                });

                const result = await pollJob(jobId);
                const agentResponse = parseAgentResponse(result.reply);
                if (
                    agentResponse.type !== "pin_list" &&
                    agentResponse.type !== "report" &&
                    agentResponse.type !== "collector_report"
                ) { setIsLoadingMore(false); return; }

                setMessages((prev) =>
                    prev.map((m) => {
                        if (m.id !== targetMsgId || m.content.kind !== "response") return m;
                        const existing = m.content.data;

                        if (magicString === "pin_list" && existing.type === "pin_list" && agentResponse.type === "pin_list") {
                            return {
                                ...m,
                                content: {
                                    ...m.content,
                                    data: {
                                        ...existing,
                                        data: mergePinListData(existing.data, agentResponse.data),
                                    } satisfies PinListResponse,
                                },
                            };
                        }
                        if (magicString === "report" && existing.type === "report" && agentResponse.type === "report") {
                            return {
                                ...m,
                                content: {
                                    ...m.content,
                                    data: {
                                        ...existing,
                                        data: mergeReportData(existing.data, agentResponse.data),
                                    } satisfies ReportResponse,
                                },
                            };
                        }
                        if (magicString === "collector_report" && existing.type === "collector_report" && agentResponse.type === "collector_report") {
                            return {
                                ...m,
                                content: {
                                    ...m.content,
                                    data: {
                                        ...existing,
                                        data: mergeCollectorReportData(existing.data, agentResponse.data),
                                    } satisfies CollectorReportResponse,
                                },
                            };
                        }
                        return m;
                    }),
                );
            } catch (err) {
                console.error("[AgentChat] loadMore error:", err);
            } finally {
                setIsLoadingMore(false);
            }
        },
        [isLoadingMore, messages, intent, chatCreate, pollJob, creatorId],
    );

    // ── Question answers ──────────────────────────────────────────────────────

    const handleAnswer = useCallback(
        (msgId: string, answers: Record<string, string>) => {
            setMessages((prev) =>
                prev.map((m) => {
                    if (m.id !== msgId || m.content.kind !== "response") return m;
                    return { ...m, content: { ...m.content, questionAnswered: true, questionAnsweredValues: answers } };
                }),
            );

            const intentPatch: Partial<PinIntent> = {
                count: intent.count, countSpecified: intent.countSpecified,
                area: intent.area, pinNumber: intent.pinNumber, areaType: intent.areaType,
            };

            for (const [k, v] of Object.entries(answers)) {
                const key = k.toLowerCase().trim();
                if (["count", "how_many", "how many"].includes(key)) {
                    intentPatch.count = parseInt(v, 10) || null;
                    intentPatch.countSpecified = true;
                } else if (["query", "what", "search"].includes(key)) {
                    intentPatch.query = v;
                } else if (["area", "where", "location", "city"].includes(key)) {
                    intentPatch.area = v;
                }
            }

            const parts: string[] = [];
            if (intentPatch.query) parts.push(`find ${intentPatch.query}`);
            if (intentPatch.area) parts.push(`in ${intentPatch.area}`);
            if (intentPatch.count && intentPatch.countSpecified)
                parts.push(`(${intentPatch.count} locations)`);
            const naturalMessage = parts.length > 0
                ? parts.join(" ")
                : Object.values(answers).join(", ");

            void sendMessage(naturalMessage, intentPatch);
        },
        [sendMessage, intent],
    );

    // ── List confirm (edit / delete / pause / resume selection) ───────────────
    // Called when user clicks "Edit Selected" or "Delete Selected" in ListBlock.
    // The selected IDs are injected as a SYSTEM suffix so the agent can act
    // without re-querying.

    const handleListConfirm = useCallback(
        (msgId: string, selectedIds: string[]) => {
            // Mark the message as confirmed in UI
            setMessages((prev) =>
                prev.map((m) => {
                    if (m.id !== msgId || m.content.kind !== "response") return m;
                    if (m.content.data.type !== "pin_list" && m.content.data.type !== "hotspot_list") return m;
                    const action = m.content.data.mode; // "edit" | "delete" | "pause" | "resume"
                    // Build a natural message the agent can parse
                    const actionVerb: Record<string, string> = {
                        edit: "Update",
                        delete: "Delete",
                        pause: "Pause",
                        resume: "Resume",
                    };
                    const verb = actionVerb[action] ?? "Process";
                    const displayText = `${verb} selected pins (${selectedIds.length})`;
                    const agentText = `${displayText}. SYSTEM: locationGroupIds=${selectedIds.join(",")} action=${action}`;
                    // fire-and-forget (we don't have async in setState)
                    setTimeout(() => void sendMessage(agentText), 0);
                    return m;
                }),
            );
        },
        [sendMessage],
    );

    const handleListDismiss = useCallback(
        () => void sendMessage("Cancel that, let me start over."),
        [sendMessage],
    );

    // ── Inline pin edit ───────────────────────────────────────────────────────
    const editPinDirect = api.agent.editPinDirect.useMutation();

    const handleEdit = useCallback(
        async (
            ids: string[],
            fields: PinEditFields,
            _scope?: HotspotScope,
            locationEdits?: Record<string, LocationEditFields>,
        ) => {
            const fieldSummary = Object.entries(fields)
                .filter(([, v]) => v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${k} to "${String(v)}"`)
                .join(", ");

            const locCount = locationEdits ? Object.keys(locationEdits).length : 0;
            const displayText = [
                fieldSummary ? `Update pin: set ${fieldSummary}` : "",
                locCount > 0 ? `${locCount} location${locCount > 1 ? "s" : ""} modified` : "",
            ].filter(Boolean).join(". ");

            // Show user message
            setMessages((prev) => [
                ...prev,
                { id: uid(), role: "user", content: { kind: "text", text: displayText }, createdAt: new Date() },
            ]);

            try {
                await editPinDirect.mutateAsync({
                    locationGroupIds: ids,
                    fields,
                    locationEdits,
                });

                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: {
                                type: "success",
                                message: `Updated ${ids.length} pin${ids.length > 1 ? "s" : ""} successfully!`,
                                count: ids.length,
                            },
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
            } catch (err) {
                console.error("[handleEdit] error:", err);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: { type: "info", message: "Failed to update. Please try again." },
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
            }
        },
        [editPinDirect],
    );

    // ── Inline pin delete ─────────────────────────────────────────────────────

    const deletePinDirect = api.agent.deletePinDirect.useMutation();

    const handleDelete = useCallback(
        async (ids: string[]) => {
            const displayText = `Delete ${ids.length} pin${ids.length > 1 ? "s" : ""}`;

            setMessages((prev) => [
                ...prev,
                { id: uid(), role: "user", content: { kind: "text", text: displayText }, createdAt: new Date() },
            ]);

            try {
                await deletePinDirect.mutateAsync({
                    locationGroupIds: ids,
                });

                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: {
                                type: "success",
                                message: `Deleted ${ids.length} pin${ids.length > 1 ? "s" : ""} successfully!`,
                                count: ids.length,
                            },
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
            } catch (err) {
                console.error("[handleDelete] error:", err);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: { type: "info", message: "Failed to delete. Please try again." },
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
            }
        },
        [deletePinDirect],
    );

    // ── Hotspot actions ───────────────────────────────────────────────────────

    const handleEditHotspot = useCallback(
        async (hotspotId: string, fields: HotspotEditFields) => {
            const fieldSummary = Object.entries(fields)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([k, v]) => `${k} to "${String(v)}"`)
                .join(", ");
            const msg = `Update hotspot: set ${fieldSummary}. SYSTEM: hotspotId=${hotspotId}`;
            await sendMessage(msg);
        },
        [sendMessage],
    );

    const handleDeleteHotspot = useCallback(
        async (hotspotId: string) => {
            await sendMessage(`Delete hotspot. SYSTEM: hotspotId=${hotspotId}`);
        },
        [sendMessage],
    );

    const handlePauseHotspot = useCallback(
        async (hotspotId: string) => {
            await sendMessage(`Pause hotspot. SYSTEM: hotspotId=${hotspotId}`);
        },
        [sendMessage],
    );

    const handleResumeHotspot = useCallback(
        async (hotspotId: string) => {
            await sendMessage(`Resume hotspot. SYSTEM: hotspotId=${hotspotId}`);
        },
        [sendMessage],
    );

    // ── Pin-drop confirm with options ─────────────────────────────────────────

    const handleConfirmWithOptions = useCallback(
        async (options: PinOptions) => {
            setIsDropping(true);
            setIsLoading(true);
            try {
                const { jobId } = await chatCreate.mutateAsync({
                    messages: buildHistory("Yes, confirm and drop the pins."),
                    intent: { ...intent, confirmed: true },
                    pinOptions: options,
                    pins: currentPins,
                    creatorId,
                });

                const result = await pollJob(jobId);
                const locationGroupJobId = result.jobId;

                setMessages((prev) => {
                    const copy = [...prev];
                    for (let i = copy.length - 1; i >= 0; i--) {
                        const m = copy[i]!;
                        if (m.content.kind === "response" && m.content.data.type === "results") {
                            copy[i] = {
                                ...m,
                                content: { ...m.content, resultsConfirmed: true, resultsJobId: locationGroupJobId },
                            };
                            break;
                        }
                    }
                    return copy;
                });

                if (!locationGroupJobId) {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: uid(),
                            role: "assistant",
                            content: {
                                kind: "response",
                                data: {
                                    type: "success",
                                    message: `Successfully dropped ${currentPins.length} pins!`,
                                    count: currentPins.length,
                                } satisfies SuccessResponse,
                                pins: [],
                            },
                            createdAt: new Date(),
                        },
                    ]);
                }

                setStage("dropping_pins");
                setIntent((p) => ({ ...p, confirmed: true }));
            } catch {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: { type: "info", message: "Failed to drop pins. Please try again." },
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
            } finally {
                setIsDropping(false);
                setIsLoading(false);
            }
        },
        [intent, currentPins, buildHistory, chatCreate, pollJob, creatorId],
    );

    // ── Legacy confirm pins ───────────────────────────────────────────────────

    const handleConfirmPins = useCallback(
        async (pins: Pin[]) => {
            setIsDropping(true);
            setIsLoading(true);
            const pinsToUse = pins.length > 0 ? pins : currentPins;
            try {
                const { jobId } = await chatCreate.mutateAsync({
                    messages: buildHistory("Yes, confirm and drop the pins."),
                    intent: { ...intent, confirmed: true },
                    creatorId,
                });
                await pollJob(jobId);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: {
                                type: "success",
                                message: `Successfully dropped ${pinsToUse.length} pins!`,
                                count: pinsToUse.length,
                            } satisfies SuccessResponse,
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
                setStage("done");
                setIntent((p) => ({ ...p, confirmed: true }));
                setCurrentPins([]);
            } catch {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: { type: "info", message: "Failed to drop pins. Please try again." },
                            pins: [],
                        },
                        createdAt: new Date(),
                    },
                ]);
            } finally {
                setIsDropping(false);
                setIsLoading(false);
            }
        },
        [intent, currentPins, buildHistory, chatCreate, pollJob, creatorId],
    );

    // ── Job complete ──────────────────────────────────────────────────────────

    const handleJobComplete = useCallback((count: number) => {
        setStage("done");
        setCurrentPins([]);
        setMessages((prev) => [
            ...prev,
            {
                id: uid(),
                role: "assistant",
                content: {
                    kind: "response",
                    data: {
                        type: "success",
                        message: `Successfully dropped ${count} pin${count !== 1 ? "s" : ""}!`,
                        count,
                    } satisfies SuccessResponse,
                    pins: [],
                },
                createdAt: new Date(),
            },
        ]);
    }, []);

    // ── Dismiss / reset ───────────────────────────────────────────────────────

    const handleDismiss = useCallback(
        () => void sendMessage("Cancel that, let me start over."),
        [sendMessage],
    );

    const handleReset = useCallback(() => {
        setMessages([]);
        setIntent(DEFAULT_INTENT);
        setStage("idle");
        setInput("");
        setCurrentPins([]);
        inputRef.current?.focus();
    }, []);

    // ── Interaction pending guard ─────────────────────────────────────────────

    const isInteractionPending = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (!m || m.role !== "assistant" || m.content.kind !== "response") continue;
            const { data, questionAnswered, resultsConfirmed } = m.content;
            if (data.type === "question" && !questionAnswered) return true;
            if (data.type === "results" && !resultsConfirmed) return true;
            if (data.type === "confirm") return true;
            break;
        }
        return false;
    }, [messages]);

    // ── Key handler ───────────────────────────────────────────────────────────

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
            }
        },
        [input, sendMessage],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <AgentBlockDisplay
            // state
            messages={messages}
            input={input}
            intent={intent}
            stage={stage}
            isLoading={isLoading}
            isDropping={isDropping}
            isLoadingMore={isLoadingMore}
            isOpen={isOpen}
            isMinimized={isMinimized}
            isInteractionPending={isInteractionPending}
            // setters
            setInput={setInput}
            setIsOpen={setIsOpen}
            setIsMinimized={setIsMinimized}
            // handlers
            onSendMessage={sendMessage}
            onAnswer={handleAnswer}
            onConfirmWithOptions={handleConfirmWithOptions}
            onConfirmPins={handleConfirmPins}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onEditHotspot={handleEditHotspot}
            onDeleteHotspot={handleDeleteHotspot}
            onPauseHotspot={handlePauseHotspot}
            onResumeHotspot={handleResumeHotspot}
            onDismiss={handleDismiss}
            onReset={handleReset}
            onJobComplete={handleJobComplete}
            onLoadMore={handleLoadMore}
            onListConfirm={handleListConfirm}
            onListDismiss={handleListDismiss}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
        />
    );
}