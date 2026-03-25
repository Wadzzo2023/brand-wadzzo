"use client"

// src/components/AgentChat.tsx

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { api } from "~/utils/api"
import {
    Send,
    Loader2,
    MapPin,
    Calendar,
    ChevronDown,
    Minus,
    Trash2,
    Check,
    CheckCircle2,
    Sparkles,
    X,
} from "lucide-react"
import type { AgentState, AgentTask, EventData, LandmarkData, Message, PinItem } from "~/lib/agent/types"

// ─── Local types ──────────────────────────────────────────────────────────────

type DateMap = Record<string, { startDate: string; endDate: string }>

type PinCfg = {
    pinNumber: number
    pinCollectionLimit: number
    autoCollect: boolean
    multiPin: boolean
    radius: number
}

type DatePickerItem = {
    id: string
    title: string
    defaultStart: string
    defaultEnd: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_STATE: AgentState = { step: "idle", task: null }

const WELCOME: Message = {
    role: "assistant",
    content:
        "Hi! I'm your Wadzzo assistant. I can help you create location pins for real events or landmarks. What would you like to do today?",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

function toDateInput(iso: string) {
    return iso.split("T")[0] ?? ""
}

function fromDateInput(d: string) {
    return new Date(d + "T00:00:00").toISOString()
}

// ─── TaskSelect ───────────────────────────────────────────────────────────────

function TaskSelect({ onChoose }: { onChoose: (t: AgentTask) => void }) {
    const options: { type: AgentTask; icon: string; label: string; sub: string }[] = [
        {
            type: "event",
            icon: "📅",
            label: "Event Pins",
            sub: "Real upcoming events in your area",
        },
        {
            type: "landmark",
            icon: "📍",
            label: "Landmark Pins",
            sub: "Restaurants, shops, parks & more",
        },
    ]

    return (
        <div className="mt-3 grid grid-cols-2 gap-3">
            {options.map((opt) => (
                <button
                    key={String(opt.type)}
                    onClick={() => onChoose(opt.type)}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-4 text-left transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
                >
                    <span className="text-2xl">{opt.icon}</span>
                    <span className="font-bold text-sm text-foreground">{opt.label}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{opt.sub}</span>
                </button>
            ))}
        </div>
    )
}

// ─── EventList ────────────────────────────────────────────────────────────────

function EventList({
    events,
    selected,
    onToggle,
    onConfirm,
}: {
    events: EventData[]
    selected: EventData[]
    onToggle: (e: EventData) => void
    onConfirm: () => void
}) {
    const selIds = new Set(selected.map((e) => e.id))

    return (
        <div className="mt-3 flex flex-col gap-2">
            {events.map((ev, i) => {
                const isSel = selIds.has(ev.id)
                return (
                    <div
                        key={ev.id}
                        onClick={() => onToggle(ev)}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${isSel ? "border-primary bg-primary/5" : "border-border bg-muted/20 opacity-50"
                            }`}
                    >
                        <div
                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all ${isSel ? "border-primary bg-primary" : "border-border"
                                }`}
                        >
                            {isSel ? (
                                <Check className="h-3 w-3 text-primary-foreground" />
                            ) : (
                                <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="font-semibold text-sm text-foreground">{ev.title}</span>
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{ev.description}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}
                                </span>
                                {ev.venue && (
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {ev.venue}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}

            <p className="text-center text-[11px] text-muted-foreground">
                {selected.length}/{events.length} selected · tap to toggle
            </p>
            <button
                onClick={onConfirm}
                disabled={selected.length === 0}
                className="mt-1 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            >
                Confirm {selected.length} Event{selected.length !== 1 ? "s" : ""} →
            </button>
        </div>
    )
}

// ─── LandmarkList ─────────────────────────────────────────────────────────────

function LandmarkList({
    landmarks,
    selected,
    onToggle,
    onConfirm,
}: {
    landmarks: LandmarkData[]
    selected: LandmarkData[]
    onToggle: (l: LandmarkData) => void
    onConfirm: () => void
}) {
    const selIds = new Set(selected.map((l) => l.id))

    return (
        <div className="mt-3 flex flex-col gap-2">
            {landmarks.map((lm, i) => {
                const isSel = selIds.has(lm.id)
                return (
                    <div
                        key={lm.id}
                        onClick={() => onToggle(lm)}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${isSel ? "border-primary bg-primary/5" : "border-border bg-muted/20 opacity-50"
                            }`}
                    >
                        <div
                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all ${isSel ? "border-primary bg-primary" : "border-border"
                                }`}
                        >
                            {isSel ? (
                                <Check className="h-3 w-3 text-primary-foreground" />
                            ) : (
                                <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-sm text-foreground">{lm.title}</span>
                                {lm.category && (
                                    <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                                        {lm.category}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{lm.description}</p>
                            {lm.address && (
                                <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {lm.address}
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}

            <p className="text-center text-[11px] text-muted-foreground">
                {selected.length}/{landmarks.length} selected · tap to toggle
            </p>
            <button
                onClick={onConfirm}
                disabled={selected.length === 0}
                className="mt-1 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            >
                Confirm {selected.length} Landmark{selected.length !== 1 ? "s" : ""} →
            </button>
        </div>
    )
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

function DatePicker({
    items,
    onConfirm,
}: {
    items: DatePickerItem[]
    onConfirm: (dates: DateMap) => void
}) {
    const [dates, setDates] = useState<DateMap>(() =>
        Object.fromEntries(
            items.map((it) => [
                it.id,
                {
                    startDate: toDateInput(it.defaultStart),
                    endDate: toDateInput(it.defaultEnd),
                },
            ]),
        ),
    )

    function update(id: string, field: "startDate" | "endDate", value: string) {
        setDates((prev) => ({ ...prev, [id]: { ...prev[id]!, [field]: value } }))
    }

    return (
        <div className="mt-3 flex flex-col gap-3">
            {items.map((it) => (
                <div key={it.id} className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="mb-2 font-semibold text-sm text-foreground">{it.title}</p>
                    <div className="grid grid-cols-2 gap-2">
                        {(["startDate", "endDate"] as const).map((field) => (
                            <div key={field}>
                                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {field === "startDate" ? "Start" : "End"}
                                </label>
                                <input
                                    type="date"
                                    value={dates[it.id]?.[field] ?? ""}
                                    onChange={(e) => update(it.id, field, e.target.value)}
                                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <button
                onClick={() => onConfirm(dates)}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
                Confirm Dates →
            </button>
        </div>
    )
}

// ─── PinConfigForm ────────────────────────────────────────────────────────────

function PinConfigForm({
    items,
    isLandmark,
    onConfirm,
}: {
    items: Array<{ id: string; title: string }>
    isLandmark: boolean
    onConfirm: (cfgs: Record<string, PinCfg>) => void
}) {
    const [cfgs, setCfgs] = useState<Record<string, PinCfg>>(() =>
        Object.fromEntries(
            items.map((it) => [
                it.id,
                {
                    pinNumber: isLandmark ? 1 : 5,
                    pinCollectionLimit: isLandmark ? 999999 : 100,
                    autoCollect: false,
                    multiPin: false,
                    radius: 50,
                },
            ]),
        ),
    )

    function update<K extends keyof PinCfg>(id: string, key: K, value: PinCfg[K]) {
        setCfgs((prev) => ({ ...prev, [id]: { ...prev[id]!, [key]: value } }))
    }

    return (
        <div className="mt-3 flex flex-col gap-3">
            {items.map((it) => {
                const cfg = cfgs[it.id]!
                return (
                    <div key={it.id} className="rounded-xl border border-border bg-muted/30 p-3">
                        <p className="mb-3 font-semibold text-sm text-foreground">{it.title}</p>
                        <div className="flex flex-col gap-3">

                            {/* Pin Count */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-foreground">Pin Count</p>
                                    <p className="text-[11px] text-muted-foreground">Pins scattered in area</p>
                                </div>
                                {isLandmark ? (
                                    <span className="rounded-lg border border-border bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground">
                                        1 (fixed)
                                    </span>
                                ) : (
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={cfg.pinNumber}
                                        onChange={(e) => update(it.id, "pinNumber", Number(e.target.value))}
                                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-primary"
                                    />
                                )}
                            </div>

                            {/* Collection Limit */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-foreground">Collection Limit</p>
                                    <p className="text-[11px] text-muted-foreground">Max total collections</p>
                                </div>
                                {isLandmark ? (
                                    <span className="rounded-lg border border-border bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground">
                                        999999 (fixed)
                                    </span>
                                ) : (
                                    <input
                                        type="number"
                                        min={1}
                                        value={cfg.pinCollectionLimit}
                                        onChange={(e) => update(it.id, "pinCollectionLimit", Number(e.target.value))}
                                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-primary"
                                    />
                                )}
                            </div>

                            {/* Radius */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-foreground">Radius (metres)</p>
                                    <p className="text-[11px] text-muted-foreground">Scatter area around pin</p>
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    value={cfg.radius}
                                    onChange={(e) => update(it.id, "radius", Number(e.target.value))}
                                    className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-primary"
                                />
                            </div>

                            {/* Toggle row */}
                            <div className="grid grid-cols-2 gap-2">
                                {(
                                    [
                                        ["autoCollect", "Auto Collect"],
                                        ["multiPin", "Multi Pin"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <button
                                        key={key}
                                        onClick={() => update(it.id, key, !cfg[key])}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-all ${cfg[key]
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border text-muted-foreground"
                                            }`}
                                    >
                                        {label}
                                        <div
                                            className={`relative h-4 w-7 rounded-full transition-colors ${cfg[key] ? "bg-primary" : "bg-border"
                                                }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${cfg[key] ? "translate-x-3" : "translate-x-0.5"
                                                    }`}
                                            />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            })}

            <button
                onClick={() => onConfirm(cfgs)}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
                Confirm Configuration →
            </button>
        </div>
    )
}

// ─── ConfirmReview ────────────────────────────────────────────────────────────

function ConfirmReview({
    pins,
    onConfirm,
    onEdit,
}: {
    pins: PinItem[]
    onConfirm: () => void
    onEdit: (msg: string) => void
}) {
    const [editMsg, setEditMsg] = useState("")

    function submitEdit() {
        if (!editMsg.trim()) return
        onEdit(editMsg)
        setEditMsg("")
    }

    return (
        <div className="mt-3 flex flex-col gap-3">
            {/* Pin summary */}
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                {pins.map((p, i) => (
                    <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="font-semibold text-sm text-foreground">{p.title}</span>
                            <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span><span className="text-foreground/60">Pins: </span>{p.pinNumber ?? 1}</span>
                            <span><span className="text-foreground/60">Limit: </span>{p.pinCollectionLimit ?? "—"}</span>
                            <span><span className="text-foreground/60">Radius: </span>{p.radius ?? 50}m</span>
                            <span><span className="text-foreground/60">Auto: </span>{p.autoCollect ? "Yes" : "No"}</span>
                            <span className="col-span-2"><span className="text-foreground/60">Start: </span>{fmtDate(p.startDate)}</span>
                            <span className="col-span-2"><span className="text-foreground/60">End: </span>{fmtDate(p.endDate)}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Inline edit request */}
            <div className="flex gap-2">
                <input
                    value={editMsg}
                    onChange={(e) => setEditMsg(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitEdit() }}
                    placeholder='e.g. "Change #2 radius to 100m"'
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
                <button
                    onClick={submitEdit}
                    disabled={!editMsg.trim()}
                    className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                >
                    Edit
                </button>
            </div>

            <button
                onClick={onConfirm}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
                ✓ Generate {pins.length} Pin{pins.length !== 1 ? "s" : ""}
            </button>
        </div>
    )
}

// ─── PinResult ────────────────────────────────────────────────────────────────

function PinResult({ count, onNew }: { count: number; onNew: (t: AgentTask) => void }) {
    return (
        <div className="mt-3 flex flex-col items-center gap-4 py-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="text-center">
                <p className="font-bold text-foreground">
                    {count} pin{count !== 1 ? "s" : ""} sent for approval!
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    They{"'"}ll appear on the map once approved.
                </p>
            </div>
            <p className="text-sm text-muted-foreground">Want to create more?</p>
            <div className="grid w-full grid-cols-2 gap-2">
                <button
                    onClick={() => onNew("event")}
                    className="rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
                >
                    📅 Event Pins
                </button>
                <button
                    onClick={() => onNew("landmark")}
                    className="rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
                >
                    📍 Landmark Pins
                </button>
            </div>
        </div>
    )
}

// ─── Main AgentChat ───────────────────────────────────────────────────────────

export default function AgentChat() {
    const [isOpen, setIsOpen] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
    const [messages, setMessages] = useState<Message[]>([WELCOME])
    const [input, setInput] = useState("")
    const [agentState, setAgentState] = useState<AgentState>(INITIAL_STATE)

    const endRef = useRef<HTMLDivElement>(null)
    const chatMutation = api.agent.chat.useMutation()

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    // ── Core send ─────────────────────────────────────────────────────────────

    const send = useCallback(
        async (userMsg: string, stateOverride?: Partial<AgentState>) => {
            if (!userMsg.trim() || chatMutation.isLoading) return

            const currentState = stateOverride
                ? { ...agentState, ...stateOverride }
                : agentState

            const history = messages.map((m) => ({ role: m.role, content: m.content }))

            setMessages((prev) => [...prev, { role: "user", content: userMsg }])
            setInput("")

            try {
                const res = await chatMutation.mutateAsync({
                    message: userMsg,
                    history,
                    state: currentState,
                })

                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: res.message,
                        uiData: res.uiData ?? undefined,
                    },
                ])
                setAgentState(res.state)
            } catch {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: "Sorry, something went wrong. Please try again.",
                    },
                ])
            }
        },
        [agentState, chatMutation, messages],
    )

    // ── Handlers ──────────────────────────────────────────────────────────────

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void send(input)
        }
    }

    function clear() {
        setMessages([WELCOME])
        setAgentState(INITIAL_STATE)
    }

    function handleTaskSelect(t: AgentTask) {
        void send(
            t === "event" ? "I want to create event pins" : "I want to create landmark pins",
            { task: t },
        )
    }

    function handleEventToggle(ev: EventData) {
        setAgentState((prev) => {
            const sel = prev.selectedEvents ?? []
            const has = sel.some((e) => e.id === ev.id)
            return {
                ...prev,
                selectedEvents: has ? sel.filter((e) => e.id !== ev.id) : [...sel, ev],
            }
        })
    }

    function handleLandmarkToggle(lm: LandmarkData) {
        setAgentState((prev) => {
            const sel = prev.selectedLandmarks ?? []
            const has = sel.some((l) => l.id === lm.id)
            return {
                ...prev,
                selectedLandmarks: has ? sel.filter((l) => l.id !== lm.id) : [...sel, lm],
            }
        })
    }

    function handleEventConfirm() {
        const sel = agentState.selectedEvents ?? []
        console.log("Selected events:", sel)
        void send(
            `Confirmed ${sel.length} events: ${sel.map((e) => e.title).join(", ")}. Please proceed to date configuration.`,
        )
    }

    function handleLandmarkConfirm() {
        const sel = agentState.selectedLandmarks ?? []
        // Server enforces landmark_confirm_list -> landmark_pin_config (skips date step)
        void send(
            `Confirmed ${sel.length} landmarks: ${sel.map((l) => l.title).join(", ")}. Please show pin configuration.`,
            { selectedLandmarks: sel },
        )
    }

    function handleDateConfirm(dates: DateMap) {
        const summary = Object.entries(dates)
            .map(([id, d]) => `${id}: ${d.startDate} -> ${d.endDate}`)
            .join("; ")

        // Merge dates into pinConfig — server reads this when building PinItem[]
        const pinConfigPatch = Object.fromEntries(
            Object.entries(dates).map(([id, d]) => [
                id,
                {
                    ...((agentState.pinConfig as Record<string, Record<string, unknown>> | undefined)?.[id] ?? {}),
                    startDate: fromDateInput(d.startDate),
                    endDate: fromDateInput(d.endDate),
                },
            ]),
        )

        // Server enforces event_pin_dates -> event_pin_config
        void send(
            `Dates confirmed — ${summary}. Please show pin configuration form.`,
            { pinConfig: { ...agentState.pinConfig, ...pinConfigPatch } },
        )
    }

    function handlePinConfigConfirm(cfgs: Record<string, PinCfg>) {
        const summary = Object.entries(cfgs)
            .map(
                ([id, c]) =>
                    `${id}: pins=${c.pinNumber} limit=${c.pinCollectionLimit} radius=${c.radius}m auto=${c.autoCollect} multi=${c.multiPin}`,
            )
            .join("; ")

        // Merge new cfg values on top of existing pinConfig entries (preserves dates)
        const merged = Object.fromEntries(
            Object.entries(cfgs).map(([id, c]) => [
                id,
                {
                    ...((agentState.pinConfig as Record<string, Record<string, unknown>> | undefined)?.[id] ?? {}),
                    ...c,
                },
            ]),
        )

        // Server enforces event_pin_config -> event_final_confirm
        //          or landmark_pin_config -> landmark_final_confirm
        void send(
            `Pin configuration confirmed — ${summary}. Please show the final review.`,
            { pinConfig: { ...agentState.pinConfig, ...merged } },
        )
    }

    function handleFinalConfirm() {
        // Find the latest confirm uiData to pass pins back so server can call generate_pins
        const confirmMsg = [...messages].reverse().find((m) => m.uiData?.type === "confirm")
        const pins = (confirmMsg?.uiData?.data as { pins: PinItem[] } | undefined)?.pins ?? []

        console.log("Final confirmed pins:", pins)
        void send("Everything looks correct. Please generate the pins now.", { pins })
    }

    function handleFinalEdit(msg: string) {
        void send(msg)
    }

    function handleNewTask(t: AgentTask) {
        setAgentState(INITIAL_STATE)
        void send(
            t === "event" ? "I want to create more event pins" : "I want to create more landmark pins",
            INITIAL_STATE,
        )
    }

    // ── Render uiData ─────────────────────────────────────────────────────────

    function renderUiData(uiData: Message["uiData"], msgIndex: number) {
        if (!uiData) return null
        const isLast = msgIndex === messages.length - 1

        switch (uiData.type) {
            // ── task_select ──────────────────────────────────────────────────────
            case "task_select":
                return isLast ? <TaskSelect onChoose={handleTaskSelect} /> : null

            // ── event_list ───────────────────────────────────────────────────────
            case "event_list": {
                const { events } = uiData.data as { events: EventData[] }
                if (!isLast)
                    return (
                        <p className="mt-1 text-xs text-muted-foreground">{events.length} events loaded ✓</p>
                    )
                return (
                    <EventList
                        events={events}
                        selected={agentState.selectedEvents ?? events}
                        onToggle={handleEventToggle}
                        onConfirm={handleEventConfirm}
                    />
                )
            }

            // ── landmark_list ────────────────────────────────────────────────────
            case "landmark_list": {
                const { landmarks } = uiData.data as { landmarks: LandmarkData[] }
                if (!isLast)
                    return (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {landmarks.length} landmarks loaded ✓
                        </p>
                    )
                return (
                    <LandmarkList
                        landmarks={landmarks}
                        selected={agentState.selectedLandmarks ?? landmarks}
                        onToggle={handleLandmarkToggle}
                        onConfirm={handleLandmarkConfirm}
                    />
                )
            }

            // ── date_picker ──────────────────────────────────────────────────────
            case "date_picker": {
                const { items } = uiData.data as { items: DatePickerItem[] }
                if (!isLast)
                    return <p className="mt-1 text-xs text-muted-foreground">Dates configured ✓</p>
                return <DatePicker items={items} onConfirm={handleDateConfirm} />
            }

            // ── pin_config_form ──────────────────────────────────────────────────
            case "pin_config_form": {
                const { items, isLandmark } = uiData.data as {
                    items: Array<{ id: string; title: string }>
                    isLandmark: boolean
                }
                if (!isLast)
                    return <p className="mt-1 text-xs text-muted-foreground">Pin config set ✓</p>
                return (
                    <PinConfigForm
                        items={items}
                        isLandmark={isLandmark}
                        onConfirm={handlePinConfigConfirm}
                    />
                )
            }

            // ── confirm ──────────────────────────────────────────────────────────
            case "confirm": {
                const { pins } = uiData.data as { pins: PinItem[] }
                if (!isLast)
                    return (
                        <p className="mt-1 text-xs text-muted-foreground">{pins.length} pins reviewed ✓</p>
                    )
                return (
                    <ConfirmReview
                        pins={pins}
                        onConfirm={handleFinalConfirm}
                        onEdit={handleFinalEdit}
                    />
                )
            }

            // ── pin_result ───────────────────────────────────────────────────────
            case "pin_result": {
                const { count } = uiData.data as { count: number }
                return <PinResult count={count} onNew={handleNewTask} />
            }

            // ── next_action ──────────────────────────────────────────────────────
            case "next_action":
                if (!isLast) return null
                return (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            onClick={() => handleNewTask("event")}
                            className="rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
                        >
                            📅 More Events
                        </button>
                        <button
                            onClick={() => handleNewTask("landmark")}
                            className="rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
                        >
                            📍 More Landmarks
                        </button>
                    </div>
                )

            default:
                return null
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            {/* Minimized pill */}
            {isMinimized && (
                <button
                    onClick={() => {
                        setIsMinimized(false)
                        setIsOpen(true)
                    }}
                    className="fixed bottom-12 left-1/2 z-40 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
                >
                    Wadzzo Assistant
                </button>
            )}

            {/* Neon input bar */}
            {!isMinimized && (
                <div className="fixed bottom-6 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 px-4">
                    <style>{`
            @keyframes neon-glow {
              0%, 100% { box-shadow: 0 0 5px rgba(34,197,94,.3), 0 0 10px rgba(34,197,94,.2); }
              50%       { box-shadow: 0 0 15px rgba(34,197,94,.6), 0 0 25px rgba(34,197,94,.4); }
            }
            .neon-bar {
              animation: neon-glow 3s ease-in-out infinite;
              border: 2px solid rgba(34,197,94,.5);
            }
          `}</style>

                    <div className="neon-bar flex items-center gap-2 rounded-full bg-white p-1 shadow-lg backdrop-blur-sm">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask me anything..."
                            disabled={chatMutation.isLoading}
                            className="flex-1 rounded-full bg-white px-5 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                        />
                        <button
                            onClick={() => void send(input)}
                            disabled={!input.trim() || chatMutation.isLoading}
                            className="flex flex-shrink-0 items-center justify-center rounded-full bg-primary px-4 py-3 text-primary-foreground transition-all hover:scale-105 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {chatMutation.isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Send className="h-5 w-5" />
                            )}
                        </button>
                        <button
                            onClick={() => setIsOpen((p) => !p)}
                            className="flex flex-shrink-0 items-center justify-center rounded-full bg-primary/80 px-4 py-3 text-primary-foreground transition-all hover:scale-105 active:scale-95"
                        >
                            <ChevronDown
                                className={`h-5 w-5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                            />
                        </button>
                    </div>
                </div>
            )}

            {/* Chat drawer */}
            {isOpen && !isMinimized && (
                <div className="fixed inset-x-0 bottom-40 z-40 mx-auto flex h-[70vh] max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in slide-in-from-bottom-5 duration-300 ">
                    {/* Header */}
                    <div className="flex flex-shrink-0 items-center justify-between bg-primary px-5 py-3 text-primary-foreground">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/20">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="font-bold text-sm">Wadzzo Assistant</p>
                                <p className="text-[11px] text-white/70">Pin Generation Agent</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={clear}
                                title="Clear chat"
                                className="rounded-full p-2 transition-colors hover:bg-white/20"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => { setIsMinimized(true); setIsOpen(false) }}
                                title="Minimize"
                                className="rounded-full p-2 transition-colors hover:bg-white/20"
                            >
                                <Minus className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                title="Close"
                                className="rounded-full p-2 transition-colors hover:bg-white/20"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 space-y-4 overflow-y-auto p-5">
                        {messages.map((msg, i) => (
                            <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {msg.role === "user" ? (
                                    /* User bubble */
                                    <div className="flex justify-end">
                                        <div className="max-w-[78%] rounded-3xl rounded-tr-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                                            {msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    /* Assistant bubble */
                                    <div className="flex justify-start">
                                        <div className="max-w-[88%] rounded-3xl rounded-tl-lg bg-muted px-4 py-3 shadow-sm">
                                            {msg.content && (
                                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                                    {msg.content}
                                                </p>
                                            )}
                                            {msg.uiData && renderUiData(msg.uiData, i)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {chatMutation.isLoading && (
                            <div className="flex justify-start animate-in fade-in">
                                <div className="rounded-3xl rounded-tl-lg bg-muted px-4 py-3 shadow-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="text-xs">Thinking…</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={endRef} />
                    </div>
                </div>
            )}
        </>
    )
}