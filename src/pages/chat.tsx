"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "~/utils/api";
import type {
    ChatMessage,
    ClarifyQuestion,
    PinIntent,
    AgentStage,
    Pin,
    AgentResponse,
    QuestionResponse,
    ResultsResponse,
    ConfirmResponse,
    SuccessResponse,
    InfoResponse,
} from "~/lib/agent/types";

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Stage labels ─────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<AgentStage, string> = {
    idle: "",
    extracting_intent: "Understanding request…",
    clarifying: "",
    searching: "Searching for places…",
    confirming: "Ready to drop pins",
    dropping_pins: "Dropping pins…",
    done: "All done!",
    error: "Something went wrong",
};

const SUGGESTIONS = [
    "Drop 100 KFC pins in the US",
    "100 restaurants in Geneseo Area",
    "Music events worldwide",
    "Drop pins around hospitals in Tokyo",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/**
 * Robustly parse a raw string into an AgentResponse.
 * Handles: plain JSON, JSON wrapped in markdown fences, partial JSON with leading text.
 * Never throws — always returns a valid AgentResponse.
 */
function parseReply(raw: string): AgentResponse {
    // 1. Strip markdown code fences
    const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    // 2. Find the first { and last } to extract the JSON object
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
        try {
            const parsed = JSON.parse(stripped.slice(start, end + 1)) as AgentResponse;
            if (parsed && typeof parsed.type === "string") {
                return parsed;
            }
        } catch {
            // fall through
        }
    }

    // 3. Last resort: wrap the raw text as an info message
    // This prevents raw JSON or error text from appearing as unrendered strings
    return {
        type: "info",
        message: raw.trim() || "Something went wrong. Please try again.",
    };
}

// ─── Intent badge strip ───────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: PinIntent }) {
    const parts = [
        intent.count != null && `${intent.count} pins`,
        intent.query && `"${intent.query}"`,
        intent.area && `📍 ${intent.area}`,
    ].filter(Boolean) as string[];
    if (!parts.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5 mt-2">
            {parts.map((p, i) => (
                <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold
                     bg-indigo-900/50 text-indigo-300 border border-indigo-700/40"
                >
                    {p}
                </span>
            ))}
        </div>
    );
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots({ label }: { label?: string }) {
    return (
        <div className="flex items-center gap-2 py-0.5">
            <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[#636366] animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                    />
                ))}
            </div>
            {label && <span className="text-xs text-[#636366]">{label}</span>}
        </div>
    );
}

// ─── QuestionBlock ────────────────────────────────────────────────────────────

