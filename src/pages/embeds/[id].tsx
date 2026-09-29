"use client"

import type { EmbedGesture, EmbedTheme, PinType } from "@prisma/client"
import { ArrowLeft, Crosshair, Laptop, Loader2, Monitor, PanelLeft, Smartphone } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/router"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { EmbedInstall } from "~/components/embeds/embed-install"
import { EmbedStats } from "~/components/embeds/embed-stats"
import { Button } from "~/components/shadcn/ui/button"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"
import { Switch } from "~/components/shadcn/ui/switch"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { DEFAULT_DRAFT, type EmbedDraft, PIN_TYPE_LABEL, previewUrl, WADZZO_AR_URL } from "~/lib/embed"
import { cn } from "~/lib/utils"
import { api } from "~/utils/api"

type Tab = "settings" | "install" | "stats"
const AR_ORIGIN = new URL(WADZZO_AR_URL).origin
const ACCENTS = ["#39ff88", "#7d2a3c", "#1f5b33", "#1d4ed8", "#ea580c", "#7c3aed", "#0f172a"]
const WIDTHS = [
    { id: "hero", label: "Hero", icon: Monitor, width: "100%" },
    { id: "sidebar", label: "Sidebar", icon: PanelLeft, width: "420px" },
    { id: "phone", label: "Phone", icon: Smartphone, width: "375px" },
] as const

/**
 * ── /embeds/[id] ───────────────────────────────────────────────────────────
 *
 * Edit one website map (`id` = "new" to create). The right side is the real
 * embed in preview mode: settings are pushed into it by postMessage so it
 * updates in place, and it reports where you've panned so "Set start view
 * here" can save exactly the view you see.
 */
export default function EmbedEditorPage() {
    const router = useRouter()
    const id = typeof router.query.id === "string" ? router.query.id : ""
    const isNew = id === "new"
    const tab: Tab = router.query.tab === "install" ? "install" : router.query.tab === "stats" ? "stats" : "settings"
    const setTab = (t: Tab) => void router.replace({ query: { ...router.query, tab: t === "settings" ? undefined : t } }, undefined, { shallow: true })

    const existing = api.embeds.get.useQuery({ id }, { enabled: !!id && !isNew, refetchOnWindowFocus: false })
    const [draft, setDraft] = useState<EmbedDraft | null>(null)
    const [dirty, setDirty] = useState(false)

    useEffect(() => {
        if (isNew && router.isReady && !draft) setDraft(DEFAULT_DRAFT)
        if (existing.data && !draft) {
            const { id: _i, creatorId: _c, createdAt: _a, updatedAt: _u, ...rest } = existing.data
            setDraft(rest)
        }
    }, [isNew, router.isReady, existing.data, draft])

    const set = useCallback(<K extends keyof EmbedDraft>(k: K, v: EmbedDraft[K]) => {
        setDraft((d) => (d ? { ...d, [k]: v } : d))
        setDirty(true)
    }, [])

    const utils = api.useUtils()
    const create = api.embeds.create.useMutation({
        onSuccess: (r) => {
            toast.success("Map created — copy the snippet to add it to your site")
            setDirty(false)
            void utils.embeds.list.invalidate()
            void router.replace(`/embeds/${r.id}?tab=install`)
        },
    })
    const update = api.embeds.update.useMutation({
        onSuccess: () => {
            toast.success("Saved — the live map is updated")
            setDirty(false)
            void utils.embeds.list.invalidate()
            void utils.embeds.get.invalidate({ id })
        },
    })
    const saving = create.isLoading || update.isLoading
    const error = create.error ?? update.error

    const save = () => {
        if (!draft) return
        if (isNew) create.mutate(draft)
        else update.mutate({ id, data: draft })
    }

    if (!isNew && existing.isError) {
        return (
            <div className="p-6">
                <p className="text-sm text-destructive">{existing.error.message}</p>
                <Link href="/embeds" className="mt-2 inline-block text-sm underline">
                    Back to maps
                </Link>
            </div>
        )
    }
    if (!draft) {
        return (
            <div className="flex h-[60vh] w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
                <Button variant="ghost" size="icon" onClick={() => void router.push("/embeds")} aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-semibold">{isNew ? "New website map" : draft.name}</h1>
                    <p className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}</p>
                </div>
                <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
                    {(["settings", "install", "stats"] as const).map((t) => (
                        <button
                            key={t}
                            disabled={isNew && t !== "settings"}
                            onClick={() => setTab(t)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-40",
                                tab === t ? "bg-primary font-medium text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t === "install" ? "Add to website" : t === "stats" ? "Stats" : "Settings"}
                        </button>
                    ))}
                </div>
                <Button onClick={save} disabled={saving || (!dirty && !isNew)}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isNew ? "Create map" : "Save"}
                </Button>
            </div>
            {error && <p className="border-b bg-destructive/5 px-6 py-2 text-sm text-destructive">{firstError(error)}</p>}

            {tab === "install" && !isNew ? (
                <div className="flex-1 overflow-y-auto">
                    <EmbedInstall id={id} draft={draft} />
                </div>
            ) : tab === "stats" && !isNew ? (
                <div className="flex-1 overflow-y-auto">
                    <EmbedStats id={id} />
                </div>
            ) : (
                <div className="grid min-h-0 flex-1 lg:grid-cols-[400px_1fr]">
                    <div className="min-h-0 overflow-y-auto border-r">
                        <Settings draft={draft} set={set} />
                    </div>
                    <Preview draft={draft} onStartView={(v) => {
                        set("centerLat", v.lat)
                        set("centerLng", v.lng)
                        set("zoom", v.zoom)
                    }} />
                </div>
            )}
        </div>
    )
}

