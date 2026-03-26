"use client"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/router"
import {
    ArrowLeft, CheckCircle2, XCircle, AlertCircle,
    ShieldCheck, RefreshCw, Ticket, Clock, Users, Search,
} from "lucide-react"
import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "~/components/shadcn/ui/avatar"
import { Badge } from "~/components/shadcn/ui/badge"
import { api } from "~/utils/api"

// ─── Types ─────────────────────────────────────────────────────────────────────

type RedeemStatus = "success" | "already_redeemed" | "not_found"

const STATUS_UI: Record<RedeemStatus, {
    icon: React.ReactNode
    title: string
    desc: string
    accent: string
    bg: string
    border: string
}> = {
    success: {
        icon: <CheckCircle2 className="w-10 h-10 [color:hsl(var(--success))]" strokeWidth={1.5} />,
        title: "Redeemed!",
        desc: "Reward successfully claimed.",
        accent: "[color:hsl(var(--success))]",
        bg: "[background-color:hsl(var(--success)/0.08)]",
        border: "[border-color:hsl(var(--success)/0.2)]",
    },
    already_redeemed: {
        icon: <AlertCircle className="w-10 h-10 [color:hsl(var(--warning))]" strokeWidth={1.5} />,
        title: "Already Used",
        desc: "This code was already redeemed.",
        accent: "[color:hsl(var(--warning))]",
        bg: "[background-color:hsl(var(--warning)/0.08)]",
        border: "[border-color:hsl(var(--warning)/0.2)]",
    },
    not_found: {
        icon: <XCircle className="w-10 h-10 [color:hsl(var(--destructive))]" strokeWidth={1.5} />,
        title: "Invalid Code",
        desc: "No reward found for this code.",
        accent: "[color:hsl(var(--destructive))]",
        bg: "[background-color:hsl(var(--destructive)/0.08)]",
        border: "[border-color:hsl(var(--destructive)/0.2)]",
    },
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function UserLocationCard({
    user,
    location,
    extra,
}: {
    user: { name?: string | null; image?: string | null; email?: string | null }
    location: { title?: string | null; brand_name?: string | null; image_url?: string | null }
    extra?: React.ReactNode
}) {
    return (
        <div className="flex items-center gap-3 w-full [background-color:hsl(var(--card)/0.5)] rounded-2xl px-4 py-3 border [border-color:hsl(var(--border)/0.5)]">
            <Avatar className="h-10 w-10 border [border-color:hsl(var(--border)/0.6)] flex-shrink-0">
                <AvatarImage src={user.image ?? ""} />
                <AvatarFallback className="bg-slate-700 text-white text-sm font-bold">
                    {user.name?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold [color:hsl(var(--foreground))] truncate">{user.name ?? "Unknown"}</p>
                <p className="text-xs [color:hsl(var(--muted-foreground))] truncate">{location.title ?? location.brand_name ?? "—"}</p>
            </div>
            {extra}
        </div>
    )
}

// ─── Tab: Redeem ───────────────────────────────────────────────────────────────

function RedeemTab() {
    const [code, setCode] = useState("")
    const redeemMutation = api.maps.pin.redeemByCode.useMutation()

    const status: RedeemStatus | null = redeemMutation.isSuccess
        ? redeemMutation.data.status as RedeemStatus
        : redeemMutation.isError
            ? "not_found"
            : null

    const result = redeemMutation.isSuccess ? redeemMutation.data : null
    const cfg = status ? STATUS_UI[status] : null

    const handleSubmit = () => {
        const clean = code.trim().toUpperCase()
        if (clean.length !== 6) return
        redeemMutation.mutate({ code: clean })
    }

    const handleReset = () => {
        setCode("")
        redeemMutation.reset()
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
        setCode(val)
    }

    const isReady = code.trim().length === 6

    return (
        <div className="space-y-5">
            {/* Input area */}
            <AnimatePresence mode="wait">
                {!status && (
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <div className="space-y-2">
                            <label className="text-xs font-semibold [color:hsl(var(--muted-foreground))] uppercase tracking-widest">
                                Reward Code
                            </label>

                            {/* Big segmented code display + input */}
                            <div className="relative">
                                <Input
                                    value={code}
                                    onChange={handleChange}
                                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                                    placeholder="X7K2PQ"
                                    maxLength={6}
                                    autoFocus
                                    className="
                    h-16 text-center text-3xl font-black font-mono tracking-[0.35em]
                    [background-color:hsl(var(--input)/0.6)] [border-color:hsl(var(--border)/0.15)] [color:hsl(var(--foreground))] placeholder:[color:hsl(var(--muted-foreground))]
                    rounded-2xl focus-visible:[border-color:hsl(var(--success)/0.6)] focus-visible:ring-0
                    transition-all duration-200
                  "
                                />
                                {/* Character count dots */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-1.5 h-1.5 rounded-full transition-all duration-150 ${i < code.length ? "[background-color:hsl(var(--success))]" : "[background-color:hsl(var(--border)/0.15)]"
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={handleSubmit}
                            disabled={!isReady || redeemMutation.isLoading}
                            className={`
                w-full h-12 rounded-2xl font-bold text-sm transition-all duration-200
                ${isReady
                                    ? "[background-color:hsl(var(--success))] hover:[background-color:hsl(var(--success)/0.8)] [color:hsl(var(--foreground))] shadow-lg [box-shadow:0_0_20px_hsl(var(--success)/0.2)]"
                                    : "[background-color:hsl(var(--card)/0.6)] [color:hsl(var(--muted-foreground))] cursor-not-allowed"
                                }
              `}
                        >
                            {redeemMutation.isLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 [border-color:hsl(var(--foreground)/0.3)] [border-top-color:hsl(var(--foreground))] rounded-full animate-spin" />
                                    Verifying…
                                </div>
                            ) : (
                                <>
                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                    Verify & Redeem
                                </>
                            )}
                        </Button>
                    </motion.div>
                )}

                {/* Result */}
                {cfg && (
                    <motion.div
                        key="result"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", stiffness: 280, damping: 22 }}
                        className={`rounded-3xl border ${cfg.bg} ${cfg.border} p-6 space-y-4`}
                    >
                        {/* Status header */}
                        <div className="flex items-center gap-3">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.06 }}
                            >
                                {cfg.icon}
                            </motion.div>
                            <div>
                                <h3 className={`text-xl font-black ${cfg.accent}`}>{cfg.title}</h3>
                                <p className="text-sm [color:hsl(var(--muted-foreground))]">{cfg.desc}</p>
                            </div>
                        </div>

                        {/* User + location card */}
                        {result && "user" in result && result.user && "location" in result && result.location && (
                            <UserLocationCard
                                user={result.user}
                                location={result.location}
                                extra={
                                    status === "already_redeemed" && "redeemedAt" in result && result.redeemedAt ? (
                                        <span className="text-xs text-amber-400/70 flex-shrink-0">
                                            {new Date(result.redeemedAt).toLocaleDateString()}
                                        </span>
                                    ) : undefined
                                }
                            />
                        )}

                        {/* Code used */}
                        <div className="flex items-center justify-between px-4 py-2.5 [background-color:hsl(var(--card)/0.4)] rounded-xl">
                            <span className="text-xs [color:hsl(var(--muted-foreground))]">Code used</span>
                            <span className="text-sm font-mono font-bold [color:hsl(var(--foreground)/0.8)] tracking-widest">{code}</span>
                        </div>

                        <Button
                            onClick={handleReset}
                            variant="ghost"
                            className="w-full h-10 rounded-xl [color:hsl(var(--muted-foreground))] hover:[color:hsl(var(--foreground))] hover:[background-color:hsl(var(--card)/0.8)] text-sm"
                        >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            Redeem another
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ─── Tab: History ──────────────────────────────────────────────────────────────

function HistoryTab() {
    const [search, setSearch] = useState("")
    const { data, isLoading } = api.maps.pin.getRedeemedByCreator.useQuery()

    const filtered = (data ?? []).filter((item) => {
        const q = search.toLowerCase()
        return (
            item.user?.name?.toLowerCase().includes(q) ??
            item.location?.title?.toLowerCase().includes(q) ??
            item.redeemCode?.toLowerCase().includes(q)
        )
    })

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 [border-color:hsl(var(--border)/0.15)] [border-top-color:hsl(var(--foreground)/0.6)] rounded-full animate-spin" />
                <p className="[color:hsl(var(--muted-foreground))] text-sm">Loading history…</p>
            </div>
        )
    }

    if (!data?.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl [background-color:hsl(var(--card)/0.5)] border [border-color:hsl(var(--border)/0.6)] flex items-center justify-center">
                    <Users className="w-6 h-6 [color:hsl(var(--muted-foreground))]" />
                </div>
                <p className="[color:hsl(var(--foreground))] text-sm font-medium">No redemptions yet</p>
                <p className="[color:hsl(var(--muted-foreground))] text-xs max-w-[200px]">
                    Redeemed rewards from your pins will appear here.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 [color:hsl(var(--muted-foreground))]" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, pin or code…"
                    className="pl-10 h-10 [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.15)] [color:hsl(var(--foreground))] placeholder:[color:hsl(var(--muted-foreground))] rounded-xl text-sm focus-visible:ring-0 focus-visible:[border-color:hsl(var(--border)/0.2)]"
                />
            </div>

            {/* Count */}
            <div className="flex items-center justify-between">
                <p className="text-xs [color:hsl(var(--muted-foreground))]">{filtered.length} redemption{filtered.length !== 1 ? "s" : ""}</p>
            </div>

            {/* List */}
            <div className="space-y-2">
                {filtered.map((item, i) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 [background-color:hsl(var(--card)/0.4)] hover:[background-color:hsl(var(--card)/0.7)] border [border-color:hsl(var(--border)/0.15)] rounded-2xl px-4 py-3 transition-colors"
                    >
                        <Avatar className="h-9 w-9 border [border-color:hsl(var(--border)/0.6)] flex-shrink-0">
                            <AvatarImage src={item.user?.image ?? ""} />
                            <AvatarFallback className="[background-color:hsl(var(--card))] [color:hsl(var(--foreground))] text-xs font-bold">
                                {item.user?.name?.[0]?.toUpperCase() ?? "?"}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold [color:hsl(var(--foreground))] truncate">
                                {item.user?.name ?? "Unknown user"}
                            </p>
                            <p className="text-xs [color:hsl(var(--muted-foreground))] truncate">
                                {item.location?.title ?? "—"}
                            </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-xs font-mono font-bold [color:hsl(var(--foreground)/0.8)] tracking-widest">
                                {item.redeemCode}
                            </span>
                            <span className="text-xs [color:hsl(var(--muted-foreground))] flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.redeemedAt
                                    ? new Date(item.redeemedAt).toLocaleDateString("en-US", {
                                        month: "short", day: "numeric",
                                    })
                                    : "—"}
                            </span>
                        </div>
                    </motion.div>
                ))}

                {filtered.length === 0 && search && (
                    <p className="text-center [color:hsl(var(--muted-foreground))] text-sm py-8">No results for {search}</p>
                )}
            </div>
        </div>
    )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

const RedeemPage = () => {
    const router = useRouter()
    const [tab, setTab] = useState<"redeem" | "history">("redeem")

    return (
        <div className="min-h-screen [background-color:hsl(var(--background))] [color:hsl(var(--foreground))]">
            {/* Subtle background texture */}
            <div className="fixed inset-0 [background-image:radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--success)/0.06),transparent)] pointer-events-none" />

            {/* Header */}

            <div className="px-5 pb-12 max-w-md mx-auto">
                {/* Tabs */}
                <motion.div
                    className="flex gap-1 [background-color:hsl(var(--primary)/0.4)] border [border-color:hsl(var(--border)/0.15)] rounded-2xl p-1 my-6"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                >
                    {(["redeem", "history"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`
                flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-all duration-200
                ${tab === t
                                    ? "[background-color:hsl(var(--card)/0.6)] [color:hsl(var(--foreground))] shadow-sm "
                                    : "[color:hsl(var(--muted-foreground))] hover:[color:hsl(var(--foreground)/0.8)]"
                                }
              `}
                        >
                            {t === "redeem"
                                ? <><Ticket className="w-4 h-4" />Redeem</>
                                : <><Users className="w-4 h-4" />History</>
                            }
                        </button>
                    ))}
                </motion.div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                    >
                        {tab === "redeem" ? <RedeemTab /> : <HistoryTab />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}

export default RedeemPage