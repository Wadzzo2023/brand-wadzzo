"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/router";
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ShieldCheck,
    RefreshCw,
    Ticket,
    Clock,
    Users,
    Search,
    X,
    MapPin,
    Calendar,
} from "lucide-react";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import {
    Avatar,
    AvatarImage,
    AvatarFallback,
} from "~/components/shadcn/ui/avatar";
import { Badge } from "~/components/shadcn/ui/badge";
import Image from "next/image";
import { api } from "~/utils/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

type RedeemStatus = "success" | "already_redeemed" | "not_found";

interface LocationGroup {
    id: string;
    title: string;
    description?: string | null;
    image?: string | null;
    link?: string | null;
    type: string;
    startDate: Date;
    endDate: Date;
    creator?: { name: string | null } | null;
}

interface RedeemUser {
    name: string | null;
    image: string | null;
    email: string | null;
}

interface RedeemLocation {
    latitude: number;
    longitude: number;
}

interface HistoryItem {
    id: string;
    redeemCode: string;
    redeemedAt: string | null;
    user: RedeemUser;
    location: LocationGroup;
    locationData: RedeemLocation;
}

const STATUS_UI: Record<
    RedeemStatus,
    {
        icon: React.ReactNode;
        title: string;
        desc: string;
        accent: string;
        bg: string;
        border: string;
    }
