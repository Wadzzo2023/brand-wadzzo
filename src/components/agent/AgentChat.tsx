"use client";

// ~/components/agent/AgentChat.tsx
//
// Main orchestration component for the unified Pin Agent chat.
// Handles: message state, polling, routing, confirmation flows,
//          and pagination (load-more merging for __PINLIST__,
//          __REPORT__, __COLLECTOR_REPORT__).

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
    InfoResponse,
    PinListData,
    ReportData,
    CollectorReportData,
} from "~/lib/agent/types";
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
        (jobId: string, onStatusChange?: (status: string) => void): Promise<AgentPollResult> => {
            return new Promise((resolve, reject) => {
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
            });
        },
        [utils]
    );

    return poll;
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

// ─── Merge helpers for paginated responses ────────────────────────────────────
// When user clicks "Load more", the agent returns another page.
// Instead of adding a new message, we merge the new data into the
// existing message so the list grows in place.

function mergePinListData(existing: PinListData, incoming: PinListData): PinListData {
    return {
        standalone: [...existing.standalone, ...(incoming.standalone ?? [])],
        hotspots: mergeHotspots(existing.hotspots, incoming.hotspots ?? []),
        pagination: incoming.pagination, // always use the latest pagination meta
    };
}

function mergeHotspots(
    existing: PinListData["hotspots"],
    incoming: PinListData["hotspots"]
): PinListData["hotspots"] {
    const merged = [...existing];
    for (const incomingHs of incoming) {
        const existingIdx = merged.findIndex(h => h.hotspotName === incomingHs.hotspotName);
        if (existingIdx >= 0) {
            merged[existingIdx] = {
                ...merged[existingIdx]!,
                drops: [...merged[existingIdx]!.drops, ...incomingHs.drops],
            };
        } else {
            merged.push(incomingHs);
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
    incoming: CollectorReportData
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

    // ── Build plain-text history for tRPC ────────────────────────────────────

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
                            d.type === "info" || d.type === "question" ||
                                d.type === "success" || d.type === "results" || d.type === "confirm"
                                ? d.message : "";
                        return { role: "assistant" as const, text };
                    }
                    return null;
                })
                .filter(Boolean) as { role: "user" | "assistant"; text: string }[];

            if (extraUserText) history.push({ role: "user", text: extraUserText });
            return history;
        },
        [messages]
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
                    const label = status === "processing" ? STAGE_LABEL.searching : STAGE_LABEL.extracting_intent;
                    setMessages((prev) => prev.map((m) => m.id === loadingId ? { ...m, content: { kind: "loading" as const, label } } : m));
                });

                const serverPins = result.pins ?? [];
                if (serverPins.length > 0) setCurrentPins(serverPins);

                const agentResponse = parseAgentResponse(result.reply);
                const mode: AgentMode | undefined = result.mode;

                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: { kind: "response", data: agentResponse, pins: serverPins.length > 0 ? serverPins : currentPins, mode },
                        createdAt: new Date(),
                    },
                ]);

                setStage(result.stage);
                setIntent(result.intent);
            } catch (err) {
                console.error("[AgentChat] sendMessage error:", err);
                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: { kind: "response", data: { type: "info", message: "Sorry, something went wrong. Please try again." }, pins: [] },
                        createdAt: new Date(),
                    },
                ]);
                setStage("error");
            } finally {
                setIsLoading(false);
                inputRef.current?.focus();
            }
        },
        [isLoading, intent, currentPins, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Load more (pagination) ────────────────────────────────────────────────
    // Finds the last __PINLIST__ / __REPORT__ / __COLLECTOR_REPORT__ message
    // and merges the new page into it in place — no new message added.

    const handleLoadMore = useCallback(
        async (nextOffset: number) => {
            if (isLoadingMore) return;
            setIsLoadingMore(true);

            // find last paginated message to know its magic string + existing data
            let targetMsgId: string | null = null;
            let magicString: string | null = null;

            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i]!;
                if (m.content.kind !== "response") continue;
                const d = m.content.data;
                if (d.type === "info" && ["__PINLIST__", "__REPORT__", "__COLLECTOR_REPORT__"].includes(d.message)) {
                    targetMsgId = m.id;
                    magicString = d.message;
                    break;
                }
            }

            if (!targetMsgId || !magicString) {
                setIsLoadingMore(false);
                return;
            }

            // build a natural message that tells the agent which page to fetch
            const loadMoreText = `load more, offset ${nextOffset}`;

            try {
                const { jobId } = await chatCreate.mutateAsync({
                    messages: buildHistory(loadMoreText),
                    intent,
                    creatorId,
                });

                const result = await pollJob(jobId);
                const agentResponse = parseAgentResponse(result.reply);

                if (agentResponse.type !== "info") {
                    setIsLoadingMore(false);
                    return;
                }

                const infoResponse = agentResponse;

                // merge new data into the existing message
                setMessages((prev) => prev.map((m) => {
                    if (m.id !== targetMsgId || m.content.kind !== "response") return m;
                    const existingData = (m.content.data as InfoResponse).data;
                    if (!existingData || !infoResponse.data) return m;

                    let mergedData: PinListData | ReportData | CollectorReportData | undefined;

                    if (magicString === "__PINLIST__") {
                        mergedData = mergePinListData(existingData as PinListData, infoResponse.data as PinListData);
                    } else if (magicString === "__REPORT__") {
                        mergedData = mergeReportData(existingData as ReportData, infoResponse.data as ReportData);
                    } else if (magicString === "__COLLECTOR_REPORT__") {
                        mergedData = mergeCollectorReportData(existingData as CollectorReportData, infoResponse.data as CollectorReportData);
                    }

                    if (!mergedData) return m;

                    return {
                        ...m,
                        content: {
                            ...m.content,
                            kind: "response" as const,
                            data: {
                                type: "info" as const,
                                message: magicString,
                                data: mergedData,
                            },
                        },
                    };
                }));
            } catch (err) {
                console.error("[AgentChat] loadMore error:", err);
            } finally {
                setIsLoadingMore(false);
            }
        },
        [isLoadingMore, messages, intent, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Handle question answers ───────────────────────────────────────────────

    const handleAnswer = useCallback(
        (msgId: string, answers: Record<string, string>) => {
            setMessages((prev) => prev.map((m) => {
                if (m.id !== msgId || m.content.kind !== "response") return m;
                return { ...m, content: { ...m.content, questionAnswered: true, questionAnsweredValues: answers } };
            }));

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
            if (intentPatch.count && intentPatch.countSpecified) parts.push(`(${intentPatch.count} locations)`);
            const naturalMessage = parts.length > 0 ? parts.join(" ") : Object.values(answers).join(", ");

            void sendMessage(naturalMessage, intentPatch);
        },
        [sendMessage, intent]
    );

    // ── Handle results confirmation (pin-drop flow) ───────────────────────────

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
                            copy[i] = { ...m, content: { ...m.content, resultsConfirmed: true, resultsJobId: locationGroupJobId } };
                            break;
                        }
                    }
                    return copy;
                });

                if (!locationGroupJobId) {
                    setMessages((prev) => [...prev, {
                        id: uid(), role: "assistant",
                        content: { kind: "response", data: { type: "success", message: `Successfully dropped ${currentPins.length} pins!`, count: currentPins.length } satisfies SuccessResponse, pins: [] },
                        createdAt: new Date(),
                    }]);
                }

                setStage("dropping_pins");
                setIntent((p) => ({ ...p, confirmed: true }));
            } catch {
                setMessages((prev) => [...prev, {
                    id: uid(), role: "assistant",
                    content: { kind: "response", data: { type: "info", message: "Failed to drop pins. Please try again." }, pins: [] },
                    createdAt: new Date(),
                }]);
            } finally {
                setIsDropping(false);
                setIsLoading(false);
            }
        },
        [intent, currentPins, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Handle legacy confirm-stage pin drop ──────────────────────────────────

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
                setMessages((prev) => [...prev, {
                    id: uid(), role: "assistant",
                    content: { kind: "response", data: { type: "success", message: `Successfully dropped ${pinsToUse.length} pins!`, count: pinsToUse.length } satisfies SuccessResponse, pins: [] },
                    createdAt: new Date(),
                }]);
                setStage("done");
                setIntent((p) => ({ ...p, confirmed: true }));
                setCurrentPins([]);
            } catch {
                setMessages((prev) => [...prev, {
                    id: uid(), role: "assistant",
                    content: { kind: "response", data: { type: "info", message: "Failed to drop pins. Please try again." }, pins: [] },
                    createdAt: new Date(),
                }]);
            } finally {
                setIsDropping(false);
                setIsLoading(false);
            }
        },
        [intent, currentPins, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Background pin-drop job complete ─────────────────────────────────────

    const handleJobComplete = useCallback((count: number) => {
        setStage("done");
        setCurrentPins([]);
        setMessages((prev) => [...prev, {
            id: uid(), role: "assistant",
            content: { kind: "response", data: { type: "success", message: `Successfully dropped ${count} pin${count !== 1 ? "s" : ""}!`, count } satisfies SuccessResponse, pins: [] },
            createdAt: new Date(),
        }]);
    }, []);

    // ── Inline edit from PinListBlock ─────────────────────────────────────────

    const handleEdit = useCallback(
        async (
            ids: string[],
            fields: {
                title?: string; description?: string; startDate?: string; endDate?: string;
                latitude?: number; longitude?: number; radius?: number;
                image?: string; link?: string; multiPin?: boolean; hidden?: boolean;
            },
            scope?: "this" | "future" | "all",
            locationEdits?: { latitude?: number; longitude?: number; autoCollect?: boolean; hidden?: boolean; }
        ) => {
            const fieldSummary = Object.entries(fields)
                .filter(([, v]) => v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${k} to "${String(v)}"`)
                .join(", ")
            const scopeText = scope && scope !== "this"
                ? ` (apply to ${scope === "future" ? "all future drops" : "all drops"})`
                : ""
            const displayText = `Update pin: set ${fieldSummary}${scopeText}`

            // ── what the agent actually receives (ids in a system-style suffix) ──
            // This goes in the history sent to tRPC but NOT rendered in the UI
            const agentText = `${displayText}. SYSTEM: locationGroupIds=${ids.join(",")}${locationEdits && Object.keys(locationEdits).length > 0
                ? ` locationIds=${Object.keys(locationEdits).join(",")}`
                : ""
                }`

            // add the DISPLAY version to the UI
            setMessages(prev => [
                ...prev,
                { id: uid(), role: "user", content: { kind: "text", text: displayText }, createdAt: new Date() }
            ])

            // send the AGENT version (with ids) to the backend — not shown to user
            await sendMessage(agentText)
        },
        [sendMessage]
    );

    // ── Inline delete from PinListBlock ───────────────────────────────────────

    const handleDelete = useCallback(
        async (ids: string[]) => {
            const msg = `Delete pin${ids.length > 1 ? "s" : ""} with id${ids.length > 1 ? "s" : ""} ${ids.join(", ")}.`;
            await sendMessage(msg);
        },
        [sendMessage]
    );

    // ── Dismiss / cancel ──────────────────────────────────────────────────────

    const handleDismiss = useCallback(() => { void sendMessage("Cancel that, let me start over."); }, [sendMessage]);

    // ── Reset ─────────────────────────────────────────────────────────────────

    const handleReset = useCallback(() => {
        setMessages([]); setIntent(DEFAULT_INTENT); setStage("idle");
        setInput(""); setCurrentPins([]);
        inputRef.current?.focus();
    }, []);

    // ── Pending interaction guard ─────────────────────────────────────────────

    const pendingAssistantResponse = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (!msg || msg.role !== "assistant" || msg.content.kind !== "response") continue;
            return msg;
        }
        return null;
    }, [messages]);

    const isInteractionPending = useMemo(() => {
        if (!pendingAssistantResponse) return false;
        if (pendingAssistantResponse.content.kind !== "response") return false;
        const { data, questionAnswered, resultsConfirmed } = pendingAssistantResponse.content;
        if (data.type === "question" && !questionAnswered) return true;
        if (data.type === "results" && !resultsConfirmed) return true;
        if (data.type === "confirm") return true;
        return false;
    }, [pendingAssistantResponse]);

    // ── Key handler ───────────────────────────────────────────────────────────

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); }
        },
        [input, sendMessage]
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
            onEdit={handleEdit}
            onDelete={handleDelete}
            onConfirmPins={handleConfirmPins}
            onDismiss={handleDismiss}
            onReset={handleReset}
            onJobComplete={handleJobComplete}
            onLoadMore={handleLoadMore}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
        />
    );
}