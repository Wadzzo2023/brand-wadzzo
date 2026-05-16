"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AgentBlockDisplay.tsx
// All management blocks + pin-drop blocks in one file.
// New in this version:
//   - PinListBlock: pagination + "Load more" button
//   - ReportBlock: __REPORT__ magic string renderer
//   - CollectorReportBlock: __COLLECTOR_REPORT__ magic string renderer
//   - InfoBlock: wires all magic strings including new ones
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Pencil, Trash2, ChevronDown, ChevronUp,
    CheckCircle2, MapPin, ChevronRight, Minus, X, Send, Loader2,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { Switch } from "~/components/shadcn/ui/switch";
import { Label } from "~/components/shadcn/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/shadcn/ui/radio-group";
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription,
} from "~/components/shadcn/ui/dialog";
import {
    Popover, PopoverContent, PopoverTrigger,
} from "~/components/shadcn/ui/popover";
import { Calendar } from "~/components/shadcn/ui/calendar";
import {
    type ListResponse, type ConfirmResponse, type SuccessResponse,
    type InfoResponse, type PinListData, type AnalyticsData,
    type CollectorsData, type ReportData, type CollectorReportData,
    type LocalChatMessage, type PinOptions, type PaginationMeta,
    STAGE_LABEL, AgentResponse, Pin, PinIntent, AgentMode,
    GroupingMode, ResultsResponse, AgentStage, QuestionResponse,
} from "~/lib/agent/types";
import Image from "next/image";
import { api } from "~/utils/api";

// ─── Local types ──────────────────────────────────────────────────────────────

interface PinDrop {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    claimed: number;
    redeemed: number;
    remaining: number;
    latitude?: number | null;
    longitude?: number | null;
    radius?: number | null;
    description?: string | null;
    image?: string | null;
    link?: string | null;
    multiPin?: boolean;
    hidden?: boolean;
    hotspotId?: string | null;
    locations?: PinLocation[];
}

interface PinLocation {
    id: string;
    latitude: number;
    longitude: number;
    autoCollect: boolean;
    hidden: boolean;
}

interface EditFields {
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
}

interface LocationEditFields {
    latitude?: number;
    longitude?: number;
    autoCollect?: boolean;
    hidden?: boolean;
}

type HotspotScope = "this" | "future" | "all";

const SUGGESTIONS = [
    "Drop 100 KFC pins in the US",
    "100 restaurants in Geneseo Area",
    "Music events worldwide",
    "Drop pins around hospitals in Tokyo",
    "Show me my pins",
    "How are my pins performing?",
    "Generate a report for my pins",
    "Show collection report",
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
    });
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
    });
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
        expired: { label: "Expired", cls: "bg-muted text-muted-foreground border-border" },
        fully_claimed: { label: "Fully Claimed", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
        collection_disabled: { label: "Collection Off", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
    };
    const { label, cls } = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
    return (
        <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border flex-shrink-0", cls)}>
            {label}
        </span>
    );
}

function Stat({ label, value, dim = false }: { label: string; value: number; dim?: boolean }) {
    return (
        <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{label}:</span>
            <span className={cn("text-[11px] font-bold tabular-nums", dim ? "text-muted-foreground" : "text-foreground")}>
                {value}
            </span>
        </div>
    );
}

function SectionHeader({ label, count, icon }: { label: string; count?: number; icon?: string }) {
    return (
        <div className="flex items-center gap-1.5">
            {icon && <span className="text-sm">{icon}</span>}
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
            {count != null && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground font-semibold">
                    {count}
                </span>
            )}
        </div>
    );
}

function ModeBadge({ mode }: { mode?: AgentMode }) {
    if (!mode) return null;
    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mb-1",
            mode === "management"
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        )}>
            {mode === "management" ? "📋 Managing pins" : "🌍 Searching locations"}
        </span>
    );
}

function TypingDots({ label }: { label?: string }) {
    return (
        <div className="flex items-center gap-2 py-0.5">
            <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
            </div>
            {label && <span className="text-xs text-muted-foreground">{label}</span>}
        </div>
    );
}

// ─── PaginationFooter ─────────────────────────────────────────────────────────
// Reusable pagination footer used by PinListBlock, ReportBlock, CollectorReportBlock

function PaginationFooter({
    pagination,
    onLoadMore,
    isLoadingMore,
    entityLabel = "items",
}: {
    pagination: PaginationMeta;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
    entityLabel?: string;
}) {
    if (!pagination) return null;
    const remaining = pagination.total - pagination.offset - pagination.limit;

    return (
        <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-[11px] text-muted-foreground">
                Showing {pagination.showing}
            </p>
            {pagination.hasMore && onLoadMore && (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoadingMore}
                    onClick={() => onLoadMore(pagination.nextOffset!)}
                    className="w-full h-9 text-xs font-semibold gap-2 border-primary/30 text-primary hover:bg-primary/10"
                >
                    {isLoadingMore ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                    ) : (
                        <>Load more ({remaining} remaining) <ChevronDown className="w-3.5 h-3.5" /></>
                    )}
                </Button>
            )}
            {!pagination.hasMore && pagination.total > pagination.limit && (
                <p className="text-[11px] text-muted-foreground italic">
                    All {pagination.total} {entityLabel} loaded
                </p>
            )}
        </div>
    );
}

// ─── DatePickerField ──────────────────────────────────────────────────────────

function DatePickerField({ label, value, onChange }: {
    label: string; value: string | undefined; onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const date = value ? new Date(value) : undefined;
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground font-medium">{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left text-xs font-normal h-9", !date && "text-muted-foreground")}>
                        {date ? fmt(date.toISOString()) : "Pick a date"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date}
                        onSelect={(d) => { if (d) { onChange(d.toISOString()); setOpen(false); } }}
                        initialFocus />
                </PopoverContent>
            </Popover>
        </div>
    );
}

// ─── EditForm ─────────────────────────────────────────────────────────────────