// ── Settings column ───────────────────────────────────────────────────────

function Settings({ draft, set }: { draft: EmbedDraft; set: <K extends keyof EmbedDraft>(k: K, v: EmbedDraft[K]) => void }) {
    const [domainsText, setDomainsText] = useState(draft.allowedDomains.join("\n"))
    return (
        <div className="space-y-6 p-4 md:p-6">
            <Section title="Basics">
                <div className="space-y-1.5">
                    <Label htmlFor="em-name">Name</Label>
                    <Input id="em-name" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
                    <p className="text-xs text-muted-foreground">Only you see this.</p>
                </div>
                <Toggle title="Map is live" hint="Turn off to show 'Map unavailable' on websites" checked={draft.enabled} onChange={(v) => set("enabled", v)} />
            </Section>

            <Section title="Where the map opens">
                <p className="text-sm text-muted-foreground">
                    Pan and zoom the preview to the area you want, then press <b>Set start view here</b> above it.
                </p>
                <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                    {draft.centerLat.toFixed(4)}, {draft.centerLng.toFixed(4)} · zoom {draft.zoom.toFixed(1)}
                </p>
                <Toggle
                    title="“Near me” button"
                    hint="Visitors can tap it to centre on their location. The browser asks for permission only when they tap."
                    checked={draft.userLocation}
                    onChange={(v) => set("userLocation", v)}
                />
            </Section>

            <Section title="Look">
                <div className="space-y-1.5">
                    <Label>Theme</Label>
                    <Segmented<EmbedTheme>
                        value={draft.theme}
                        onChange={(v) => set("theme", v)}
                        options={[
                            { id: "AUTO", label: "Auto" },
                            { id: "LIGHT", label: "Light" },
                            { id: "DARK", label: "Dark" },
                        ]}
                    />
                    <p className="text-xs text-muted-foreground">Auto follows each visitor&apos;s device setting.</p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="em-accent">Accent colour</Label>
                    <div className="flex flex-wrap items-center gap-2">
                        {ACCENTS.map((c) => (
                            <button
                                key={c}
                                onClick={() => set("accentColor", c)}
                                aria-label={`Accent ${c}`}
                                className={cn("h-7 w-7 rounded-full border-2", draft.accentColor.toLowerCase() === c ? "border-foreground" : "border-transparent")}
                                style={{ background: c }}
                            />
                        ))}
                        <input
                            id="em-accent"
                            type="color"
                            value={draft.accentColor}
                            onChange={(e) => set("accentColor", e.target.value)}
                            className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Buttons and clusters. Use your website&apos;s brand colour.</p>
                </div>
            </Section>

            <Section title="Which pins">
                <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(PIN_TYPE_LABEL) as PinType[]).map((t) => {
                        const on = draft.pinTypes.includes(t)
                        return (
                            <button
                                key={t}
                                onClick={() => set("pinTypes", on ? draft.pinTypes.filter((x) => x !== t) : [...draft.pinTypes, t])}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium",
                                    on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {PIN_TYPE_LABEL[t]}
                            </button>
                        )
                    })}
                </div>
                <p className="text-xs text-muted-foreground">
                    {draft.pinTypes.length ? "Only the selected types show." : "Nothing selected = every type shows."}
                </p>
                <Toggle title="Filter chips" hint="Let visitors narrow the map by type" checked={draft.showFilterChips} onChange={(v) => set("showFilterChips", v)} />
            </Section>

            <Section title="Features">
                <Toggle title="Search box" hint="Search drops and places" checked={draft.showSearch} onChange={(v) => set("showSearch", v)} />
                <Toggle title="Nearby list" hint="A list of drops beside the map on wide screens, a strip on phones" checked={draft.showNearby} onChange={(v) => set("showNearby", v)} />
                <div className="space-y-1.5">
                    <Label>Scrolling</Label>
                    <Segmented<EmbedGesture>
                        value={draft.gestureMode}
                        onChange={(v) => set("gestureMode", v)}
                        options={[
                            { id: "COOPERATIVE", label: "Page scrolls (recommended)" },
                            { id: "GREEDY", label: "Map grabs scroll" },
                        ]}
                    />
                    <p className="text-xs text-muted-foreground">
                        {draft.gestureMode === "COOPERATIVE"
                            ? "Visitors scroll past the map normally; they zoom with Ctrl/⌘ + scroll or two fingers. Best for a homepage hero."
                            : "Every scroll and drag moves the map. Fine for a full-page map, but visitors can get stuck in it."}
                    </p>
                </div>
            </Section>

            <Section title="Buttons on the map">
                <LinkField
                    title="Events button"
                    label={draft.eventsLabel}
                    url={draft.eventsUrl}
                    defaultUrl={`${WADZZO_AR_URL}/events`}
                    onLabel={(v) => set("eventsLabel", v)}
                    onUrl={(v) => set("eventsUrl", v)}
                />
                <LinkField
                    title="Bounties button"
                    label={draft.bountiesLabel}
                    url={draft.bountiesUrl}
                    defaultUrl={`${WADZZO_AR_URL}/bounty`}
                    onLabel={(v) => set("bountiesLabel", v)}
                    onUrl={(v) => set("bountiesUrl", v)}
                />
            </Section>

            <Section title="Websites allowed to show this map">
                <Textarea
                    rows={3}
                    value={domainsText}
                    placeholder={"clintoncounty-ia.gov\nvisitclinton.com"}
                    onChange={(e) => {
                        setDomainsText(e.target.value)
                        set("allowedDomains", e.target.value.split(/[\n,\s]+/).filter(Boolean))
                    }}
                />
                <p className={cn("text-xs", draft.allowedDomains.length ? "text-muted-foreground" : "text-amber-600")}>
                    {draft.allowedDomains.length
                        ? "One per line. Subdomains (www., maps.) are included. Other sites that copy your snippet get a blocked frame."
                        : "Empty = any website can show this map. Add your domain to stop others copying it."}
                </p>
            </Section>
        </div>
    )
}