> = {
    success: {
        icon: (
            <CheckCircle2
                className="h-10 w-10 [color:hsl(var(--success))]"
                strokeWidth={1.5}
            />
        ),
        title: "Redeemed!",
        desc: "Reward successfully claimed.",
        accent: "[color:hsl(var(--success))]",
        bg: "[background-color:hsl(var(--success)/0.08)]",
        border: "[border-color:hsl(var(--success)/0.2)]",
    },
    already_redeemed: {
        icon: (
            <AlertCircle
                className="h-10 w-10 [color:hsl(var(--warning))]"
                strokeWidth={1.5}
            />
        ),
        title: "Already Used",
        desc: "This code was already redeemed.",
        accent: "[color:hsl(var(--warning))]",
        bg: "[background-color:hsl(var(--warning)/0.08)]",
        border: "[border-color:hsl(var(--warning)/0.2)]",
    },
    not_found: {
        icon: (
            <XCircle
                className="h-10 w-10 [color:hsl(var(--destructive))]"
                strokeWidth={1.5}
            />
        ),
        title: "Invalid Code",
        desc: "No reward found for this code.",
        accent: "[color:hsl(var(--destructive))]",
        bg: "[background-color:hsl(var(--destructive)/0.08)]",
        border: "[border-color:hsl(var(--destructive)/0.2)]",
    },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type, className }: { type: string; className?: string }) {
    const typeConfig: Record<
        string,
        { label: string; color: string; bg: string }
    > = {
        GENERAL: {
            label: "General",
            color: "[color:hsl(var(--primary))]",
            bg: "[background-color:hsl(var(--primary)/0.1)]",
        },
        LANDMARK: {
            label: "Landmark",
            color: "[color:hsl(var(--secondary))]",
            bg: "[background-color:hsl(var(--secondary)/0.1)]",
        },
        EVENT: {
            label: "Event",
            color: "[color:hsl(var(--accent))]",
            bg: "[background-color:hsl(var(--accent)/0.1)]",
        },
    };

    const config = typeConfig[type] ?? typeConfig.GENERAL;
    return (
        <span
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.color} ${className}`}
        >
            {config.label}
        </span>
    );
}

function LocationGroupCard({ location }: { location: LocationGroup }) {
    return (
        <div className="space-y-3 rounded-2xl border p-4 [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.3)]">
            {/* Header with Type Badge */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                    <h4 className="mb-1 text-sm font-bold [color:hsl(var(--foreground))]">
                        {location.title}
                    </h4>
                    <TypeBadge type={location.type} />
                </div>
            </div>

            {/* Image if available */}
            {location.image && (
                <div className="relative h-32 w-full overflow-hidden rounded-lg border [background-color:hsl(var(--card))] [border-color:hsl(var(--border)/0.2)]">
                    <Image
                        src={location.image}
                        alt={location.title}
                        fill
                        className="object-cover"
                    />
                </div>
            )}

            {/* Description */}
            {location.description && (
                <p className="line-clamp-2 text-xs [color:hsl(var(--muted-foreground))]">
                    {location.description}
                </p>
            )}

            {/* Dates */}
            <div className="flex items-center gap-3 text-xs [color:hsl(var(--muted-foreground))]">
                <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                        {new Date(location.startDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                        })}
                    </span>
                </div>
                <span>-</span>
                <div className="flex items-center gap-1.5">
                    <span>
                        {new Date(location.endDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                        })}
                    </span>
                </div>
            </div>

            {/* Link if available */}
            {location.link && (
                <a
                    href={location.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs underline [color:hsl(var(--primary))] hover:[color:hsl(var(--primary))]"
                >
                    View Details →
                </a>
            )}
        </div>
    );
}

function HistoryDetailModal({
    item,
    isOpen,
    onClose,
}: {
    item: HistoryItem | null;
    isOpen: boolean;
    onClose: () => void;
}) {
    if (!item) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-40 backdrop-blur-sm [background-color:hsl(0_0%_0%/0.4)]"
                    />
                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-50 flex items-center justify-center px-4"
                    >
                        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border shadow-xl [background-color:hsl(var(--card))] [border-color:hsl(var(--border)/0.2)]">
                            {/* Header */}
                            <div className="sticky top-0 flex items-center justify-between border-b px-6 py-4 [background-color:hsl(var(--card))] [border-color:hsl(var(--border)/0.1)]">
                                <h2 className="text-sm font-bold [color:hsl(var(--foreground))]">
                                    Redemption Details
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="[color:hsl(var(--muted-foreground))] hover:[color:hsl(var(--foreground))]"
                                >
                                    {" "}
                                    <X className="h-4 w-4" />
                                </button>{" "}
                            </div>{" "}
                            {/* Content */}{" "}
                            <div className="space-y-4 p-6">
                                {" "}
                                {/* Redemption Code */}{" "}
                                <div>
                                    {" "}
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
                                        Code
                                    </p>{" "}
                                    <div className="rounded-lg border px-3 py-2 font-mono text-sm font-bold tracking-widest [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.2)] [color:hsl(var(--foreground))]">
                                        {" "}
                                        {item.redeemCode}{" "}
                                    </div>{" "}
                                </div>{" "}
                                {/* User Info */}{" "}
                                <div>
                                    {" "}
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
                                        User
                                    </p>{" "}
                                    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.2)]">
                                        {" "}
                                        <Avatar className="h-8 w-8 border [border-color:hsl(var(--border)/0.6)]">
                                            {" "}
                                            <AvatarImage src={item.user.image ?? ""} />{" "}
                                            <AvatarFallback className="text-xs font-bold [background-color:hsl(var(--card))]">
                                                {" "}
                                                {item.user.name?.[0]?.toUpperCase() ?? "?"}{" "}
                                            </AvatarFallback>{" "}
                                        </Avatar>{" "}
                                        <div className="min-w-0 flex-1">
                                            {" "}
                                            <p className="text-xs font-semibold [color:hsl(var(--foreground))]">
                                                {item.user.name ?? "Unknown"}
                                            </p>{" "}
                                            <p className="truncate text-xs [color:hsl(var(--muted-foreground))]">
                                                {item.user.email}
                                            </p>{" "}
                                        </div>{" "}
                                    </div>{" "}
                                </div>{" "}
                                {/* Location Group */}{" "}
                                <div>
                                    {" "}
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
                                        Location Group
                                    </p>{" "}
                                    <LocationGroupCard location={item.location} />{" "}
                                </div>{" "}
                                {/* Location Coordinates */}{" "}
                                <div>
                                    {" "}
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
                                        Coordinates
                                    </p>{" "}
                                    <div className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.2)] [color:hsl(var(--foreground))]">
                                        {" "}
                                        <MapPin className="h-3.5 w-3.5 [color:hsl(var(--primary))]" />{" "}
                                        <span className="font-mono">
                                            {item.locationData.latitude.toFixed(4)},{" "}
                                            {item.locationData.longitude.toFixed(4)}
                                        </span>{" "}
                                    </div>{" "}
                                </div>{" "}
                                {/* Redeemed At */}{" "}
                                <div>
                                    {" "}
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
                                        Redeemed On
                                    </p>{" "}
                                    <div className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.2)] [color:hsl(var(--foreground))]">
                                        {" "}
                                        <Clock className="h-3.5 w-3.5" />{" "}
                                        {item.redeemedAt
                                            ? new Date(item.redeemedAt).toLocaleString()
                                            : "—"}{" "}
                                    </div>{" "}
                                </div>{" "}
                            </div>{" "}
                        </div>{" "}
                    </motion.div>{" "}
                </>
            )}{" "}
        </AnimatePresence>
    );
}

function UserLocationCard({
    user,
    location,
    extra,
}: {
    user: { name?: string | null; image?: string | null; email?: string | null };
    location: {
        title?: string | null;
        brand_name?: string | null;
        image_url?: string | null;
    };
    extra?: React.ReactNode;
}) {
    return (
        <div className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.5)]">
            <Avatar className="h-10 w-10 flex-shrink-0 border [border-color:hsl(var(--border)/0.6)]">
                <AvatarImage src={user.image ?? ""} />
                <AvatarFallback className="bg-slate-700 text-sm font-bold text-white">
                    {user.name?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold [color:hsl(var(--foreground))]">
                    {user.name ?? "Unknown"}
                </p>
                <p className="truncate text-xs [color:hsl(var(--muted-foreground))]">
                    {location.title ?? location.brand_name ?? "—"}
                </p>
            </div>
            {extra}
        </div>
    );
}

// ─── Tab: Redeem ───────────────────────────────────────────────────────────────

function RedeemTab() {
    const [code, setCode] = useState("");
    const [previewLocation, setPreviewLocation] = useState<LocationGroup | null>(
        null,
    );
    const redeemMutation = api.maps.pin.redeemByCode.useMutation();

    const status: RedeemStatus | null = redeemMutation.isSuccess
        ? (redeemMutation.data.status as RedeemStatus)
        : redeemMutation.isError
            ? "not_found"
            : null;

    const result = redeemMutation.isSuccess ? redeemMutation.data : null;
    const cfg = status ? STATUS_UI[status] : null;

    const handleSubmit = () => {
        const clean = code.trim().toUpperCase();
        if (clean.length !== 6) return;
        redeemMutation.mutate({ code: clean });
    };

    const handleReset = () => {
        setCode("");
        setPreviewLocation(null);
        redeemMutation.reset();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 6);
        setCode(val);
    };

    const isReady = code.trim().length === 6;

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
                            <label className="text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
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
                    h-16 rounded-2xl text-center font-mono text-3xl font-black
                    tracking-[0.35em] transition-all duration-200 [background-color:hsl(var(--input)/0.6)]
                    [border-color:hsl(var(--border)/0.15)] [color:hsl(var(--foreground))] placeholder:[color:hsl(var(--muted-foreground))]
                    focus-visible:ring-0 focus-visible:[border-color:hsl(var(--success)/0.6)]
                  "
                                />
                                {/* Character count dots */}
                                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`h-1.5 w-1.5 rounded-full transition-all duration-150 ${i < code.length
                                                ? "[background-color:hsl(var(--success))]"
                                                : "[background-color:hsl(var(--border)/0.15)]"
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
                h-12 w-full rounded-2xl text-sm font-bold transition-all duration-200
                ${isReady
                                    ? "shadow-lg [background-color:hsl(var(--primary))] [box-shadow:0_0_20px_hsl(var(--success))] [color:hsl(var(--foreground))] hover:[background-color:hsl(var(--primary))]"
                                    : "cursor-not-allowed [background-color:hsl(var(--muted))] [color:hsl(var(--muted-foreground))]"
                                }
              `}
                        >
                            {redeemMutation.isLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 [border-color:hsl(var(--foreground)/0.3)] [border-top-color:hsl(var(--foreground))]" />
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
                        className={`rounded-3xl border ${cfg.bg} ${cfg.border} space-y-4 p-6`}
                    >
                        {/* Status header */}
                        <div className="flex items-center gap-3">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 320,
                                    damping: 16,
                                    delay: 0.06,
                                }}
                            >
                                {cfg.icon}
                            </motion.div>
                            <div>
                                <h3 className={`text-xl font-black ${cfg.accent}`}>
                                    {cfg.title}
                                </h3>
                                <p className="text-sm [color:hsl(var(--muted-foreground))]">
                                    {cfg.desc}
                                </p>
                            </div>
                        </div>

                        {/* User + location card */}
                        {result &&
                            "user" in result &&
                            result.user &&
                            "location" in result &&
                            result.location && (
                                <LocationGroupCard
                                    location={result.location as LocationGroup}
                                />
                            )}

                        {/* User info */}
                        {result && "user" in result && result.user && (
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-widest [color:hsl(var(--muted-foreground))]">
                                    Redeemed By
                                </p>
                                <div className="flex items-center gap-3 rounded-2xl border px-4 py-3 [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.5)]">
                                    <Avatar className="h-10 w-10 flex-shrink-0 border [border-color:hsl(var(--border)/0.6)]">
                                        <AvatarImage src={result.user.image ?? ""} />
                                        <AvatarFallback className="bg-slate-700 text-sm font-bold text-white">
                                            {result.user.name?.[0]?.toUpperCase() ?? "?"}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold [color:hsl(var(--foreground))]">
                                            {result.user.name ?? "Unknown"}
                                        </p>
                                        <p className="truncate text-xs [color:hsl(var(--muted-foreground))]">
                                            {result.user.email}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Code used */}
                        <div className="flex items-center justify-between rounded-xl px-4 py-2.5 [background-color:hsl(var(--card)/0.4)]">
                            <span className="text-xs [color:hsl(var(--muted-foreground))]">
                                Code used
                            </span>
                            <span className="font-mono text-sm font-bold tracking-widest [color:hsl(var(--foreground)/0.8)]">
                                {code}
                            </span>
                        </div>

                        <Button
                            onClick={handleReset}
                            variant="ghost"
                            className="h-10 w-full rounded-xl text-sm [color:hsl(var(--muted-foreground))] hover:[background-color:hsl(var(--card)/0.8)] hover:[color:hsl(var(--foreground))]"
                        >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            Redeem another
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Tab: History ──────────────────────────────────────────────────────────────

function HistoryTab() {
    const [search, setSearch] = useState("");
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const { data, isLoading } = api.maps.pin.getRedeemedByCreator.useQuery();

    const filtered = (data ?? []).filter((item) => {
        const q = search.toLowerCase();
        return (
            item.user?.name?.toLowerCase().includes(q) ??
            item.location?.title?.toLowerCase().includes(q) ??
            item.redeemCode?.toLowerCase().includes(q)
        );
    });

    const handleSelectItem = (
        item: HistoryItem
    ) => {
        if (!item) return;
        setSelectedItem({
            id: item.id,
            redeemCode: item.redeemCode,
            redeemedAt: item.redeemedAt,
            user: item.user,
            location: item.location,
            locationData: item.locationData,
        });
        setIsDetailOpen(true);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 [border-color:hsl(var(--border)/0.15)] [border-top-color:hsl(var(--foreground)/0.6)]" />
                <p className="text-sm [color:hsl(var(--muted-foreground))]">
                    Loading history…
                </p>
            </div>
        );
    }

    if (!data?.length) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.6)]">
                    <Users className="h-6 w-6 [color:hsl(var(--muted-foreground))]" />
                </div>
                <p className="text-sm font-medium [color:hsl(var(--foreground))]">
                    No redemptions yet
                </p>
                <p className="max-w-[200px] text-xs [color:hsl(var(--muted-foreground))]">
                    Redeemed rewards from your pins will appear here.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 [color:hsl(var(--muted-foreground))]" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, pin or code…"
                        className="h-10 rounded-xl pl-10 text-sm [background-color:hsl(var(--card)/0.5)] [border-color:hsl(var(--border)/0.15)] [color:hsl(var(--foreground))] placeholder:[color:hsl(var(--muted-foreground))] focus-visible:ring-0 focus-visible:[border-color:hsl(var(--border)/0.2)]"
                    />
                </div>

                {/* Count */}
                <div className="flex items-center justify-between">
                    <p className="text-xs [color:hsl(var(--muted-foreground))]">
                        {filtered.length} redemption{filtered.length !== 1 ? "s" : ""}
                    </p>
                </div>

                {/* List */}
                <div className="space-y-2">
                    {filtered.map((item, i) => (
                        <motion.button
                            key={item.id}
                            onClick={() => handleSelectItem(item)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors [background-color:hsl(var(--card)/0.4)] [border-color:hsl(var(--border)/0.15)] hover:[background-color:hsl(var(--card)/0.7)]"
                        >
                            <Avatar className="h-9 w-9 flex-shrink-0 border [border-color:hsl(var(--border)/0.6)]">
                                <AvatarImage src={item.user?.image ?? ""} />
                                <AvatarFallback className="text-xs font-bold [background-color:hsl(var(--card))] [color:hsl(var(--foreground))]">
                                    {item.user?.name?.[0]?.toUpperCase() ?? "?"}
                                </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold [color:hsl(var(--foreground))]">
                                    {item.user?.name ?? "Unknown user"}
                                </p>
                                <p className="truncate text-xs [color:hsl(var(--muted-foreground))]">
                                    {item.location?.title ?? "—"}
                                </p>
                            </div>

                            <div className="flex flex-shrink-0 flex-col items-end gap-1">
                                <span className="font-mono text-xs font-bold tracking-widest [color:hsl(var(--foreground)/0.8)]">
                                    {item.redeemCode}
                                </span>
                                <span className="flex items-center gap-1 text-xs [color:hsl(var(--muted-foreground))]">
                                    <Clock className="h-3 w-3" />
                                    {item.redeemedAt
                                        ? new Date(item.redeemedAt).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                        })
                                        : "—"}
                                </span>
                            </div>
                        </motion.button>
                    ))}

                    {filtered.length === 0 && search && (
                        <p className="py-8 text-center text-sm [color:hsl(var(--muted-foreground))]">
                            No results for {search}
                        </p>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            <HistoryDetailModal
                item={selectedItem}
                isOpen={isDetailOpen}
                onClose={() => {
                    setIsDetailOpen(false);
                    setSelectedItem(null);
                }}
            />
        </>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

const RedeemPage = () => {
    const router = useRouter();
    const [tab, setTab] = useState<"redeem" | "history">("redeem");

    return (
        <div className="min-h-screen [background-color:hsl(var(--background))] [color:hsl(var(--foreground))]">
            {/* Subtle background texture */}
            <div className="pointer-events-none fixed inset-0 [background-image:radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--success)/0.06),transparent)]" />

            {/* Header */}

            <div className="mx-auto max-w-md px-5 pb-12">
                {/* Tabs */}
                <motion.div
                    className="my-6 flex gap-1 rounded-2xl border p-1 [background-color:hsl(var(--primary)/0.4)] [border-color:hsl(var(--border)/0.15)]"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                >
                    {(["redeem", "history"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`
                flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200
                ${tab === t
                                    ? "shadow-sm [background-color:hsl(var(--card)/0.6)] [color:hsl(var(--foreground))] "
                                    : "[color:hsl(var(--muted-foreground))] hover:[color:hsl(var(--foreground)/0.8)]"
                                }
              `}
                        >
                            {t === "redeem" ? (
                                <>
                                    <Ticket className="h-4 w-4" />
                                    Redeem
                                </>
                            ) : (
                                <>
                                    <Users className="h-4 w-4" />
                                    History
                                </>
                            )}
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
    );
};

export default RedeemPage;