function EditForm({ pin, onSubmit, onCancel, isSubmitting }: {
    pin: PinDrop;
    onSubmit: (fields: EditFields, scope: HotspotScope, locationEdits: Record<string, LocationEditFields>) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}) {
    const isHotspotLinked = !!pin.hotspotId;
    const [title, setTitle] = useState(pin.title ?? "");
    const [description, setDescription] = useState(pin.description ?? "");
    const [startDate, setStartDate] = useState<string | undefined>(pin.startDate ?? undefined);
    const [endDate, setEndDate] = useState<string | undefined>(pin.endDate ?? undefined);
    const [latitude, setLatitude] = useState(pin.latitude?.toString() ?? "");
    const [longitude, setLongitude] = useState(pin.longitude?.toString() ?? "");
    const [radius, setRadius] = useState(pin.radius?.toString() ?? "");
    const [image, setImage] = useState(pin.image ?? "");
    const [link, setLink] = useState(pin.link ?? "");
    const [multiPin, setMultiPin] = useState(pin.multiPin ?? false);
    const [hidden, setHidden] = useState(pin.hidden ?? false);
    const [scope, setScope] = useState<HotspotScope>("this");
    const [locationsExpanded, setLocationsExpanded] = useState(false);
    const [locationEdits, setLocationEdits] = useState<Record<string, LocationEditFields>>({});

    const updateLocationField = (locId: string, field: keyof LocationEditFields, value: unknown) => {
        setLocationEdits(prev => ({ ...prev, [locId]: { ...prev[locId], [field]: value } }));
    };

    const handleSubmit = () => {
        const fields: EditFields = {};
        if (title !== pin.title) fields.title = title;
        if (description !== (pin.description ?? "")) fields.description = description;
        if (startDate !== (pin.startDate ?? undefined)) fields.startDate = startDate;
        if (endDate !== (pin.endDate ?? undefined)) fields.endDate = endDate;
        if (latitude && parseFloat(latitude) !== pin.latitude) fields.latitude = parseFloat(latitude);
        if (longitude && parseFloat(longitude) !== pin.longitude) fields.longitude = parseFloat(longitude);
        if (radius && parseFloat(radius) !== pin.radius) fields.radius = parseFloat(radius);
        if (image !== (pin.image ?? "")) fields.image = image;
        if (link !== (pin.link ?? "")) fields.link = link;
        if (multiPin !== pin.multiPin) fields.multiPin = multiPin;
        if (hidden !== pin.hidden) fields.hidden = hidden;
        onSubmit(fields, scope, locationEdits);
    };

    return (
        <div className="flex flex-col gap-4">
            {isHotspotLinked && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-3 flex flex-col gap-2">
                    <p className="text-[11px] font-semibold text-blue-400">This pin is hotspot-linked. Apply changes to:</p>
                    <RadioGroup value={scope} onValueChange={(v) => setScope(v as HotspotScope)} className="flex flex-col gap-1.5">
                        {[
                            { value: "this", label: "This drop only" },
                            { value: "future", label: "All future drops" },
                            { value: "all", label: "All drops (this + future)" },
                        ].map((opt) => (
                            <Label key={opt.value} htmlFor={`scope-${opt.value}`} className={cn(
                                "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all",
                                scope === opt.value ? "border-blue-500/50 bg-blue-500/10" : "border-border bg-muted/30 hover:bg-muted/50"
                            )}>
                                <RadioGroupItem id={`scope-${opt.value}`} value={opt.value} />
                                <span className={cn("text-[12px] font-medium", scope === opt.value ? "text-blue-400" : "text-foreground")}>
                                    {opt.label}
                                </span>
                            </Label>
                        ))}
                    </RadioGroup>
                </div>
            )}
            <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] text-muted-foreground font-medium">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" placeholder="Pin title" />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] text-muted-foreground font-medium">Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm min-h-[72px] resize-none" placeholder="Pin description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <DatePickerField label="Start Date" value={startDate} onChange={setStartDate} />
                <DatePickerField label="End Date" value={endDate} onChange={setEndDate} />
            </div>
            {(!pin.locations || pin.locations.length === 0) ? (
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[11px] text-muted-foreground font-medium">Latitude</Label>
                        <Input type="number" value={latitude} onChange={(e) => setLatitude(e.target.value)} className="h-9 text-sm font-mono" placeholder="23.8103" step="0.00001" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[11px] text-muted-foreground font-medium">Longitude</Label>
                        <Input type="number" value={longitude} onChange={(e) => setLongitude(e.target.value)} className="h-9 text-sm font-mono" placeholder="90.4125" step="0.00001" />
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 flex flex-col gap-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">📍 Center Point</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                            <Label className="text-[10px] text-muted-foreground">Latitude</Label>
                            <div className="h-9 flex items-center rounded border border-border bg-background px-3 font-mono text-xs text-foreground">{latitude || "—"}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[10px] text-muted-foreground">Longitude</Label>
                            <div className="h-9 flex items-center rounded border border-border bg-background px-3 font-mono text-xs text-foreground">{longitude || "—"}</div>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">Edit individual location coordinates below</p>
                </div>
            )}
            {(!pin.locations || pin.locations.length === 0) && (
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] text-muted-foreground font-medium">Radius (meters)</Label>
                    <Input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} className="h-9 text-sm font-mono" placeholder="500" step={10} />
                </div>
            )}
            <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] text-muted-foreground font-medium">Image URL</Label>
                <Input value={image} onChange={(e) => setImage(e.target.value)} className="h-9 text-sm" placeholder="https://..." />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] text-muted-foreground font-medium">Link</Label>
                <Input value={link} onChange={(e) => setLink(e.target.value)} className="h-9 text-sm" placeholder="https://..." />
            </div>
            <div className="flex flex-col gap-2">
                <div className={cn("flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors", multiPin ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30")}>
                    <div className="flex flex-col gap-0.5">
                        <Label htmlFor="multiPin-toggle" className="text-[12px] font-medium text-foreground cursor-pointer">Multi Pin</Label>
                        <p className="text-[11px] text-muted-foreground">Allow multiple collections</p>
                    </div>
                    <Switch id="multiPin-toggle" checked={multiPin} onCheckedChange={setMultiPin} />
                </div>
                <div className={cn("flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors", hidden ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/30")}>
                    <div className="flex flex-col gap-0.5">
                        <Label htmlFor="hidden-toggle" className="text-[12px] font-medium text-foreground cursor-pointer">Hide Pin</Label>
                        <p className="text-[11px] text-muted-foreground">Hide from the map</p>
                    </div>
                    <Switch id="hidden-toggle" checked={hidden} onCheckedChange={setHidden} />
                </div>
            </div>
            {pin.locations && pin.locations.length > 0 && (
                <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm" onClick={() => setLocationsExpanded(!locationsExpanded)}
                        className="w-full flex items-center justify-between text-xs font-semibold">
                        <span>📍 Expand Locations ({pin.locations.length})</span>
                        {locationsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    {locationsExpanded && (
                        <div className="flex flex-col gap-3 pl-1 border-l-2 border-primary/20 ml-1">
                            {pin.locations.map((loc, i) => {
                                const edits = locationEdits[loc.id] ?? {};
                                const lat = edits.latitude?.toString() ?? loc.latitude.toString();
                                const lng = edits.longitude?.toString() ?? loc.longitude.toString();
                                const autoCollect = edits.autoCollect ?? loc.autoCollect;
                                const locHidden = edits.hidden ?? loc.hidden;
                                return (
                                    <div key={loc.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/20 p-3">
                                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Location {i + 1}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex flex-col gap-1">
                                                <Label className="text-[10px] text-muted-foreground">Latitude</Label>
                                                <Input type="number" value={lat} step="0.00001"
                                                    onChange={(e) => updateLocationField(loc.id, "latitude", parseFloat(e.target.value))}
                                                    className="h-8 text-xs font-mono" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label className="text-[10px] text-muted-foreground">Longitude</Label>
                                                <Input type="number" value={lng} step="0.00001"
                                                    onChange={(e) => updateLocationField(loc.id, "longitude", parseFloat(e.target.value))}
                                                    className="h-8 text-xs font-mono" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={cn("flex items-center justify-between flex-1 px-2.5 py-2 rounded-lg border transition-colors", autoCollect ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30")}>
                                                <Label htmlFor={`auto-${loc.id}`} className="text-[11px] font-medium text-foreground cursor-pointer">Auto Collect</Label>
                                                <Switch id={`auto-${loc.id}`} checked={autoCollect} onCheckedChange={(v) => updateLocationField(loc.id, "autoCollect", v)} />
                                            </div>
                                            <div className={cn("flex items-center justify-between flex-1 px-2.5 py-2 rounded-lg border transition-colors", locHidden ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/30")}>
                                                <Label htmlFor={`lhidden-${loc.id}`} className="text-[11px] font-medium text-foreground cursor-pointer">Hidden</Label>
                                                <Switch id={`lhidden-${loc.id}`} checked={locHidden} onCheckedChange={(v) => updateLocationField(loc.id, "hidden", v)} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            <div className="flex gap-2 pt-1 sticky bottom-0 bg-background pb-1">
                <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 h-10 text-sm font-bold">
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Update
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="px-5 h-10 text-sm">Cancel</Button>
            </div>
        </div>
    );
}

// ─── DeleteConfirmDialog ──────────────────────────────────────────────────────

function DeleteConfirmDialog({ targets, open, onConfirm, onCancel, isDeleting }: {
    targets: PinDrop[]; open: boolean;
    onConfirm: () => void; onCancel: () => void; isDeleting: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                        <span className="text-red-400">⚠️</span>
                        Delete {targets.length > 1 ? `${targets.length} Pins` : "Pin"}
                    </DialogTitle>
                    <DialogDescription className="text-[12px] text-muted-foreground">
                        This will hide the pin{targets.length > 1 ? "s" : ""} from the map. Collection data is preserved.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                    {targets.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-[12px] font-semibold text-foreground truncate">{t.title}</span>
                                <span className="text-[10px] text-muted-foreground">{fmt(t.startDate)} → {fmt(t.endDate)}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <DialogFooter className="flex gap-2">
                    <Button variant="destructive" onClick={onConfirm} disabled={isDeleting} className="flex-1 h-9 text-sm font-bold">
                        {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Confirm Delete
                    </Button>
                    <Button variant="outline" onClick={onCancel} disabled={isDeleting} className="px-4 h-9 text-sm">Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── PinRow ───────────────────────────────────────────────────────────────────

function PinRow({ pin, indent = false, onEdit, onDelete, isSelected, onToggleSelect, editingId }: {
    pin: PinDrop; indent?: boolean;
    onEdit: (pin: PinDrop) => void; onDelete: (pin: PinDrop) => void;
    isSelected: boolean; onToggleSelect: (id: string) => void; editingId: string | null;
}) {
    const isBeingEdited = editingId === pin.id;
    return (
        <div className={cn(
            "flex flex-col gap-0 rounded-xl border border-border bg-muted/30 overflow-hidden transition-all",
            indent && "ml-4 border-l-2 border-l-primary/20",
            isBeingEdited && "border-primary/40 bg-primary/5",
            isSelected && !isBeingEdited && "border-red-500/30 bg-red-500/5"
        )}>
            <div className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => onToggleSelect(pin.id)} className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        isSelected ? "bg-red-500 border-red-500" : "border-muted-foreground/40 bg-transparent hover:border-red-400"
                    )}>
                        {isSelected && (
                            <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 4l3 3 5-6" />
                            </svg>
                        )}
                    </button>
                    <p className="text-[12px] font-semibold text-foreground truncate flex-1">{pin.title}</p>
                    <StatusBadge status={pin.status} />
                </div>
                <p className="text-[11px] text-muted-foreground pl-6">{fmt(pin.startDate)} → {fmt(pin.endDate)}</p>
                <div className="flex items-center gap-3 flex-wrap pl-6">
                    <Stat label="Claimed" value={pin.claimed} />
                    <Stat label="Redeemed" value={pin.redeemed} />
                    <Stat label="Remaining" value={pin.remaining} dim={pin.remaining === 0} />
                </div>
                <div className="flex items-center gap-2 pl-6 pt-0.5">
                    <Button variant="outline" size="sm" onClick={() => onEdit(pin)} className={cn(
                        "h-7 px-3 text-[11px] font-semibold gap-1.5 transition-all",
                        isBeingEdited && "border-primary text-primary bg-primary/10"
                    )}>
                        <Pencil className="w-3 h-3" />
                        {isBeingEdited ? "Editing…" : "Edit"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onDelete(pin)}
                        className="h-7 px-3 text-[11px] font-semibold gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 transition-all">
                        <Trash2 className="w-3 h-3" />
                        Delete
                    </Button>
                    {pin.hotspotId && <span className="text-[10px] text-blue-400 ml-auto">🔁 hotspot</span>}
                </div>
            </div>
        </div>
    );
}

// ─── PinListBlock ─────────────────────────────────────────────────────────────

export function PinListBlock({ data, onEdit, onDelete, onLoadMore, isLoadingMore }: {
    data: PinListData;
    onEdit?: (ids: string[], fields: EditFields, scope?: HotspotScope, locationEdits?: Record<string, LocationEditFields>) => void;
    onDelete?: (ids: string[]) => void;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
}) {
    const [editingPin, setEditingPin] = useState<PinDrop | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
    const [deleteTargets, setDeleteTargets] = useState<PinDrop[]>([]);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const allPins: PinDrop[] = [
        ...(data.standalone ?? []).filter(p => p?.id) as PinDrop[],
        ...(data.hotspots ?? []).flatMap((hs) => (hs.drops ?? []).filter(p => p?.id)) as PinDrop[],
    ];

    const handleEdit = (pin: PinDrop) => setEditingPin((prev) => prev?.id === pin.id ? null : pin);

    const handleEditSubmit = async (fields: EditFields, scope: HotspotScope, locationEdits: Record<string, LocationEditFields>) => {
        if (!editingPin || !onEdit) return;
        setIsSubmitting(true);
        try { onEdit([editingPin.id], fields, scope, locationEdits); setEditingPin(null); }
        finally { setIsSubmitting(false); }
    };

    const handleDeleteClick = (pin: PinDrop) => {
        if (selectedForDelete.has(pin.id) && selectedForDelete.size > 1) {
            setDeleteTargets(allPins.filter(p => selectedForDelete.has(p.id)));
        } else { setDeleteTargets([pin]); }
        setShowDeleteDialog(true);
    };

    const handleDeleteConfirm = async () => {
        if (!onDelete) return;
        setIsDeleting(true);
        try { onDelete(deleteTargets.map(p => p.id)); setSelectedForDelete(new Set()); setShowDeleteDialog(false); }
        finally { setIsDeleting(false); }
    };

    const toggleSelect = (id: string) => {
        setSelectedForDelete(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    };

    const hasStandalone = (data.standalone?.length ?? 0) > 0;
    const hasHotspots = (data.hotspots?.length ?? 0) > 0;

    if (!hasStandalone && !hasHotspots) {
        return <p className="text-[13px] text-muted-foreground italic">No pins found.</p>;
    }

    const renderPin = (pin: PinDrop, indent = false) => (
        <div key={pin.id} className="flex flex-col gap-1.5">
            <PinRow pin={pin} indent={indent} onEdit={handleEdit} onDelete={handleDeleteClick}
                isSelected={selectedForDelete.has(pin.id)} onToggleSelect={toggleSelect} editingId={editingPin?.id ?? null} />
            {editingPin?.id === pin.id && (
                <div className="rounded-xl border border-primary/30 bg-background p-4 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[12px] font-bold text-foreground flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5 text-primary" />
                            Editing: {pin.title}
                        </p>
                        <button onClick={() => setEditingPin(null)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">✕ Close</button>
                    </div>
                    <EditForm pin={editingPin} onSubmit={handleEditSubmit} onCancel={() => setEditingPin(null)} isSubmitting={isSubmitting} />
                </div>
            )}
        </div>
    );

    return (
        <>
            <div className="flex flex-col gap-3">
                {selectedForDelete.size > 1 && (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
                        <span className="text-[12px] font-semibold text-red-400">{selectedForDelete.size} pins selected</span>
                        <Button variant="destructive" size="sm" className="h-7 px-3 text-[11px] font-bold gap-1.5"
                            onClick={() => { setDeleteTargets(allPins.filter(p => selectedForDelete.has(p.id))); setShowDeleteDialog(true); }}>
                            <Trash2 className="w-3 h-3" />
                            Delete Selected ({selectedForDelete.size})
                        </Button>
                    </div>
                )}
                {hasStandalone && (
                    <section className="flex flex-col gap-2">
                        <SectionHeader label="Standalone" count={data.standalone.length} icon="📍" />
                        <div className="flex flex-col gap-2">{(data.standalone as PinDrop[]).map((pin) => renderPin(pin, false))}</div>
                    </section>
                )}
                {hasHotspots && (
                    <section className="flex flex-col gap-2">
                        <SectionHeader label="Hotspots" count={data.hotspots.length} icon="🔁" />
                        <div className="flex flex-col gap-3">
                            {data.hotspots.map((hs, i) => (
                                <div key={i} className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 px-2">
                                        <span className="text-[11px] font-bold text-foreground">{hs.hotspotName}</span>
                                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold border",
                                            hs.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-muted text-muted-foreground border-border")}>
                                            {hs.isActive ? "active" : "paused"}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2">{(hs.drops as PinDrop[]).map((drop) => renderPin(drop, true))}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Pagination footer ── */}
                {data.pagination && (
                    <PaginationFooter
                        pagination={data.pagination}
                        onLoadMore={onLoadMore}
                        isLoadingMore={isLoadingMore}
                        entityLabel="pins"
                    />
                )}
            </div>
            <DeleteConfirmDialog targets={deleteTargets} open={showDeleteDialog}
                onConfirm={handleDeleteConfirm} onCancel={() => setShowDeleteDialog(false)} isDeleting={isDeleting} />
        </>
    );
}

// ─── AnalyticsBlock ───────────────────────────────────────────────────────────

export function AnalyticsBlock({ data }: { data: AnalyticsData }) {
    type PinRow = { title?: string; label?: string; claimed: number; redeemed: number; remaining: number; claimRate: string; };
    const rawPins = (data.perPin ?? (data as unknown as { performanceByPin?: PinRow[] }).performanceByPin ?? []) as PinRow[];
    const pins = rawPins.map((p) => ({ ...p, title: p.title ?? p.label ?? "Unnamed" }));
    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Total Claimed" value={data.totalClaimed} />
                <MetricCard label="Total Redeemed" value={data.totalRedeemed} />
                <MetricCard label="Claim Rate" value={data.claimRate} highlight />
                {data.redeemRate && <MetricCard label="Redeem Rate" value={data.redeemRate} highlight />}
            </div>
            {pins.length > 0 && (
                <section className="flex flex-col gap-1.5">
                    <SectionHeader label="Per Pin" icon="📊" />
                    <div className="flex flex-col gap-1.5">
                        {pins.map((p, i) => (
                            <div key={i} className="px-3 py-2.5 rounded-xl border border-border bg-muted/30 flex flex-col gap-1.5">
                                <p className="text-[12px] font-semibold text-foreground truncate">{p.title}</p>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Stat label="Claimed" value={p.claimed} />
                                    <Stat label="Redeemed" value={p.redeemed} />
                                    <Stat label="Remaining" value={p.remaining} dim={p.remaining === 0} />
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-muted-foreground">Claim rate:</span>
                                        <span className="text-[11px] font-bold text-primary">{p.claimRate}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {data.insights && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
                    <span className="text-base flex-shrink-0">💡</span>
                    <p className="text-[12px] text-primary leading-relaxed">{data.insights}</p>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, highlight = false }: { label: string; value: number | string; highlight?: boolean }) {
    return (
        <div className={cn("flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border",
            highlight ? "bg-primary/10 border-primary/25" : "bg-muted/30 border-border")}>
            <span className="text-[10px] text-muted-foreground">{label}</span>
            <span className={cn("text-base font-bold tabular-nums", highlight ? "text-primary" : "text-foreground")}>{value}</span>
        </div>
    );
}

// ─── CollectorsBlock ──────────────────────────────────────────────────────────

export function CollectorsBlock({ data }: { data: CollectorsData }) {
    return (
        <div className="flex flex-col gap-2">
            <SectionHeader label={`Collectors — ${data.pinTitle}`} icon="👥" />
            {data.collectors.length === 0 ? (
                <p className="text-[13px] text-muted-foreground italic px-1">No collectors yet.</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {data.collectors.map((c, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                                {c.name?.charAt(0)?.toUpperCase() ?? "?"}
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-foreground truncate">{c.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
                                <p className="text-[10px] text-muted-foreground">{fmt(c.claimedAt)}</p>
                            </div>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0",
                                c.isRedeemed ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-muted text-muted-foreground border-border")}>
                                {c.isRedeemed ? "Redeemed" : "Claimed"}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── ReportBlock ──────────────────────────────────────────────────────────────

export function ReportBlock({ data, onLoadMore, isLoadingMore }: {
    data: ReportData;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
}) {
    const [sortCol, setSortCol] = useState<"claimRate" | "claimed" | "redeemed" | "remaining">("claimRate");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const sorted = [...(data.perPin ?? [])].sort((a, b) => {
        const parse = (v: string | number) => typeof v === "string" ? parseFloat(v) : v;
        const av = parse(sortCol === "claimRate" ? a.claimRate : a[sortCol]);
        const bv = parse(sortCol === "claimRate" ? b.claimRate : b[sortCol]);
        return sortDir === "desc" ? bv - av : av - bv;
    });

    const toggleSort = (col: typeof sortCol) => {
        if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
        else { setSortCol(col); setSortDir("desc"); }
    };

    const SortIcon = ({ col }: { col: typeof sortCol }) => (
        <span className={cn("text-[10px] ml-0.5", sortCol === col ? "text-primary" : "text-muted-foreground/40")}>
            {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
        </span>
    );

    const { summary } = data;
    const statusBreakdown = [
        { label: "Active", count: summary.activePins, color: "bg-emerald-500" },
        { label: "Expired", count: summary.expiredPins, color: "bg-muted-foreground" },
        { label: "Fully Claimed", count: summary.fullyClaimedPins, color: "bg-amber-500" },
        {
            label: "Other",
            count: summary.totalPins - summary.activePins - summary.expiredPins - summary.fullyClaimedPins,
            color: "bg-red-400"
        },
    ].filter(s => s.count > 0);

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-base">📊</span>
                    <p className="text-[13px] font-bold text-foreground">Pin Report</p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    {new Date(data.generatedAt).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "2-digit", minute: "2-digit"
                    })}
                </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2">
                {[
                    { label: "Total Claimed", value: summary.totalClaimed, highlight: false },
                    { label: "Total Redeemed", value: summary.totalRedeemed, highlight: false },
                    { label: "Claim Rate", value: summary.claimRate, highlight: true },
                    { label: "Redeem Rate", value: summary.redeemRate, highlight: true },
                ].map(({ label, value, highlight }) => (
                    <div key={label} className={cn("flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border",
                        highlight ? "bg-primary/10 border-primary/25" : "bg-muted/30 border-border")}>
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                        <span className={cn("text-base font-bold tabular-nums", highlight ? "text-primary" : "text-foreground")}>{value}</span>
                    </div>
                ))}
            </div>

            {/* Pin status breakdown bar */}
            <div className="flex flex-col gap-2 px-3 py-3 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Pin Breakdown</p>
                    <p className="text-[11px] font-semibold text-foreground">{summary.totalPins} total</p>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {statusBreakdown.map(s => (
                        <div key={s.label} className={cn("h-full transition-all", s.color)}
                            style={{ width: `${(s.count / summary.totalPins) * 100}%` }} />
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {statusBreakdown.map(s => (
                        <div key={s.label} className="flex items-center gap-1.5">
                            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", s.color)} />
                            <span className="text-[10px] text-muted-foreground">
                                {s.label} <span className="font-semibold text-foreground">{s.count}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top performers */}
            {data.topPerformers?.length > 0 && (
                <div className="flex flex-col gap-2">
                    <SectionHeader label="Top Performers" icon="🏆" />
                    <div className="flex flex-col gap-1.5">
                        {data.topPerformers.map((p, i) => {
                            const pct = parseFloat(p.claimRate);
                            return (
                                <div key={p.id} className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("text-[11px] font-black w-5 flex-shrink-0 tabular-nums",
                                            i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-muted-foreground")}>
                                            #{i + 1}
                                        </span>
                                        <p className="text-[12px] font-semibold text-foreground truncate flex-1">{p.title}</p>
                                        <span className="text-[11px] font-bold text-primary flex-shrink-0">{p.claimRate}</span>
                                    </div>
                                    <div className="ml-7 flex flex-col gap-1">
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] text-muted-foreground">{p.claimed}/{p.limit} claimed</span>
                                            <span className="text-[10px] text-muted-foreground">{p.remaining} remaining</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Per-pin sortable table */}
            {sorted.length > 0 && (
                <div className="flex flex-col gap-2">
                    <SectionHeader label="All Pins" icon="📋" />
                    <div className="rounded-xl border border-border overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 bg-muted/60 border-b border-border px-3 py-2">
                            {[
                                { label: "Pin", col: null },
                                { label: "Claimed", col: "claimed" as const },
                                { label: "Redeemed", col: "redeemed" as const },
                                { label: "Left", col: "remaining" as const },
                                { label: "Rate", col: "claimRate" as const },
                            ].map(({ label, col }) => (
                                <button key={label} onClick={() => col && toggleSort(col)} disabled={!col}
                                    className={cn("text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-left",
                                        col && "hover:text-foreground transition-colors cursor-pointer",
                                        col === null && "cursor-default")}>
                                    {label}{col && <SortIcon col={col} />}
                                </button>
                            ))}
                        </div>
                        <div className="divide-y divide-border">
                            {sorted.map((p, i) => (
                                <div key={p.id} className={cn("grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-3 py-2.5 items-center",
                                    i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                                    <p className="text-[11px] font-semibold text-foreground truncate pr-2">{p.title}</p>
                                    <span className="text-[11px] tabular-nums text-foreground w-14 text-right">{p.claimed}</span>
                                    <span className="text-[11px] tabular-nums text-foreground w-16 text-right">{p.redeemed}</span>
                                    <span className={cn("text-[11px] tabular-nums w-10 text-right", p.remaining === 0 ? "text-amber-400" : "text-foreground")}>{p.remaining}</span>
                                    <span className="text-[11px] tabular-nums font-bold text-primary w-12 text-right">{p.claimRate}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pagination */}
                    {data.pagination && (
                        <PaginationFooter
                            pagination={data.pagination}
                            onLoadMore={onLoadMore}
                            isLoadingMore={isLoadingMore}
                            entityLabel="pins"
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// ─── CollectorReportBlock ─────────────────────────────────────────────────────

export function CollectorReportBlock({ data, onLoadMore, isLoadingMore }: {
    data: CollectorReportData;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
}) {
    // ── Single collector view ─────────────────────────────────────────────
    if (data.mode === "single_collector" && data.collector) {
        const { collector, collections = [] } = data;
        const redeemRate = collector.totalCollected > 0
            ? Math.round(collector.totalRedeemed / collector.totalCollected * 100) : 0;

        return (
            <div className="flex flex-col gap-3">
                {/* Collector profile card */}
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border bg-muted/30">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0 overflow-hidden">
                        {collector.image
                            ? <img src={collector.image} className="w-10 h-10 object-cover" alt={collector.name} />
                            : collector.name.charAt(0).toUpperCase()
                        }
                    </div>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-foreground truncate">{collector.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{collector.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className="text-[11px] font-bold text-primary">{collector.totalCollected} pins</span>
                        <span className="text-[10px] text-muted-foreground">{redeemRate}% redeemed</span>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                        <span className="text-[10px] text-muted-foreground">Total Collected</span>
                        <span className="text-base font-bold text-foreground tabular-nums">{collector.totalCollected}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border border-primary/25 bg-primary/10">
                        <span className="text-[10px] text-muted-foreground">Total Redeemed</span>
                        <span className="text-base font-bold text-primary tabular-nums">{collector.totalRedeemed}</span>
                    </div>
                </div>

                {/* Redeem rate bar */}
                <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Redeem Rate</span>
                        <span className="text-[11px] font-bold text-primary">{redeemRate}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${redeemRate}%` }} />
                    </div>
                </div>

                {/* Collections list */}
                {collections.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <SectionHeader label="Pins Collected" icon="📍" count={collections.length} />
                        <div className="flex flex-col gap-1.5">
                            {collections.map((c, i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                        <p className="text-[12px] font-semibold text-foreground truncate">{c.pinTitle}</p>
                                        <p className="text-[10px] text-muted-foreground">{fmt(c.pinStartDate)} → {fmt(c.pinEndDate)}</p>
                                        <p className="text-[10px] text-muted-foreground">Claimed {fmt(c.claimedAt)}</p>
                                    </div>
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0",
                                        c.isRedeemed ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-muted text-muted-foreground border-border")}>
                                        {c.isRedeemed ? "Redeemed" : "Claimed"}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {data.pagination && (
                            <PaginationFooter pagination={data.pagination} onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} entityLabel="collections" />
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ── All collectors view ───────────────────────────────────────────────
    const { collectors = [] } = data;
    return (
        <div className="flex flex-col gap-3">
            <SectionHeader label="All Collectors" icon="👥" count={data.pagination?.total} />
            {collectors.length === 0 ? (
                <p className="text-[13px] text-muted-foreground italic px-1">No collectors yet.</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {collectors.map((c, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 overflow-hidden">
                                {c.image
                                    ? <img src={c.image} className="w-8 h-8 object-cover" alt={c.name} />
                                    : c.name.charAt(0).toUpperCase()
                                }
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-foreground truncate">{c.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
                                {c.lastClaimedAt && (
                                    <p className="text-[10px] text-muted-foreground">Last active {fmt(c.lastClaimedAt)}</p>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                <span className="text-[11px] font-bold text-foreground tabular-nums">{c.collected} collected</span>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                                    c.redeemed > 0 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-muted text-muted-foreground border-border")}>
                                    {c.redeemed} redeemed
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {data.pagination && (
                <PaginationFooter pagination={data.pagination} onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} entityLabel="collectors" />
            )}
        </div>
    );
}

// ─── ListBlock ────────────────────────────────────────────────────────────────

export function ListBlock({ data, onConfirm, onDismiss }: {
    data: ListResponse; onConfirm: (selectedIds: string[]) => void; onDismiss: () => void;
}) {
    const [selected, setSelected] = useState<Set<string>>(() => new Set(data.items.map((i) => i.id)));
    const toggle = (id: string) => { setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
    const selectedCount = selected.size;
    const totalCount = data.items.length;
    const actionLabel: Record<string, string> = { edit: "Edit", delete: "Hide", pause: "Pause", resume: "Resume" };
    const actionColor: Record<string, string> = {
        edit: "bg-primary text-primary-foreground",
        delete: "bg-red-500 text-white",
        pause: "bg-amber-500 text-white",
        resume: "bg-emerald-500 text-white",
    };
    return (
        <div className="flex flex-col gap-2">
            <p className="text-[13px] text-foreground">{data.message}</p>
            <div className="flex flex-col gap-1.5">
                {data.items.map((item) => {
                    const isChecked = selected.has(item.id);
                    return (
                        <button key={item.id} onClick={() => toggle(item.id)} className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border transition-all duration-150 active:scale-[0.98]",
                            isChecked ? "bg-primary/10 border-primary/40" : "bg-muted/40 border-border opacity-50"
                        )}>
                            <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                                isChecked ? "bg-primary border-primary" : "border-muted-foreground bg-transparent")}>
                                {isChecked && (<svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 5-6" /></svg>)}
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <span className="text-[12px] font-semibold text-foreground truncate">{item.label}</span>
                                {item.sublabel && <span className="text-[10px] text-muted-foreground">{item.sublabel}</span>}
                                {item.hotspotId && <span className="text-[10px] text-blue-400">hotspot-linked</span>}
                            </div>
                        </button>
                    );
                })}
            </div>
            <div className="flex gap-2 mt-1">
                <button onClick={() => onConfirm(Array.from(selected))} disabled={selectedCount === 0}
                    className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                        actionColor[data.action] ?? "bg-primary text-primary-foreground")}>
                    {actionLabel[data.action] ?? "Confirm"} Selected ({selectedCount})
                </button>
                {selectedCount < totalCount && (
                    <button onClick={() => onConfirm(data.items.map((i) => i.id))}
                        className="px-3 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 bg-muted border border-border text-foreground hover:bg-muted/80">
                        {actionLabel[data.action] ?? "Confirm"} All ({totalCount})
                    </button>
                )}
                <button onClick={onDismiss} className="px-3 py-2.5 rounded-xl text-xs font-medium bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
        </div>
    );
}

// ─── QuestionBlock ────────────────────────────────────────────────────────────

function QuestionBlock({ data, onAnswer, answered = false, answeredValues }: {
    data: QuestionResponse; onAnswer: (answers: Record<string, string>) => void;
    answered?: boolean; answeredValues?: Record<string, string>;
}) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [customValues, setCustomValues] = useState<Record<string, string>>({});
    const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});
    const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
    const fields = data.fields;
    const currentField = fields[currentFieldIndex];

    if (answered && answeredValues) {
        return (
            <div className="mt-2 flex flex-col gap-1.5">
                {fields.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border/50 opacity-70">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-[12px] text-muted-foreground">{f.label}:</span>
                        <span className="text-[12px] font-semibold text-foreground truncate">{answeredValues[f.id] ?? "—"}</span>
                    </div>
                ))}
            </div>
        );
    }

    const handleChoice = (fieldId: string, value: string) => {
        const updated = { ...answers, [fieldId]: value };
        setAnswers(updated);
        const nextIndex = currentFieldIndex + 1;
        if (nextIndex < fields.length) { setCurrentFieldIndex(nextIndex); }
        else { onAnswer(updated); }
    };

    const handleCustomSubmit = (fieldId: string) => {
        const val = customValues[fieldId]?.trim();
        if (!val) return;
        handleChoice(fieldId, val);
    };

    if (!currentField) return null;
    const isMultipleChoice = currentField.inputType === "multiple_choice";
    const isShowingCustom = showCustom[currentField.id];

    return (
        <div className="mt-2 space-y-3">
            {fields.length > 1 && (
                <div className="flex items-center gap-1.5">
                    {fields.map((_, i) => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i < currentFieldIndex ? "bg-primary" : i === currentFieldIndex ? "bg-foreground" : "bg-muted"}`} />
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">{currentFieldIndex + 1}/{fields.length}</span>
                </div>
            )}
            <p className="text-[13px] font-semibold text-foreground">{currentField.label}</p>
            {isMultipleChoice && currentField.options && !isShowingCustom && (
                <div className="flex flex-col gap-1.5">
                    {currentField.options.map((opt, idx) => (
                        <button key={opt} onClick={() => handleChoice(currentField.id, opt)}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left bg-muted border border-border text-foreground text-[13px] hover:bg-primary/10 hover:border-primary/40 transition-all duration-150 active:scale-[0.98]">
                            <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground flex-shrink-0">{idx + 1}</span>
                            <span className="font-medium">{opt}</span>
                        </button>
                    ))}
                    <button onClick={() => setShowCustom((p) => ({ ...p, [currentField.id]: true }))}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left bg-transparent border border-dashed border-border text-muted-foreground text-[13px] hover:text-foreground hover:border-primary/50 transition-all duration-150">
                        <span className="w-6 h-6 rounded-full border border-border flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 1v10M1 6h10" /></svg>
                        </span>
                        <span>Something else…</span>
                    </button>
                </div>
            )}
            {(isShowingCustom ?? !isMultipleChoice) && (
                <div className="flex items-center gap-2">
                    <input autoFocus type={currentField.inputType === "number" ? "number" : "text"}
                        value={customValues[currentField.id] ?? ""}
                        onChange={(e) => setCustomValues((p) => ({ ...p, [currentField.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCustomSubmit(currentField.id); }}
                        placeholder={currentField.placeholder ?? "Type your answer…"}
                        className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-foreground text-sm placeholder-muted-foreground border border-border focus:border-primary focus:outline-none transition-colors" />
                    <button onClick={() => handleCustomSubmit(currentField.id)}
                        disabled={!customValues[currentField.id]?.trim()}
                        className="px-3 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-sm font-bold transition-colors flex-shrink-0">→</button>
                </div>
            )}
        </div>
    );
}

// ─── JobProgressBar ───────────────────────────────────────────────────────────

function JobProgressBar({ jobId, onComplete }: { jobId: string; onComplete: (count: number) => void; }) {
    const [done, setDone] = useState(false);
    const { data } = api.agent.jobStatus.useQuery({ jobId }, {
        enabled: !done,
        refetchInterval: (data) => {
            if (!data) return 1500;
            const s = (data as { status?: string })?.status;
            if (s === "completed" || s === "failed") return false;
            return 1500;
        },
    });
    useEffect(() => {
        if (!data) return;
        if (data.status === "completed" || data.status === "failed") { setDone(true); onComplete(data.completed ?? 0); }
    }, [data, onComplete]);
    const status = data?.status ?? "pending";
    const total = data?.total ?? 0;
    const completed = data?.completed ?? 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const isError = status === "failed";
    const isComplete = status === "completed";
    return (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{isComplete ? "Pins dropped!" : isError ? "Some pins failed" : "Dropping pins…"}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{completed}/{total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", isError ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
            </div>
            {isError && data?.error && <p className="text-[11px] text-red-400">{data.error}</p>}
            {(isComplete || isError) && data?.log && data.log.length > 0 && (
                <details className="mt-1">
                    <summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
                        View log ({data.log.filter((l) => l.status === "error").length} errors)
                    </summary>
                    <div className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                        {data.log.map((entry, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                <span className={entry.status === "ok" ? "text-emerald-500" : "text-red-400"}>{entry.status === "ok" ? "✓" : "✗"}</span>
                                <span className="text-foreground truncate">{entry.title}</span>
                                {entry.error && <span className="text-red-400 truncate">— {entry.error}</span>}
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

// ─── ResultsConfirmPanel ──────────────────────────────────────────────────────

function ResultsConfirmPanel({ pinCount, onConfirm, isLoading = false, detectedPinNumber = 1 }: {
    pinCount: number; onConfirm: (options: PinOptions) => void;
    isLoading?: boolean; detectedPinNumber?: number;
}) {
    const [autoCollect, setAutoCollect] = useState(false);
    const [groupingMode, setGroupingMode] = useState<GroupingMode>("per-location");
    const [pinNumber, setPinNumber] = useState(detectedPinNumber ?? 1);
    const [currentStep, setCurrentStep] = useState(0);
    useEffect(() => { setPinNumber(detectedPinNumber ?? 1); }, [detectedPinNumber]);
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === 1;
    const handleNext = () => {
        if (!isLastStep) setCurrentStep(currentStep + 1);
        else onConfirm({ autoCollect, groupingMode, pinNumber });
    };
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 max-w-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Configuration</p>
                <span className="text-[10px] text-muted-foreground font-medium">{currentStep + 1}/2</span>
            </div>
            {isFirstStep && (
                <section className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Location QR Code</p>
                    <RadioGroup value={groupingMode} onValueChange={(v) => setGroupingMode(v as GroupingMode)} className="flex flex-col gap-1.5">
                        {[
                            { value: "per-location", label: `${pinCount} QR codes`, desc: "Each pin has its own code" },
                            { value: "single-group", label: "1 QR code", desc: "All pins grouped together" },
                        ].map(opt => (
                            <Label key={opt.value} htmlFor={`group-${opt.value}`} className={cn(
                                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-all",
                                groupingMode === opt.value ? "border-primary/50 bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50")}>
                                <RadioGroupItem id={`group-${opt.value}`} value={opt.value} className="mt-0.5 shrink-0" />
                                <div className="flex flex-col gap-0.5 flex-1">
                                    <span className={cn("text-xs font-medium", groupingMode === opt.value ? "text-primary" : "text-foreground")}>{opt.label}</span>
                                    <span className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</span>
                                </div>
                            </Label>
                        ))}
                    </RadioGroup>
                </section>
            )}
            {!isFirstStep && (
                <section className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Auto Mode</p>
                    <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors", autoCollect ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30")}>
                        <div className="flex flex-col gap-1 flex-1">
                            <Label htmlFor="auto-collect-switch" className="cursor-pointer text-xs font-medium text-foreground">{autoCollect ? "Enabled" : "Disabled"}</Label>
                            <p className="text-[11px] text-muted-foreground leading-tight">{autoCollect ? "Automatic on proximity" : "Manual tap to collect"}</p>
                        </div>
                        <Switch id="auto-collect-switch" checked={autoCollect} onCheckedChange={setAutoCollect} />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Pins per Location</p>
                    <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors", pinNumber > 1 ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30")}>
                        <div className="flex flex-col gap-1 flex-1">
                            <Label className="text-xs font-medium text-foreground">Pin Number</Label>
                            <p className="text-[11px] text-muted-foreground leading-tight">{pinNumber === 1 ? "One pin per location" : `${pinNumber} pins at each location`}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setPinNumber((n) => Math.max(1, n - 1))} disabled={pinNumber <= 1}
                                className={cn("w-7 h-7 rounded-lg border flex items-center justify-center text-sm font-bold transition-all active:scale-95 flex-shrink-0",
                                    pinNumber <= 1 ? "border-border bg-muted/30 text-muted-foreground/40 cursor-not-allowed" : "border-border bg-muted hover:bg-muted/80 text-foreground")}>−</button>
                            <input type="number" min={1} max={200} value={pinNumber}
                                onChange={(e) => { const p = parseInt(e.target.value, 10); if (!isNaN(p)) setPinNumber(Math.min(200, Math.max(1, p))); }}
                                onBlur={(e) => { const p = parseInt(e.target.value, 10); setPinNumber(isNaN(p) ? 1 : Math.min(200, Math.max(1, p))); }}
                                onKeyDown={(e) => { if ([".", "-", "+", "e", "E"].includes(e.key)) e.preventDefault(); }}
                                className={cn("w-12 h-7 rounded-lg border text-center text-sm font-semibold bg-muted text-foreground tabular-nums focus:outline-none focus:border-primary transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                    pinNumber > 1 ? "border-primary/40" : "border-border")} />
                            <button type="button" onClick={() => setPinNumber((n) => Math.min(200, n + 1))}
                                className="w-7 h-7 rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center text-sm font-bold transition-all active:scale-95 flex-shrink-0">+</button>
                        </div>
                    </div>
                    {pinNumber > 1 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 w-fit">
                            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="text-[11px] font-semibold text-primary">
                                {pinCount * pinNumber} total pins
                                <span className="font-normal text-primary/70 ml-1">({pinCount} locations × {pinNumber})</span>
                            </span>
                        </div>
                    )}
                </section>
            )}
            <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={() => setCurrentStep((s) => Math.max(0, s - 1))} disabled={isFirstStep || isLoading}
                    className={cn("px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border border-border",
                        isFirstStep || isLoading ? "opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground" : "bg-muted hover:bg-muted/80 text-foreground active:scale-95")}>← Previous</button>
                <button type="button" onClick={handleNext} disabled={isLoading}
                    className={cn("flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 bg-primary text-primary-foreground hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                        isLoading && "opacity-60 cursor-not-allowed")}>
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <>{isLastStep ? "Confirm" : "Next"}<ChevronRight className="h-3 w-3" /></>}
                </button>
            </div>
        </div>
    );
}

// ─── PinCard ──────────────────────────────────────────────────────────────────

function PinCard({ pin, compact = false }: { pin: Pin; compact?: boolean }) {
    const handleMapRedirect = () => window.open(`https://www.google.com/maps?q=${pin.latitude},${pin.longitude}`, "_blank", "noreferrer");
    return (
        <div onClick={handleMapRedirect} className={cn("flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 cursor-pointer hover:bg-muted hover:border-border/80 transition-colors", compact ? "px-3 py-2" : "px-3 py-2.5")}>
            {pin.image && !compact && (<img src={pin.image} alt={pin.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-muted" />)}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0", pin.type === "EVENT" ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary")}>{pin.type ?? "LANDMARK"}</span>
                    <p className="text-foreground text-xs font-medium truncate">{pin.title}</p>
                </div>
                {pin.address && !compact && <p className="text-muted-foreground text-[11px] truncate">{pin.address}</p>}
                {pin.description && !compact && <p className="text-muted-foreground text-[11px] mt-0.5 line-clamp-2 leading-relaxed">{pin.description}</p>}
                {pin.type === "EVENT" && pin.startDate && <p className="text-amber-500/60 text-[11px] mt-0.5">{formatDate(pin.startDate)}{pin.endDate ? ` → ${formatDate(pin.endDate)}` : ""}</p>}
                {!compact && (
                    <div className="flex items-center gap-1 mt-1">
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 1.5C5.79 1.5 4 3.29 4 5.5c0 3.25 4 9 4 9s4-5.75 4-9c0-2.21-1.79-4-4-4z" /><circle cx="8" cy="5.5" r="1.25" />
                        </svg>
                        <span className="text-muted-foreground text-[10px] font-mono">{pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}</span>
                    </div>
                )}
                {pin.url && !compact && (
                    <a href={pin.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 mt-1 group w-fit max-w-full">
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M9 2h5m0 0v5m0-5L7 10" />
                        </svg>
                        <span className="text-muted-foreground group-hover:text-primary text-[10px] truncate transition-colors">{pin.url.replace(/^https?:\/\//, "")}</span>
                    </a>
                )}
            </div>
        </div>
    );
}

// ─── ResultsBlock ─────────────────────────────────────────────────────────────

function ResultsBlock({ data, pins, onConfirm, onDismiss, isLoading, confirmed, jobId, onJobComplete, detectedPinNumber }: {
    data: ResultsResponse; pins: Pin[]; onConfirm: (options: PinOptions) => void;
    onDismiss: () => void; isLoading: boolean; confirmed: boolean;
    jobId?: string; onJobComplete: (count: number) => void; detectedPinNumber?: number;
}) {
    const count = pins.length || data.pinCount;
    return (
        <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{data.message}</p>
            {pins.length > 0 && (
                <div className="space-y-1.5 overflow-y-auto pr-0.5" style={{ maxHeight: "300px" }}>
                    {pins.map((pin) => <PinCard key={pin.id} pin={pin} />)}
                </div>
            )}
            {jobId ? (
                <JobProgressBar jobId={jobId} onComplete={onJobComplete} />
            ) : confirmed ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-emerald-400 font-semibold">Queued {count} pins for drop</span>
                </div>
            ) : (
                <>
                    <ResultsConfirmPanel pinCount={count} onConfirm={onConfirm} isLoading={isLoading} detectedPinNumber={detectedPinNumber} />
                    <button onClick={onDismiss} className="w-full py-2 rounded-xl bg-muted border border-border text-muted-foreground text-sm hover:text-foreground transition-colors">Cancel</button>
                </>
            )}
        </div>
    );
}

// ─── PinDropConfirmBlock ──────────────────────────────────────────────────────

function PinDropConfirmBlock({ data, pins, onConfirm, onDismiss, isDropping }: {
    data: ConfirmResponse; pins: Pin[];
    onConfirm: (pins: Pin[]) => void; onDismiss: () => void; isDropping: boolean;
}) {
    const rows = [
        { label: "What", value: data.summary.what ?? "—" },
        { label: "Where", value: data.summary.where ?? "—" },
        { label: "Count", value: `${data.summary.count ?? 0} pins` },
        { label: "Type", value: data.summary.type ?? "LANDMARK", badge: true },
    ];
    return (
        <div className="space-y-3">
            <div className="rounded-xl bg-muted/30 border border-border divide-y divide-border">
                {rows.map(({ label, value, badge }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-muted-foreground text-xs">{label}</span>
                        {badge ? (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", value === "EVENT" ? "bg-amber-500/15 text-amber-400" : "bg-primary/15 text-primary")}>{value}</span>
                        ) : (
                            <span className="text-foreground text-xs font-semibold">{value}</span>
                        )}
                    </div>
                ))}
            </div>
            {pins.length > 0 && (
                <div className="space-y-1 overflow-y-auto pr-0.5" style={{ maxHeight: "220px" }}>
                    {pins.map((pin) => <PinCard key={pin.id} pin={pin} compact />)}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={() => onConfirm(pins)} disabled={isDropping}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20">
                    {isDropping ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Dropping…</> : <><span>📍</span> Confirm & Drop Pins</>}
                </button>
                <button onClick={onDismiss} disabled={isDropping} className="px-4 py-3 rounded-xl bg-muted border border-border text-muted-foreground text-sm hover:text-foreground transition-colors">Cancel</button>
            </div>
        </div>
    );
}

// ─── ManagementConfirmBlock ───────────────────────────────────────────────────

function ManagementConfirmBlock({ data, onConfirm, onDismiss }: {
    data: ConfirmResponse; onConfirm: () => void; onDismiss: () => void;
}) {
    const { action, targets, count, affected, unaffected } = data.summary;
    const actionLabel: Record<string, string> = { edit: "Edit", delete: "Hide", pause: "Pause", resume: "Resume" };
    const actionColor: Record<string, string> = {
        edit: "bg-blue-500 hover:bg-blue-400 shadow-blue-500/20",
        delete: "bg-red-500 hover:bg-red-400 shadow-red-500/20",
        pause: "bg-amber-500 hover:bg-amber-400 shadow-amber-500/20",
        resume: "bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20",
    };
    return (
        <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-foreground">{data.message}</p>
            <div className="rounded-xl bg-muted/30 border border-border divide-y divide-border">
                {action && (
                    <div className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-muted-foreground text-xs">Action</span>
                        <span className="text-foreground text-xs font-semibold capitalize">{actionLabel[action] ?? action}</span>
                    </div>
                )}
                {count != null && (
                    <div className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-muted-foreground text-xs">Pins affected</span>
                        <span className="text-foreground text-xs font-semibold">{count}</span>
                    </div>
                )}
                {affected && (
                    <div className="px-3 py-2.5">
                        <p className="text-muted-foreground text-xs mb-1">Will change</p>
                        <p className="text-foreground text-xs">{affected}</p>
                    </div>
                )}
                {unaffected && (
                    <div className="px-3 py-2.5">
                        <p className="text-muted-foreground text-xs mb-1">Will NOT change</p>
                        <p className="text-foreground text-xs">{unaffected}</p>
                    </div>
                )}
            </div>
            {targets && targets.length > 0 && (
                <div className="space-y-1">
                    {targets.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50">
                            <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="text-[12px] text-foreground truncate">{t}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={onConfirm} className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold transition-colors shadow-lg",
                    action ? (actionColor[action] ?? "bg-primary hover:bg-primary/90 shadow-primary/20") : "bg-primary hover:bg-primary/90")}>
                    {actionLabel[action ?? ""] ?? "Confirm"}
                </button>
                <button onClick={onDismiss} className="px-4 py-3 rounded-xl bg-muted border border-border text-muted-foreground text-sm hover:text-foreground transition-colors">Cancel</button>
            </div>
        </div>
    );
}

// ─── SuccessBlock ─────────────────────────────────────────────────────────────

export function SuccessBlock({ data }: { data: SuccessResponse }) {
    return (
        <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <span className="text-2xl flex-shrink-0">🎉</span>
            <div>
                <p className="text-emerald-400 text-sm font-bold">{data.message}</p>
                {data.count > 0 && <p className="text-emerald-500/70 text-xs mt-0.5">{data.count} pin{data.count !== 1 ? "s" : ""} saved</p>}
            </div>
        </div>
    );
}

// ─── InfoBlock ────────────────────────────────────────────────────────────────

export function InfoBlock({ data, onEdit, onDelete, onLoadMore, isLoadingMore }: {
    data: InfoResponse;
    onEdit?: (ids: string[], fields: EditFields, scope?: HotspotScope, locationEdits?: Record<string, LocationEditFields>) => void;
    onDelete?: (ids: string[]) => void;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
}) {
    // ── __REPORT__ must come before __ANALYTICS__ ──
    if (data.message === "__REPORT__" && data.data) {
        return <ReportBlock data={data.data as ReportData} onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} />;
    }
    if (data.message === "__COLLECTOR_REPORT__" && data.data) {
        return <CollectorReportBlock data={data.data as CollectorReportData} onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} />;
    }
    if (data.message === "__PINLIST__" && data.data) {
        return <PinListBlock data={data.data as PinListData} onEdit={onEdit} onDelete={onDelete} onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} />;
    }
    if (data.message === "__ANALYTICS__" && data.data) {
        return <AnalyticsBlock data={data.data as AnalyticsData} />;
    }
    if (data.message === "__COLLECTORS__" && data.data) {
        return <CollectorsBlock data={data.data as CollectorsData} />;
    }
    return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{data.message}</p>;
}

// ─── AgentResponseBlock ───────────────────────────────────────────────────────

function AgentResponseBlock({ response, pins, intent, mode, onAnswer, onConfirmWithOptions, onConfirmPins, onConfirmManagement, onDismiss, onEdit, onDelete, onLoadMore, isLoadingMore, isDropping, isLoading, questionAnswered, questionAnsweredValues, resultsConfirmed, resultsJobId, onJobComplete }: {
    response: AgentResponse; pins: Pin[]; intent: PinIntent; mode?: AgentMode;
    onAnswer: (answers: Record<string, string>) => void;
    onConfirmWithOptions: (options: PinOptions) => void;
    onConfirmPins: (pins: Pin[]) => void;
    onConfirmManagement: () => void;
    onDismiss: () => void;
    onEdit: (ids: string[], fields: EditFields, scope?: HotspotScope, locationEdits?: Record<string, LocationEditFields>) => void;
    onDelete: (ids: string[]) => void;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
    isDropping: boolean; isLoading: boolean;
    questionAnswered?: boolean; questionAnsweredValues?: Record<string, string>;
    resultsConfirmed?: boolean; resultsJobId?: string;
    onJobComplete: (count: number) => void;
}) {
    switch (response.type) {
        case "question":
            return (
                <div>
                    <ModeBadge mode={mode} />
                    <p className="text-[13px] leading-relaxed text-foreground mb-1">{response.message}</p>
                    <QuestionBlock data={response} onAnswer={onAnswer} answered={questionAnswered} answeredValues={questionAnsweredValues} />
                </div>
            );
        case "results":
            return (
                <div>
                    <ModeBadge mode={mode} />
                    <ResultsBlock data={response} pins={pins} onConfirm={onConfirmWithOptions} onDismiss={onDismiss}
                        isLoading={isLoading} confirmed={resultsConfirmed ?? false} jobId={resultsJobId}
                        onJobComplete={onJobComplete} detectedPinNumber={intent.pinNumber ?? 1} />
                </div>
            );
        case "confirm":
            return (
                <div>
                    <ModeBadge mode={mode} />
                    {mode === "management" || response.summary?.action ? (
                        <ManagementConfirmBlock data={response} onConfirm={onConfirmManagement} onDismiss={onDismiss} />
                    ) : (
                        <PinDropConfirmBlock data={response} pins={pins} onConfirm={onConfirmPins} onDismiss={onDismiss} isDropping={isDropping} />
                    )}
                </div>
            );
        case "success":
            return <SuccessBlock data={response} />;
        case "info":
        default:
            return (
                <div>
                    <ModeBadge mode={mode} />
                    <InfoBlock data={response as InfoResponse} onEdit={onEdit} onDelete={onDelete} onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} />
                </div>
            );
    }
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, intent, onAnswer, onConfirmWithOptions, onConfirmPins, onConfirmManagement, onDismiss, onEdit, onDelete, onLoadMore, isLoadingMore, isDropping, isLoading, onJobComplete }: {
    msg: LocalChatMessage; intent: PinIntent;
    onAnswer: (msgId: string, answers: Record<string, string>) => void;
    onConfirmWithOptions: (options: PinOptions) => void;
    onConfirmPins: (pins: Pin[]) => void;
    onConfirmManagement: () => void;
    onDismiss: () => void;
    onEdit: (ids: string[], fields: EditFields, scope?: HotspotScope, locationEdits?: Record<string, LocationEditFields>) => void;
    onDelete: (ids: string[]) => void;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
    isDropping: boolean; isLoading: boolean;
    onJobComplete: (count: number) => void;
}) {
    const isUser = msg.role === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2.5`}>
            {!isUser && (
                <div className="w-8 h-8 rounded-full bg-primary-foreground border-2 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg shadow-primary/20">
                    <Image src="/favicon.ico" alt="Agent" width={32} height={32} className="rounded-full" />
                </div>
            )}
            <div className={cn("max-w-[60%] rounded-2xl px-4 py-3 text-sm h-full",
                isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground border border-border rounded-bl-sm w-[60%]")}>
                {msg.content.kind === "loading" && <TypingDots label={msg.content.label} />}
                {msg.content.kind === "text" && <p className="whitespace-pre-wrap leading-relaxed">{msg.content.text}</p>}
                {msg.content.kind === "response" && (
                    <AgentResponseBlock
                        response={msg.content.data}
                        pins={msg.content.pins}
                        intent={intent}
                        mode={msg.content.mode}
                        onAnswer={(answers) => onAnswer(msg.id, answers)}
                        onConfirmWithOptions={onConfirmWithOptions}
                        onConfirmPins={onConfirmPins}
                        onConfirmManagement={onConfirmManagement}
                        onDismiss={onDismiss}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onLoadMore={onLoadMore}
                        isLoadingMore={isLoadingMore}
                        isDropping={isDropping}
                        isLoading={isLoading}
                        questionAnswered={msg.content.questionAnswered}
                        questionAnsweredValues={msg.content.questionAnsweredValues}
                        resultsConfirmed={msg.content.resultsConfirmed}
                        resultsJobId={msg.content.resultsJobId}
                        onJobComplete={onJobComplete}
                    />
                )}
            </div>
            {isUser && (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold flex-shrink-0 mt-1">U</div>
            )}
        </div>
    );
}

// ─── AgentBlockDisplay (main export) ─────────────────────────────────────────

interface AgentBlockDisplayProps {
    messages: LocalChatMessage[];
    input: string;
    intent: PinIntent;
    stage: AgentStage;
    isLoading: boolean;
    isDropping: boolean;
    isOpen: boolean;
    isMinimized: boolean;
    isInteractionPending: boolean;
    isLoadingMore?: boolean;
    setInput: (v: string) => void;
    setIsOpen: (v: boolean) => void;
    setIsMinimized: (v: boolean) => void;
    onSendMessage: (text: string, intentOverride?: Partial<PinIntent>) => void;
    onAnswer: (msgId: string, answers: Record<string, string>) => void;
    onConfirmWithOptions: (options: PinOptions) => void;
    onConfirmPins: (pins: Pin[]) => void;
    onDismiss: () => void;
    onReset: () => void;
    onEdit: (ids: string[], fields: EditFields, scope?: HotspotScope, locationEdits?: Record<string, LocationEditFields>) => void;
    onDelete: (ids: string[]) => void;
    onLoadMore?: (nextOffset: number) => void;
    onJobComplete: (count: number) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    inputRef: React.RefObject<HTMLInputElement>;
}

export default function AgentBlockDisplay({
    messages, input, intent, stage, isLoading, isDropping, isOpen, isMinimized,
    isInteractionPending, isLoadingMore, setInput, setIsOpen, setIsMinimized,
    onSendMessage, onAnswer, onConfirmWithOptions, onConfirmPins, onDismiss, onReset,
    onDelete, onEdit, onLoadMore, onJobComplete, onKeyDown, inputRef,
}: AgentBlockDisplayProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    const handleConfirmManagement = useCallback(() => { onSendMessage("Yes, confirm."); }, [onSendMessage]);
    const isEmpty = messages.length === 0;

    return (
        <>
            {isMinimized && (
                <button onClick={() => { setIsMinimized(false); setIsOpen(true); }}
                    className="fixed bottom-12 left-1/2 z-40 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95">
                    Wadzzo Assistant
                </button>
            )}

            {!isMinimized && (
                <div className="fixed bottom-6 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 px-4">
                    <style>{`
            @keyframes neon-glow {
              0%, 100% { box-shadow: 0 0 5px rgba(34,197,94,.3), 0 0 10px rgba(34,197,94,.2); }
              50%       { box-shadow: 0 0 15px rgba(34,197,94,.6), 0 0 25px rgba(34,197,94,.4); }
            }
            .neon-bar { animation: neon-glow 3s ease-in-out infinite; border: 2px solid rgba(34,197,94,.5); }
          `}</style>
                    <div className="neon-bar flex items-center gap-2 rounded-full bg-white p-1 shadow-lg backdrop-blur-sm">
                        <input ref={inputRef} type="text" value={input}
                            onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                            placeholder="Ask me anything…"
                            disabled={isLoading || isDropping || isInteractionPending}
                            className="flex-1 rounded-full bg-white px-5 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50" />
                        <button onClick={() => onSendMessage(input)}
                            disabled={!input.trim() || isLoading || isInteractionPending}
                            className="flex flex-shrink-0 items-center justify-center rounded-full bg-primary px-4 py-3 text-primary-foreground transition-all hover:scale-105 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100">
                            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </button>
                        <button onClick={() => setIsOpen(!isOpen)}
                            className="flex flex-shrink-0 items-center justify-center rounded-full bg-primary/80 px-4 py-3 text-primary-foreground transition-all hover:scale-105 active:scale-95">
                            <ChevronDown className={`h-5 w-5 transition-transform duration-300 ${isOpen ? "" : "rotate-180"}`} />
                        </button>
                    </div>
                </div>
            )}

            {!isMinimized && isOpen && (
                <div className="fixed inset-x-0 bottom-24 z-40 mx-auto max-w-2xl rounded-2xl border border-border bg-background shadow-2xl animate-in slide-in-from-bottom-5 duration-300 flex flex-col"
                    style={{ height: "calc(100vh - 15vh)", maxHeight: "85vh" }}>
                    <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-primary-foreground rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary-foreground flex items-center justify-center shadow-lg flex-shrink-0">
                                <Image src="/favicon.ico" alt="Wadzzo Icon" width={16} height={16} className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xs font-bold tracking-tight">Wadzzo Agent</h1>
                                <p className="text-[11px] text-white/70">{stage !== "idle" && stage !== "error" ? STAGE_LABEL[stage] : "AI Assistant"}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={onReset} title="Clear chat" className="rounded-full p-2 transition-colors hover:bg-white/20"><Trash2 className="h-4 w-4" /></button>
                            <button onClick={() => { setIsMinimized(true); setIsOpen(false); }} title="Minimize" className="rounded-full p-2 transition-colors hover:bg-white/20"><Minus className="h-4 w-4" /></button>
                            <button onClick={() => setIsOpen(false)} title="Close" className="rounded-full p-2 transition-colors hover:bg-white/20"><X className="h-4 w-4" /></button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {isEmpty ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                                <div className="text-center space-y-2">
                                    <div className="text-5xl">🗺️</div>
                                    <h2 className="text-sm font-bold text-foreground">Wadzzo Agent</h2>
                                    <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">Drop pins or manage your existing ones</p>
                                </div>
                                <div className="w-full max-w-sm space-y-2">
                                    {SUGGESTIONS.map((s) => (
                                        <button key={s} onClick={() => onSendMessage(s)}
                                            className="w-full px-3 py-2.5 rounded-lg text-xs text-left text-foreground bg-muted border border-border hover:border-primary/40 hover:bg-muted/80 transition-all duration-150">
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <MessageBubble key={msg.id} msg={msg} intent={intent}
                                    onAnswer={onAnswer} onEdit={onEdit} onDelete={onDelete}
                                    onLoadMore={onLoadMore} isLoadingMore={isLoadingMore}
                                    onConfirmWithOptions={onConfirmWithOptions}
                                    onConfirmPins={onConfirmPins}
                                    onConfirmManagement={handleConfirmManagement}
                                    onDismiss={onDismiss} isDropping={isDropping}
                                    isLoading={isLoading} onJobComplete={onJobComplete} />
                            ))
                        )}
                        <div ref={bottomRef} />
                    </div>
                </div>
            )}
        </>
    );
}