function QuestionBlock({
    data,
    onAnswer,
}: {
    data: QuestionResponse;
    onAnswer: (answers: Record<string, string>) => void;
}) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [customValues, setCustomValues] = useState<Record<string, string>>({});
    const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});
    const [currentFieldIndex, setCurrentFieldIndex] = useState(0);

    const fields = data.fields;
    const currentField = fields[currentFieldIndex];

    const handleChoice = (fieldId: string, value: string) => {
        const updated = { ...answers, [fieldId]: value };
        setAnswers(updated);
        const nextIndex = currentFieldIndex + 1;
        if (nextIndex < fields.length) {
            setCurrentFieldIndex(nextIndex);
        } else {
            onAnswer(updated);
        }
    };

    const handleCustomSubmit = (fieldId: string) => {
        const val = customValues[fieldId]?.trim();
        if (!val) return;
        handleChoice(fieldId, val);
    };

    const handleKeyDown = (e: React.KeyboardEvent, fieldId: string) => {
        if (e.key === "Enter") handleCustomSubmit(fieldId);
    };

    if (!currentField) return null;

    const isMultipleChoice = currentField.inputType === "multiple_choice";
    const isShowingCustom = showCustom[currentField.id];

    return (
        <div className="mt-2 space-y-3">
            {fields.length > 1 && (
                <div className="flex items-center gap-1.5">
                    {fields.map((_, i) => (
                        <span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i < currentFieldIndex
                                ? "bg-indigo-400"
                                : i === currentFieldIndex
                                    ? "bg-white"
                                    : "bg-[#3a3a3c]"
                                }`}
                        />
                    ))}
                    <span className="text-[10px] text-[#636366] ml-1">
                        {currentFieldIndex + 1}/{fields.length}
                    </span>
                </div>
            )}

            <p className="text-[13px] font-semibold text-white">{currentField.label}</p>

            {isMultipleChoice && currentField.options && !isShowingCustom && (
                <div className="flex flex-col gap-1.5">
                    {currentField.options.map((opt, idx) => (
                        <button
                            key={opt}
                            onClick={() => handleChoice(currentField.id, opt)}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left
                         bg-white/[0.06] border border-white/[0.08] text-white text-[13px]
                         hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all duration-150
                         active:scale-[0.98]"
                        >
                            <span className="w-6 h-6 rounded-full bg-[#2c2c2e] flex items-center justify-center text-[11px] font-bold text-[#8e8e93] flex-shrink-0">
                                {idx + 1}
                            </span>
                            <span className="font-medium">{opt}</span>
                        </button>
                    ))}
                    <button
                        onClick={() => setShowCustom((p) => ({ ...p, [currentField.id]: true }))}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left
                       bg-transparent border border-dashed border-white/[0.12]
                       text-[#8e8e93] text-[13px] hover:text-white hover:border-white/30
                       transition-all duration-150"
                    >
                        <span className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <path d="M6 1v10M1 6h10" />
                            </svg>
                        </span>
                        <span>Something else…</span>
                    </button>
                </div>
            )}

            {(isShowingCustom || !isMultipleChoice) && (
                <div className="flex items-center gap-2">
                    <input
                        autoFocus
                        type={currentField.inputType === "number" ? "number" : "text"}
                        value={customValues[currentField.id] ?? ""}
                        onChange={(e) =>
                            setCustomValues((p) => ({ ...p, [currentField.id]: e.target.value }))
                        }
                        onKeyDown={(e) => handleKeyDown(e, currentField.id)}
                        placeholder={currentField.placeholder ?? "Type your answer…"}
                        className="flex-1 bg-[#2c2c2e] rounded-xl px-3 py-2.5
                       text-white text-sm placeholder-[#636366]
                       border border-white/10 focus:border-indigo-500/60
                       focus:outline-none transition-colors"
                    />
                    <button
                        onClick={() => handleCustomSubmit(currentField.id)}
                        disabled={!customValues[currentField.id]?.trim()}
                        className="px-3 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400
                       disabled:opacity-40 text-white text-sm font-bold
                       transition-colors flex-shrink-0"
                    >
                        →
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── ResultsBlock ─────────────────────────────────────────────────────────────

function ResultsBlock({
    data,
    onConfirm,
    onDismiss,
}: {
    data: ResultsResponse;
    onConfirm: (pins: Pin[]) => void;
    onDismiss: () => void;
}) {
    console.log("Rendering ResultsBlock with data:", data);
    return (
        <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
                <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${data.searchType === "EVENT"
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : data.searchType === "MIXED"
                            ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                            : "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                        }`}
                >
                    {data.searchType}
                </span>
                <span className="text-[#8e8e93] text-xs">{data.pins.length} results</span>
            </div>

            <div
                className="space-y-1.5 overflow-y-auto pr-0.5"
                style={{ maxHeight: "220px" }}
            >
                {data.pins.map((pin) => (
                    <PinCard key={pin.id} pin={pin} />
                ))}
            </div>

            <div className="flex gap-2 pt-1">
                <button
                    onClick={() => onConfirm(data.pins)}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400
                     text-white text-sm font-semibold transition-colors
                     shadow-lg shadow-indigo-500/20"
                >
                    {data.confirmPrompt ?? `Drop ${data.pins.length} pins`}
                </button>
                <button
                    onClick={onDismiss}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08]
                     text-[#8e8e93] text-sm hover:text-white transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── ConfirmBlock ─────────────────────────────────────────────────────────────

function ConfirmBlock({
    data,
    onConfirm,
    onDismiss,
    isDropping,
}: {
    data: ConfirmResponse;
    onConfirm: (pins: Pin[]) => void;
    onDismiss: () => void;
    isDropping: boolean;
}) {
    return (
        <div className="mt-2 space-y-3">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] divide-y divide-white/[0.06]">
                {[
                    { label: "What", value: data.summary.what },
                    { label: "Where", value: data.summary.where },
                    { label: "Count", value: `${data.summary.count} pins` },
                    { label: "Type", value: data.summary.type, badge: true },
                ].map(({ label, value, badge }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-[#8e8e93] text-xs">{label}</span>
                        {badge ? (
                            <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${value === "EVENT"
                                    ? "bg-amber-500/15 text-amber-400"
                                    : value === "MIXED"
                                        ? "bg-purple-500/15 text-purple-400"
                                        : "bg-indigo-500/15 text-indigo-400"
                                    }`}
                            >
                                {value}
                            </span>
                        ) : (
                            <span className="text-white text-xs font-semibold">{value}</span>
                        )}
                    </div>
                ))}
            </div>

            {data.pins?.length > 0 && (
                <div
                    className="space-y-1 overflow-y-auto pr-0.5"
                    style={{ maxHeight: "220px" }}
                >
                    {data.pins.map((pin) => (
                        <PinCard key={pin.id} pin={pin} compact />
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => onConfirm(data.pins)}
                    disabled={isDropping}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                     bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60
                     text-white text-sm font-bold transition-colors
                     shadow-lg shadow-emerald-500/20"
                >
                    {isDropping ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Dropping…
                        </>
                    ) : (
                        <>
                            <span>📍</span> Confirm & Drop Pins
                        </>
                    )}
                </button>
                <button
                    onClick={onDismiss}
                    disabled={isDropping}
                    className="px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08]
                     text-[#8e8e93] text-sm hover:text-white transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── SuccessBlock ─────────────────────────────────────────────────────────────

function SuccessBlock({ data }: { data: SuccessResponse }) {
    return (
        <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl
                    bg-emerald-500/10 border border-emerald-500/25">
            <span className="text-2xl flex-shrink-0">🎉</span>
            <div>
                <p className="text-emerald-400 text-sm font-bold">{data.message}</p>
                <p className="text-emerald-500/70 text-xs mt-0.5">
                    {data.count} pin{data.count !== 1 ? "s" : ""} saved to your map
                </p>
            </div>
        </div>
    );
}

// ─── InfoBlock ────────────────────────────────────────────────────────────────

function InfoBlock({ data }: { data: InfoResponse }) {
    return (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white">
            {data.message}
        </p>
    );
}

// ─── PinCard ──────────────────────────────────────────────────────────────────

function PinCard({ pin, compact = false }: { pin: Pin; compact?: boolean }) {
    return (
        <div
            className={`flex items-start gap-2.5 rounded-xl border border-white/[0.07]
                  bg-white/[0.04] ${compact ? "px-3 py-2" : "px-3 py-2.5"}`}
        >
            {pin.image && !compact && (
                <img
                    src={pin.image}
                    alt={pin.title}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-[#2c2c2e]"
                />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${pin.type === "EVENT"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-indigo-500/20 text-indigo-400"
                            }`}
                    >
                        {pin.type ?? "LANDMARK"}
                    </span>
                    <p className="text-white text-xs font-medium truncate">{pin.title}</p>
                </div>
                {pin.address && !compact && (
                    <p className="text-[#636366] text-[11px] truncate">{pin.address}</p>
                )}
                {pin.type === "EVENT" && pin.startDate && (
                    <p className="text-amber-500/60 text-[11px] mt-0.5">
                        {formatDate(pin.startDate)}
                        {pin.endDate ? ` → ${formatDate(pin.endDate)}` : ""}
                    </p>
                )}
            </div>
            {pin.url && !compact && (
                <a
                    href={pin.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-shrink-0 text-[#636366] hover:text-indigo-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                >
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 2h5m0 0v5m0-5L7 10" />
                    </svg>
                </a>
            )}
        </div>
    );
}

// ─── AgentResponseBlock ───────────────────────────────────────────────────────

function AgentResponseBlock({
    response,
    intent,
    onAnswer,
    onConfirm,
    onDismiss,
    isDropping,
}: {
    response: AgentResponse;
    intent: PinIntent;
    onAnswer: (answers: Record<string, string>) => void;
    onConfirm: (pins: Pin[]) => void;
    onDismiss: () => void;
    isDropping: boolean;
}) {
    switch (response.type) {
        case "question":
            return (
                <div>
                    <p className="text-[13px] leading-relaxed text-white mb-1">{response.message}</p>
                    <QuestionBlock data={response} onAnswer={onAnswer} />
                    <IntentBadge intent={intent} />
                </div>
            );
        case "results":
            return (
                <div>
                    <p className="text-[13px] leading-relaxed text-white mb-1">{response.message}</p>
                    <ResultsBlock data={response} onConfirm={onConfirm} onDismiss={onDismiss} />
                </div>
            );
        case "confirm":
            return (
                <div>
                    <p className="text-[13px] leading-relaxed text-white mb-1">{response.message}</p>
                    <ConfirmBlock
                        data={response}
                        onConfirm={onConfirm}
                        onDismiss={onDismiss}
                        isDropping={isDropping}
                    />
                </div>
            );
        case "success":
            return <SuccessBlock data={response} />;
        case "info":
        default:
            return (
                <div>
                    <InfoBlock data={response} />
                    <IntentBadge intent={intent} />
                </div>
            );
    }
}

// ─── LocalChatMessage ─────────────────────────────────────────────────────────

interface LocalChatMessage {
    id: string;
    role: "user" | "assistant";
    content:
    | { kind: "text"; text: string }
    | { kind: "loading"; label?: string }
    | { kind: "response"; data: AgentResponse };
    createdAt: Date;
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
    msg,
    intent,
    onAnswer,
    onConfirm,
    onDismiss,
    isDropping,
}: {
    msg: LocalChatMessage;
    intent: PinIntent;
    onAnswer: (answers: Record<string, string>) => void;
    onConfirm: (pins: Pin[]) => void;
    onDismiss: () => void;
    isDropping: boolean;
}) {
    const isUser = msg.role === "user";

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2.5`}>
            {!isUser && (
                <div
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600
                     flex items-center justify-center text-white text-[10px] font-bold
                     flex-shrink-0 mt-1 shadow-lg shadow-indigo-500/20"
                >
                    AI
                </div>
            )}

            <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm
          ${isUser
                        ? "bg-indigo-500 text-white rounded-br-sm"
                        : "bg-[#1c1c1e] text-white border border-white/[0.06] rounded-bl-sm"
                    }`}
            >
                {msg.content.kind === "loading" && <TypingDots label={msg.content.label} />}

                {msg.content.kind === "text" && (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content.text}</p>
                )}

                {msg.content.kind === "response" && (
                    <AgentResponseBlock
                        response={msg.content.data}
                        intent={intent}
                        onAnswer={onAnswer}
                        onConfirm={onConfirm}
                        onDismiss={onDismiss}
                        isDropping={isDropping}
                    />
                )}
            </div>

            {isUser && (
                <div
                    className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center
                     text-[#8e8e93] text-xs font-bold flex-shrink-0 mt-1"
                >
                    U
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PinAgentChat() {
    const [messages, setMessages] = useState<LocalChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [intent, setIntent] = useState<PinIntent>({
        count: null,
        query: null,
        area: null,
        areaType: "unknown",
        confirmed: false,
    });
    const [stage, setStage] = useState<AgentStage>("idle");
    const [isLoading, setIsLoading] = useState(false);
    const [isDropping, setIsDropping] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const chatCreate = api.agent.create.useMutation();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Build plain-text history for tRPC ────────────────────────────────────

    const buildHistory = useCallback(
        (extraUserText?: string) => {
            const history = messages
                .map((m) => {
                    if (m.content.kind === "text") {
                        return { role: m.role as "user" | "assistant", text: m.content.text };
                    }
                    if (m.content.kind === "response") {
                        // Serialize response message back as assistant text for LLM history
                        const d = m.content.data;
                        const text =
                            d.type === "info" || d.type === "question" || d.type === "success"
                                ? d.message
                                : d.type === "results" || d.type === "confirm"
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

    // ── Core send ─────────────────────────────────────────────────────────────

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
                    content: { kind: "loading", label: "" },
                    createdAt: new Date(),
                },
            ]);
            setIsLoading(true);
            setInput("");

            try {
                const result = await chatCreate.mutateAsync({
                    messages: buildHistory(userText),
                    intent: mergedIntent,
                });

                // FIX: use the robust parseReply helper instead of a raw try/catch JSON.parse
                // This correctly handles JSON in code fences, leading text, etc.
                const agentResponse = parseReply(result.reply);

                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: { kind: "response", data: agentResponse },
                        createdAt: new Date(),
                    },
                ]);

                setStage(result.stage);
                setIntent(result.intent);
            } catch (err) {
                console.error("[sendMessage] Error:", err);
                setMessages((prev) => [
                    ...prev.filter((m) => m.id !== loadingId),
                    {
                        id: uid(),
                        role: "assistant",
                        content: {
                            kind: "response",
                            data: {
                                type: "info",
                                message: "Sorry, something went wrong. Please try again.",
                            },
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
        [isLoading, intent, buildHistory, chatCreate]
    );

    // ── Handle question answers ───────────────────────────────────────────────

    const handleAnswer = useCallback(
        (answers: Record<string, string>) => {
            const intentPatch: Partial<PinIntent> = {};
            for (const [k, v] of Object.entries(answers)) {
                if (k === "count") intentPatch.count = parseInt(v, 10) || null;
                else if (k === "query") intentPatch.query = v;
                else if (k === "area" || k === "where") intentPatch.area = v;
            }
            const summary = Object.entries(answers)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
            sendMessage(`I answered: ${summary}`, intentPatch);
        },
        [sendMessage]
    );

    // ── Handle pin drop confirmation ──────────────────────────────────────────

    const handleConfirm = useCallback(
        async (pins: Pin[]) => {
            setIsDropping(true);
            try {
                await chatCreate.mutateAsync({
                    messages: buildHistory("Yes, confirm and drop the pins."),
                    intent: { ...intent, confirmed: true },
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
                                message: `Successfully dropped ${pins.length} pins!`,
                                count: pins.length,
                            } satisfies SuccessResponse,
                        },
                        createdAt: new Date(),
                    },
                ]);
                setStage("done");
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
                        },
                        createdAt: new Date(),
                    },
                ]);
            } finally {
                setIsDropping(false);
            }
        },
        [intent, buildHistory, chatCreate]
    );

    // ── Dismiss ───────────────────────────────────────────────────────────────

    const handleDismiss = useCallback(() => {
        sendMessage("Cancel that, let me start over.");
    }, [sendMessage]);

    // ── Reset ─────────────────────────────────────────────────────────────────

    const handleReset = () => {
        setMessages([]);
        setIntent({ count: null, query: null, area: null, areaType: "unknown", confirmed: false });
        setStage("idle");
        setInput("");
        inputRef.current?.focus();
    };

    const isEmpty = messages.length === 0;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-screen bg-[#000000] text-white font-sans">

            {/* Header */}
            <header className="flex-shrink-0 flex items-center gap-3 px-5 py-4
                         border-b border-white/[0.06] bg-[#000000]/95 backdrop-blur-md z-10">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
                        flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <span className="text-lg">📍</span>
                </div>
                <div>
                    <h1 className="text-sm font-bold tracking-tight">PinDrop Agent</h1>
                    <p className="text-xs text-[#8e8e93]">AI-powered map pin creator</p>
                </div>

                {stage !== "idle" && stage !== "clarifying" && STAGE_LABEL[stage] && (
                    <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full
                          bg-white/[0.07] border border-white/[0.08] text-xs text-[#8e8e93]">
                        {(stage === "searching" || stage === "extracting_intent" || stage === "dropping_pins") && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        )}
                        {stage === "done" && <span className="text-emerald-400">✓</span>}
                        {STAGE_LABEL[stage]}
                    </div>
                )}

                {messages.length > 0 && (
                    <button
                        onClick={handleReset}
                        className="ml-auto text-xs text-[#636366] hover:text-white transition-colors px-2 py-1
                       rounded-lg hover:bg-white/[0.06]"
                    >
                        ✕ New
                    </button>
                )}
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
                {isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 pb-10">
                        <div className="text-center space-y-2">
                            <div className="text-5xl mb-3">🗺️</div>
                            <h2 className="text-xl font-bold">Drop pins anywhere</h2>
                            <p className="text-[#8e8e93] text-sm max-w-xs">
                                Tell me what to pin and where — I'll find the places and drop them on your map.
                            </p>
                        </div>
                        <div className="w-full max-w-sm space-y-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => sendMessage(s)}
                                    className="w-full px-4 py-3 rounded-xl text-sm text-left text-[#ebebf5]
                             bg-[#1c1c1e] border border-white/[0.06]
                             hover:border-indigo-500/40 hover:bg-[#2c2c2e]
                             transition-all duration-150"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <MessageBubble
                            key={msg.id}
                            msg={msg}
                            intent={intent}
                            onAnswer={handleAnswer}
                            onConfirm={handleConfirm}
                            onDismiss={handleDismiss}
                            isDropping={isDropping}
                        />
                    ))
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="flex-shrink-0 px-4 py-4 border-t border-white/[0.06]
                      bg-[#000000]/95 backdrop-blur-md">
                {(intent.count != null || intent.query || intent.area) && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <span className="text-xs text-[#636366]">Intent:</span>
                        {intent.count != null && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-[#1c1c1e] border border-white/[0.08] text-[#ebebf5]">
                                {intent.count} pins
                            </span>
                        )}
                        {intent.query && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-[#1c1c1e] border border-white/[0.08] text-[#ebebf5]">
                                {intent.query}
                            </span>
                        )}
                        {intent.area && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-[#1c1c1e] border border-white/[0.08] text-[#ebebf5]">
                                📍 {intent.area}
                            </span>
                        )}
                        <button
                            onClick={handleReset}
                            className="ml-1 text-xs text-[#636366] hover:text-white transition-colors"
                        >
                            ✕ reset
                        </button>
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage(input);
                            }
                        }}
                        disabled={isLoading}
                        placeholder="e.g. Drop 100 KFC pins in the US…"
                        className="flex-1 px-4 py-3 rounded-xl bg-[#1c1c1e] border border-white/[0.08]
                       text-white text-sm placeholder-[#636366]
                       focus:outline-none focus:border-indigo-500/50
                       disabled:opacity-50 transition-colors"
                    />
                    <button
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || isLoading}
                        className="px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-white font-semibold text-sm transition-colors
                       shadow-lg shadow-indigo-500/20"
                    >
                        {isLoading ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                        ) : (
                            "Send"
                        )}
                    </button>
                </div>
                <p className="text-xs text-[#3a3a3c] mt-2 text-center">
                    Enter ↵ to send · Agent will ask if it needs more info
                </p>
            </div>
        </div>
    );
}