"use client"

import { CalendarClock, Link2, Loader2, Megaphone, Pin, X } from "lucide-react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { UploadS3Button } from "~/components/common/upload-button"
import { Button } from "~/components/shadcn/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { Input } from "~/components/shadcn/ui/input"
import { Label } from "~/components/shadcn/ui/label"
import { Switch } from "~/components/shadcn/ui/switch"
import { Textarea } from "~/components/shadcn/ui/textarea"
import { api, type RouterOutputs } from "~/utils/api"
import { firstError, fromLocalInput, toLocalInput } from "./form-utils"

export type EditableAnnouncement = RouterOutputs["events"]["myAnnouncements"][number]

const MAX_IMAGES = 6

interface FormState {
    title: string
    body: string
    images: string[]
    pinned: boolean
    withCta: boolean
    ctaLabel: string
    ctaUrl: string
    expires: boolean
    expiresAt: string
}

function initialState(a: EditableAnnouncement | null): FormState {
    const weekOut = new Date()
    weekOut.setDate(weekOut.getDate() + 7)
    weekOut.setHours(23, 59, 0, 0)
    return {
        title: a?.title ?? "",
        body: a?.body ?? "",
        images: a?.images ?? [],
        pinned: a?.pinned ?? false,
        withCta: !!a?.ctaUrl,
        ctaLabel: a?.ctaLabel ?? "",
        ctaUrl: a?.ctaUrl ?? "",
        expires: !!a?.expiresAt,
        expiresAt: toLocalInput(a?.expiresAt ?? weekOut),
    }
}

export function AnnouncementFormDialog({
    open,
    onOpenChange,
    announcement,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    announcement: EditableAnnouncement | null
}) {
    const [form, setForm] = useState<FormState>(() => initialState(announcement))
    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

    useEffect(() => {
        if (open) setForm(initialState(announcement))
    }, [open, announcement])

    const utils = api.useUtils()
    const done = (msg: string) => {
        toast.success(msg)
        void utils.events.myAnnouncements.invalidate()
        onOpenChange(false)
    }
    const create = api.events.createAnnouncement.useMutation({ onSuccess: () => done("Announcement posted") })
    const update = api.events.updateAnnouncement.useMutation({ onSuccess: () => done("Announcement updated") })
    const saving = create.isLoading || update.isLoading
    const error = create.error ?? update.error

    const submit = () => {
        const expiresAt = form.expires ? fromLocalInput(form.expiresAt) : null
        if (form.expires && (!expiresAt || expiresAt <= new Date())) {
            return toast.error("Pick an expiry in the future")
        }
        const data = {
            title: form.title,
            body: form.body,
            images: form.images,
            pinned: form.pinned,
            ctaLabel: form.withCta ? form.ctaLabel : null,
            ctaUrl: form.withCta && form.ctaUrl.trim() ? form.ctaUrl.trim() : null,
            expiresAt,
        }
        if (announcement) update.mutate({ id: announcement.id, data })
        else create.mutate(data)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
            <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto p-0">
                <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
                    <DialogTitle className="flex items-center gap-2">
                        <Megaphone className="h-5 w-5 text-primary" />
                        {announcement ? "Edit announcement" : "New announcement"}
                    </DialogTitle>
                    <DialogDescription>Shows up in the News feed on Wadzzo web and app right away.</DialogDescription>
                </DialogHeader>

                <div className="space-y-5 px-6 py-5">
                    <div className="space-y-1.5">
                        <Label htmlFor="an-title">Title</Label>
                        <Input
                            id="an-title"
                            value={form.title}
                            maxLength={120}
                            placeholder="New flavours this weekend"
                            onChange={(e) => set("title", e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="an-body">Message</Label>
                        <Textarea
                            id="an-body"
                            rows={6}
                            maxLength={5000}
                            value={form.body}
                            placeholder="Tell your fans what's new…"
                            onChange={(e) => set("body", e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>
                            Images <span className="font-normal text-muted-foreground">({form.images.length}/{MAX_IMAGES})</span>
                        </Label>
                        {form.images.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                                {form.images.map((src, i) => (
                                    <div key={src} className="group relative aspect-square overflow-hidden rounded-lg border">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={src} alt="" className="h-full w-full object-cover" />
                                        {i === 0 && (
                                            <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 text-[10px] font-medium">
                                                Cover
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            aria-label="Remove image"
                                            onClick={() => set("images", form.images.filter((x) => x !== src))}
                                            className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {form.images.length < MAX_IMAGES && (
                            <UploadS3Button
                                endpoint="imageUploader"
                                variant="button"
                                className="w-full"
                                label={form.images.length ? "Add another image" : "Upload image"}
                                onClientUploadComplete={(res) =>
                                    res?.url && setForm((f) => ({ ...f, images: [...f.images, res.url].slice(0, MAX_IMAGES) }))
                                }
                                onUploadError={(e) => toast.error(e.message)}
                            />
                        )}
                    </div>

                    <div className="divide-y rounded-xl border">
                        <Toggle
                            icon={Pin}
                            title="Pin to top"
                            hint="Stays first on your brand page"
                            checked={form.pinned}
                            onChange={(v) => set("pinned", v)}
                        />
                        <div>
                            <Toggle
                                icon={Link2}
                                title="Button"
                                hint="A call-to-action that opens a link"
                                checked={form.withCta}
                                onChange={(v) => set("withCta", v)}
                            />
                            {form.withCta && (
                                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[160px_1fr]">
                                    <Input
                                        placeholder="Shop now"
                                        maxLength={40}
                                        value={form.ctaLabel}
                                        onChange={(e) => set("ctaLabel", e.target.value)}
                                    />
                                    <Input
                                        type="url"
                                        placeholder="https://"
                                        value={form.ctaUrl}
                                        onChange={(e) => set("ctaUrl", e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <Toggle
                                icon={CalendarClock}
                                title="Expires"
                                hint="Hidden from fans automatically after this"
                                checked={form.expires}
                                onChange={(v) => set("expires", v)}
                            />
                            {form.expires && (
                                <div className="px-4 pb-4">
                                    <Input
                                        type="datetime-local"
                                        value={form.expiresAt}
                                        min={toLocalInput(new Date())}
                                        onChange={(e) => set("expiresAt", e.target.value)}
                                        className="max-w-[240px]"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive">{firstError(error)}</p>}
                </div>

                <DialogFooter className="sticky bottom-0 border-t bg-background/95 px-6 py-3 backdrop-blur">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {announcement ? "Save changes" : "Post announcement"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function Toggle({
    icon: Icon,
    title,
    hint,
    checked,
    onChange,
}: {
    icon: typeof Pin
    title: string
    hint: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <label className="flex cursor-pointer items-center gap-3 p-4">
            <Icon className="h-4 w-4 text-primary" />
            <span className="flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <Switch checked={checked} onCheckedChange={onChange} />
        </label>
    )
}
