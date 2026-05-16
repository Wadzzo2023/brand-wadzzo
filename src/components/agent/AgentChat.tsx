"use client";

// ~/components/agent/AgentChat.tsx
//
// Main orchestration component for the unified Pin Agent chat.
// Handles: message state, polling, routing, confirmation flows.
//
// Renders UI via AgentChatUI.tsx — no UI code lives here.
// All types from ~/lib/agent/types.ts.

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
    ListResponse,
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
        (
            jobId: string,
            onStatusChange?: (status: string) => void
        ): Promise<AgentPollResult> => {
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentChat({ creatorId }: { creatorId?: string }) {
    const [messages, setMessages] = useState<LocalChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [intent, setIntent] = useState<PinIntent>(DEFAULT_INTENT);
    const [stage, setStage] = useState<AgentStage>("idle");
    const [isLoading, setIsLoading] = useState(false);
    const [isDropping, setIsDropping] = useState(false);
    const [currentPins, setCurrentPins] = useState<Pin[]>([]);
    const [isOpen, setIsOpen] = useState(true);
    const [isMinimized, setIsMinimized] = useState(true);

    const inputRef = useRef<HTMLInputElement>(null);
    const chatCreate = api.agent.create.useMutation();
    const pollJob = usePollAgentJob();

    // ── Build plain-text history for tRPC ───────────────────────────────────────

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
                            d.type === "info" ||
                                d.type === "question" ||
                                d.type === "success" ||
                                d.type === "results" ||
                                d.type === "confirm"
                                ? d.message
                                : "";
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

    // ── Core send ────────────────────────────────────────────────────────────────

    const sendMessage = useCallback(
        async (userText: string, intentOverride?: Partial<PinIntent>) => {
            if (!userText.trim() || isLoading) return;

            const mergedIntent = { ...intent, ...intentOverride };
            const loadingId = uid();

            setMessages((prev) => [
                ...prev,
                {
                    id: uid(),
                    role: "user",
                    content: { kind: "text", text: userText },
                    createdAt: new Date(),
                },
                {
                    id: loadingId,
                    role: "assistant",
                    content: { kind: "loading", label: STAGE_LABEL.extracting_intent },
                    createdAt: new Date(),
                },
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
                    const label =
                        status === "processing"
                            ? STAGE_LABEL.searching
                            : STAGE_LABEL.extracting_intent;
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === loadingId
                                ? { ...m, content: { kind: "loading" as const, label } }
                                : m
                        )
                    );
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
            } catch (err) {
                console.error("[AgentChat] sendMessage error:", err);
                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: { type: "info", message: "Sorry, something went wrong. Please try again." },
                            pins: [],
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
        [isLoading, intent, currentPins, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Handle question answers ──────────────────────────────────────────────────

    const handleAnswer = useCallback(
        (msgId: string, answers: Record<string, string>) => {
            // mark the question as answered in local state
            setMessages((prev) =>
                prev.map((m) => {
                    if (m.id !== msgId || m.content.kind !== "response") return m;
                    return {
                        ...m,
                        content: {
                            ...m.content,
                            questionAnswered: true,
                            questionAnsweredValues: answers,
                        },
                    };
                })
            );

            const intentPatch: Partial<PinIntent> = {
                count: intent.count,
                countSpecified: intent.countSpecified,
                area: intent.area,
                pinNumber: intent.pinNumber,
                areaType: intent.areaType,
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

            const naturalMessage =
                parts.length > 0
                    ? parts.join(" ")
                    : Object.values(answers).join(", ");

            void sendMessage(naturalMessage, intentPatch);
        },
        [sendMessage, intent]
    );

    // ── Handle results confirmation (pin-drop flow) ──────────────────────────────

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

                // mark the last results message as confirmed + attach job id
                setMessages((prev) => {
                    const copy = [...prev];
                    for (let i = copy.length - 1; i >= 0; i--) {
                        const m = copy[i]!;
                        if (m.content.kind === "response" && m.content.data.type === "results") {
                            copy[i] = {
                                ...m,
                                content: {
                                    ...m.content,
                                    resultsConfirmed: true,
                                    resultsJobId: locationGroupJobId,
                                },
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
        [intent, currentPins, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Handle legacy confirm-stage pin drop ─────────────────────────────────────

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
        [intent, currentPins, buildHistory, chatCreate, pollJob, creatorId]
    );

    // ── Background pin-drop job complete ────────────────────────────────────────

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
    // ── Handle inline pin edit from PinListBlock ─────────────────────────────────
    const handleEdit = useCallback(
        async (
            ids: string[],
            fields: {
                title?: string;
                description?: string;
                startDate?: string;
                endDate?: string;
                latitude?: number;
                longitude?: number;
                radius?: number;
                image?: string;
                link?: string;
                multiPin?: boolean;
                hidden?: boolean;
            },
            scope?: "this" | "future" | "all",
            locationEdits?: {
                latitude?: number;
                longitude?: number;
                autoCollect?: boolean;
                hidden?: boolean;
            }


        ) => {
            // Build a natural language message the agent understands
            const fieldSummary = Object.entries(fields)
                .filter(([, v]) => v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${k} to "${String(v)}"`)
                .join(", ");

            const scopeText = scope && scope !== "this"
                ? ` (apply to ${scope === "future" ? "all future drops" : "all drops"})`
                : "";

            const locationText = locationEdits && Object.keys(locationEdits).length > 0
                ? ` Also update ${Object.keys(locationEdits).length} location point(s).`
                : "";

            const msg = `Edit pin${ids.length > 1 ? "s" : ""} with id${ids.length > 1 ? "s" : ""} ${ids.join(", ")}: set ${fieldSummary}${scopeText}.${locationText}`;

            await sendMessage(msg);
        },
        [sendMessage]
    );

    // ── Handle inline pin delete from PinListBlock ───────────────────────────────
    const handleDelete = useCallback(
        async (ids: string[]) => {
            const msg = `Delete pin${ids.length > 1 ? "s" : ""} with id${ids.length > 1 ? "s" : ""} ${ids.join(", ")}.`;
            await sendMessage(msg);
        },
        [sendMessage]
    );
    // ── Dismiss / cancel ────────────────────────────────────────────────────────

    const handleDismiss = useCallback(() => {
        void sendMessage("Cancel that, let me start over.");
    }, [sendMessage]);

    // ── Reset ───────────────────────────────────────────────────────────────────

    const handleReset = useCallback(() => {
        setMessages([]);
        setIntent(DEFAULT_INTENT);
        setStage("idle");
        setInput("");
        setCurrentPins([]);
        inputRef.current?.focus();
    }, []);

    // ── Pending interaction guard ────────────────────────────────────────────────

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
        const { data, questionAnswered, resultsConfirmed } =
            pendingAssistantResponse.content;
        if (data.type === "question" && !questionAnswered) return true;
        if (data.type === "results" && !resultsConfirmed) return true;
        if (data.type === "confirm") return true;
        return false;
    }, [pendingAssistantResponse]);

    // ── Key handler ─────────────────────────────────────────────────────────────

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
            }
        },
        [input, sendMessage]
    );

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
        <AgentBlockDisplay
            // state
            messages={messages}
            input={input}
            intent={intent}
            stage={stage}
            isLoading={isLoading}
            isDropping={isDropping}
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
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
        />
    );
}