// ── Live preview ──────────────────────────────────────────────────────────

function Preview({ draft, onStartView }: { draft: EmbedDraft; onStartView: (v: { lat: number; lng: number; zoom: number }) => void }) {
    const frame = useRef<HTMLIFrameElement>(null)
    const [width, setWidth] = useState<(typeof WIDTHS)[number]["id"]>("hero")
    const [height, setHeight] = useState(520)
    const [view, setView] = useState<{ lat: number; lng: number; zoom: number } | null>(null)
    // Loaded once with the settings at open; later edits go in by postMessage.
    const [src] = useState(() => previewUrl(draft))
    const latest = useRef(draft)
    latest.current = draft

    const push = useCallback(() => {
        frame.current?.contentWindow?.postMessage({ type: "wadzzo-embed:config", config: latest.current }, AR_ORIGIN)
    }, [])

    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.origin !== AR_ORIGIN) return
            const d = e.data as { type?: string; lat?: number; lng?: number; zoom?: number } | null
            if (d?.type === "wadzzo-embed:ready") push()
            if (d?.type === "wadzzo-embed:view" && typeof d.lat === "number" && typeof d.lng === "number" && typeof d.zoom === "number") {
                setView({ lat: d.lat, lng: d.lng, zoom: d.zoom })
            }
        }
        window.addEventListener("message", onMessage)
        return () => window.removeEventListener("message", onMessage)
    }, [push])

    useEffect(() => {
        const t = setTimeout(push, 150)
        return () => clearTimeout(t)
    }, [draft, push])

    const sameAsStart =
        view != null &&
        Math.abs(view.lat - draft.centerLat) < 1e-4 &&
        Math.abs(view.lng - draft.centerLng) < 1e-4 &&
        Math.abs(view.zoom - draft.zoom) < 0.05

    return (
        <div className="flex min-h-[520px] flex-col bg-muted/40">
            <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
                <div className="flex gap-1 rounded-lg border p-0.5">
                    {WIDTHS.map((w) => (
                        <button
                            key={w.id}
                            onClick={() => setWidth(w.id)}
                            className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs", width === w.id ? "bg-muted font-medium" : "text-muted-foreground")}
                        >
                            <w.icon className="h-3.5 w-3.5" /> {w.label}
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Laptop className="h-3.5 w-3.5" /> Height
                    <input type="range" min={360} max={760} step={20} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
                    <span className="w-12 tabular-nums">{height}px</span>
                </label>
                <Button
                    size="sm"
                    className="ml-auto"
                    variant={sameAsStart ? "outline" : "default"}
                    disabled={!view || sameAsStart}
                    onClick={() => view && onStartView(view)}
                >
                    <Crosshair className="mr-1.5 h-3.5 w-3.5" />
                    {sameAsStart ? "This is the start view" : "Set start view here"}
                </Button>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-auto p-4">
                <div
                    className="overflow-hidden rounded-xl border bg-background shadow-lg transition-[width]"
                    style={{ width: WIDTHS.find((w) => w.id === width)!.width, maxWidth: "100%", height }}
                >
                    <iframe ref={frame} src={src} title="Map preview" className="h-full w-full border-0" allow="geolocation" />
                </div>
            </div>
            <p className="px-4 pb-3 text-center text-xs text-muted-foreground">
                Live preview — this is the real map. Stats aren&apos;t counted here.
            </p>
        </div>
    )
}

// ── Small pieces ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
            {children}
        </section>
    )
}

