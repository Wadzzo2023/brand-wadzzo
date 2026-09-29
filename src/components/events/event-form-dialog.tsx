"use client"

import { CalendarDays, ChevronDown, Globe, Link2, Loader2, MapPin, Search, Users, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { UploadS3Button } from "~/components/common/upload-button"
import { Badge } from "~/components/shadcn/ui/badge"
import { Button } from "~/components/shadcn/ui/button"
import { Checkbox } from "~/components/shadcn/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"
import { Switch } from "~/components/shadcn/ui/switch"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { cn } from "~/lib/utils"
import { api, type RouterOutputs } from "~/utils/api"
import { firstError, fromLocalInput, toLocalInput } from "./form-utils"
import { VenuePicker, type Venue } from "./venue-picker"

export type EditableEvent = RouterOutputs["events"]["myEvents"][number]

interface FormState {
    title: string
    description: string
    coverImage: string | null
    start: string
    end: string
    inPerson: boolean
    venue: Venue
    link: string
    linkLabel: string
    limitSpots: boolean
    capacity: string
    pinIds: string[]
    bountyIds: number[]
}

function initialState(event: EditableEvent | null): FormState {
    if (event) {
        return {
            title: event.title,
            description: event.description,
            coverImage: event.coverImage,
            start: toLocalInput(event.startDate),
            end: toLocalInput(event.endDate),
            inPerson: event.latitude != null || !!event.venueName || !!event.address,
            venue: {
                venueName: event.venueName ?? "",
                address: event.address ?? "",
                latitude: event.latitude,
                longitude: event.longitude,
            },
            link: event.link ?? "",
            linkLabel: event.linkLabel ?? "",
            limitSpots: event.capacity != null,
            capacity: event.capacity?.toString() ?? "",
            pinIds: event.pins.map((p) => p.id),
            bountyIds: event.bounties.map((b) => b.id),
        }
    }
    // Default: tomorrow 6–9 PM local, which is what most events look like.
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(18, 0, 0, 0)
    const end = new Date(start)
    end.setHours(21)
    return {
        title: "",
        description: "",
        coverImage: null,
        start: toLocalInput(start),
        end: toLocalInput(end),
        inPerson: true,
        venue: { venueName: "", address: "", latitude: null, longitude: null },
        link: "",
        linkLabel: "",
        limitSpots: false,
        capacity: "",
        pinIds: [],
        bountyIds: [],
    }
}

export function EventFormDialog({
    open,
    onOpenChange,
    event,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    event: EditableEvent | null
}) {
    const [form, setForm] = useState<FormState>(() => initialState(event))
    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

    useEffect(() => {
        if (open) setForm(initialState(event))
    }, [open, event])

    const utils = api.useUtils()
    const done = (msg: string) => {
        toast.success(msg)
        void utils.events.myEvents.invalidate()
        onOpenChange(false)
    }
    const create = api.events.createEvent.useMutation({ onSuccess: () => done("Event published") })
    const update = api.events.updateEvent.useMutation({ onSuccess: () => done("Event updated") })
    const saving = create.isLoading || update.isLoading
    const error = create.error ?? update.error

    const submit = () => {
        const startDate = fromLocalInput(form.start)
        const endDate = fromLocalInput(form.end)
        if (!startDate || !endDate) return toast.error("Set when the event starts and ends")
        if (!form.inPerson && !form.link.trim()) {
            return toast.error("An online event needs a link — or switch on In person")
        }
        const data = {
            title: form.title,
            description: form.description,
            coverImage: form.coverImage,
            startDate,
            endDate,
            venueName: form.inPerson ? form.venue.venueName : null,
            address: form.inPerson ? form.venue.address : null,
            latitude: form.inPerson ? form.venue.latitude : null,
            longitude: form.inPerson ? form.venue.longitude : null,
            link: form.link.trim() || null,
            linkLabel: form.linkLabel,
            capacity: form.limitSpots && form.capacity ? Number(form.capacity) : null,
            pinIds: form.pinIds,
            bountyIds: form.bountyIds,
        }
        if (event) update.mutate({ id: event.id, data })
        else create.mutate(data)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
            <DialogContent
                className="max-h-[92vh] max-w-2xl overflow-y-auto p-0"
                onInteractOutside={(e) => {
                    // A click on a Google Places suggestion is "outside" the dialog.
                    if ((e.target as HTMLElement | null)?.closest?.(".pac-container")) e.preventDefault()
                }}
            >
                <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" />
                        {event ? "Edit event" : "New event"}
                    </DialogTitle>
                    <DialogDescription>
                        Published straight away to everyone on Wadzzo — web and app.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 px-6 py-5">
                    {/* Cover */}
                    <section className="space-y-2">
                        <Label>Cover image</Label>
                        {form.coverImage ? (
                            <div className="relative overflow-hidden rounded-xl border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={form.coverImage} alt="" className="h-40 w-full object-cover" />
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="absolute right-2 top-2"
                                    onClick={() => set("coverImage", null)}
                                >
                                    <X className="mr-1 h-3.5 w-3.5" /> Remove
                                </Button>
                            </div>
                        ) : (
                            <UploadS3Button
                                endpoint="imageUploader"
                                variant="button"
                                className="w-full"
                                label="Upload cover image"
                                onClientUploadComplete={(res) => res?.url && set("coverImage", res.url)}
                                onUploadError={(e) => toast.error(e.message)}
                            />
                        )}
                    </section>

                    {/* Basics */}
                    <section className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-title">Title</Label>
                            <Input
                                id="ev-title"
                                value={form.title}
                                maxLength={120}
                                placeholder="Summer Night Market"
                                onChange={(e) => set("title", e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-desc">Description</Label>
                            <Textarea
                                id="ev-desc"
                                rows={5}
                                maxLength={5000}
                                value={form.description}
                                placeholder="What's happening, who it's for, what to bring…"
                                onChange={(e) => set("description", e.target.value)}
                            />
                        </div>
                    </section>

                    {/* When */}
                    <section className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-start">Starts</Label>
                            <Input
                                id="ev-start"
                                type="datetime-local"
                                value={form.start}
                                onChange={(e) => {
                                    const start = e.target.value
                                    // Keep the same length when the start moves past the end.
                                    const s = fromLocalInput(start)
                                    const oldS = fromLocalInput(form.start)
                                    const oldE = fromLocalInput(form.end)
                                    if (s && oldS && oldE && s >= oldE) {
                                        set("end", toLocalInput(new Date(s.getTime() + (oldE.getTime() - oldS.getTime()))))
                                    }
                                    set("start", start)
                                }}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ev-end">Ends</Label>
                            <Input
                                id="ev-end"
                                type="datetime-local"
                                value={form.end}
                                min={form.start}
                                onChange={(e) => set("end", e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                            Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}); fans see them in theirs.
                        </p>
                    </section>

                    {/* Where */}
                    <section className="space-y-3 rounded-xl border p-4">
                        <ToggleRow
                            icon={MapPin}
                            title="In person"
                            hint="Add a venue — fans get a map and directions"
                            checked={form.inPerson}
                            onChange={(v) => set("inPerson", v)}
                        />
                        {form.inPerson && <VenuePicker value={form.venue} onChange={(v) => set("venue", v)} />}
                    </section>

                    {/* Link */}
                    <section className="space-y-3 rounded-xl border p-4">
                        <div className="flex items-center gap-3">
                            <Globe className="h-4 w-4 text-primary" />
                            <div>
                                <p className="text-sm font-medium">Tickets / online link</p>
                                <p className="text-xs text-muted-foreground">
                                    Registration, tickets or a livestream. {form.inPerson ? "Optional." : "Required for online events."}
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                            <Input
                                type="url"
                                placeholder="https://"
                                value={form.link}
                                onChange={(e) => set("link", e.target.value)}
                            />
                            <Input
                                placeholder="Button text (Get tickets)"
                                maxLength={40}
                                value={form.linkLabel}
                                disabled={!form.link.trim()}
                                onChange={(e) => set("linkLabel", e.target.value)}
                            />
                        </div>
                    </section>

                    {/* Capacity */}
                    <section className="space-y-3 rounded-xl border p-4">
                        <ToggleRow
                            icon={Users}
                            title="Limit RSVPs"
                            hint="RSVPs close once this many people are going"
                            checked={form.limitSpots}
                            onChange={(v) => set("limitSpots", v)}
                        />
                        {form.limitSpots && (
                            <Input
                                type="number"
                                min={1}
                                placeholder="Number of spots"
                                value={form.capacity}
                                onChange={(e) => set("capacity", e.target.value.replace(/\D/g, ""))}
                                className="max-w-[200px]"
                            />
                        )}
                    </section>

                    {/* Linked pins & bounties */}
                    <LinkPicker
                        pinIds={form.pinIds}
                        bountyIds={form.bountyIds}
                        onPins={(v) => set("pinIds", v)}
                        onBounties={(v) => set("bountyIds", v)}
                    />

                    {error && <p className="text-sm text-destructive">{firstError(error)}</p>}
                </div>

                <DialogFooter className="sticky bottom-0 border-t bg-background/95 px-6 py-3 backdrop-blur">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {event ? "Save changes" : "Publish event"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ToggleRow({
    icon: Icon,
    title,
    hint,
    checked,
    onChange,
}: {
    icon: typeof MapPin
    title: string
    hint: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <label className="flex cursor-pointer items-center gap-3">
            <Icon className="h-4 w-4 text-primary" />
            <span className="flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <Switch checked={checked} onCheckedChange={onChange} />
        </label>
    )
}

function LinkPicker({
    pinIds,
    bountyIds,
    onPins,
    onBounties,
}: {
    pinIds: string[]
    bountyIds: number[]
    onPins: (v: string[]) => void
    onBounties: (v: number[]) => void
}) {
    const [open, setOpen] = useState(pinIds.length + bountyIds.length > 0)
    const [q, setQ] = useState("")
    const options = api.events.linkOptions.useQuery(undefined, { enabled: open })

    const needle = q.trim().toLowerCase()
    const pins = useMemo(
        () => (options.data?.pins ?? []).filter((p) => p.title.toLowerCase().includes(needle)),
        [options.data, needle],
    )
    const bounties = useMemo(
        () => (options.data?.bounties ?? []).filter((b) => b.title.toLowerCase().includes(needle)),
        [options.data, needle],
    )
    const count = pinIds.length + bountyIds.length

    return (
        <section className="rounded-xl border">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-3 p-4 text-left"
            >
                <Link2 className="h-4 w-4 text-primary" />
                <span className="flex-1">
                    <span className="block text-sm font-medium">
                        Link pins & bounties {count > 0 && <Badge variant="secondary" className="ml-1">{count}</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                        Show fans what they can collect or take on at this event
                    </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="space-y-3 border-t p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" />
                    </div>
                    {options.isLoading ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid max-h-64 gap-4 overflow-y-auto sm:grid-cols-2">
                            <OptionList
                                title="Pins"
                                empty="No active pins"
                                items={pins.map((p) => ({
                                    id: p.id,
                                    label: p.title,
                                    note: p.approved === true ? null : p.approved === false ? "Rejected" : "Pending review",
                                }))}
                                selected={pinIds}
                                onChange={onPins}
                            />
                            <OptionList
                                title="Bounties"
                                empty="No bounties"
                                items={bounties.map((b) => ({
                                    id: b.id,
                                    label: b.title,
                                    note: b.status === "APPROVED" ? null : b.status.toLowerCase(),
                                }))}
                                selected={bountyIds}
                                onChange={onBounties}
                            />
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Pins pending review and unapproved bounties stay hidden from fans until they&apos;re approved.
                    </p>
                </div>
            )}
        </section>
    )
}

function OptionList<T extends string | number>({
    title,
    empty,
    items,
    selected,
    onChange,
}: {
    title: string
    empty: string
    items: { id: T; label: string; note: string | null }[]
    selected: T[]
    onChange: (v: T[]) => void
}) {
    return (
        <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{empty}</p>
            ) : (
                <ul className="space-y-1">
                    {items.map((it) => {
                        const on = selected.includes(it.id)
                        return (
                            <li key={it.id}>
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                                    <Checkbox
                                        checked={on}
                                        onCheckedChange={(c) =>
                                            onChange(c ? [...selected, it.id] : selected.filter((x) => x !== it.id))
                                        }
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm">{it.label}</span>
                                    {it.note && <span className="shrink-0 text-[10px] text-muted-foreground">{it.note}</span>}
                                </label>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