function Toggle({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
            <span className="flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <Switch checked={checked} onCheckedChange={onChange} />
        </label>
    )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
    return (
        <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
            {options.map((o) => (
                <button
                    key={o.id}
                    onClick={() => onChange(o.id)}
                    className={cn("flex-1 rounded-lg px-2 py-1.5 text-xs", value === o.id ? "bg-background font-medium shadow" : "text-muted-foreground")}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

function LinkField({
    title,
    label,
    url,
    defaultUrl,
    onLabel,
    onUrl,
}: {
    title: string
    label: string
    url: string | null
    defaultUrl: string
    onLabel: (v: string) => void
    onUrl: (v: string | null) => void
}) {
    const on = url != null
    return (
        <div className="space-y-2 rounded-xl border p-3">
            <label className="flex cursor-pointer items-center gap-3">
                <span className="flex-1 text-sm font-medium">{title}</span>
                <Switch checked={on} onCheckedChange={(v) => onUrl(v ? defaultUrl : null)} />
            </label>
            {on && (
                <div className="grid gap-2">
                    <Input value={label} maxLength={40} onChange={(e) => onLabel(e.target.value)} placeholder="Button text" />
                    <Input value={url ?? ""} type="url" onChange={(e) => onUrl(e.target.value)} placeholder="https://" />
                    <p className="text-[11px] text-muted-foreground">Opens in a new tab. Use your own page, or keep Wadzzo&apos;s.</p>
                </div>
            )}
        </div>
    )
}

function firstError(error: { message: string; data?: { zodError?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] } | null } | null }) {
    const z = error.data?.zodError
    const field = z?.fieldErrors && Object.values(z.fieldErrors).find((v) => v?.length)?.[0]
    return field ?? z?.formErrors?.[0] ?? error.message
}
