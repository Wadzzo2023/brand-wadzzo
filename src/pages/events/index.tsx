"use client"

import { format, formatDistanceToNowStrict, isSameDay } from "date-fns"
import {
    CalendarDays,
    CalendarX2,
    Clock,
    Globe,
    Link2,
    MapPin,
    Megaphone,
    MessageCircle,
    MoreVertical,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Trash2,
    Users,
} from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "~/components/shadcn/ui/alert-dialog"
import { Badge } from "~/components/shadcn/ui/badge"
import { Button } from "~/components/shadcn/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/shadcn/ui/dropdown-menu"
import { Skeleton } from "~/components/shadcn/ui/skeleton"
import { AnnouncementFormDialog, type EditableAnnouncement } from "~/components/events/announcement-form-dialog"
import { EngagementDialog } from "~/components/events/engagement-dialog"
import { EventFormDialog, type EditableEvent } from "~/components/events/event-form-dialog"
import { cn } from "~/lib/utils"
import { api } from "~/utils/api"

type Tab = "events" | "announcements"
type When = "upcoming" | "past"
type Engagement = { kind: "event" | "announcement"; id: string; title: string; tab: "attendees" | "comments" }
type Deleting = { kind: "event" | "announcement"; id: string; title: string }

/**
 * ── /events ────────────────────────────────────────────────────────────────
 *
 * Where a brand posts events and announcements. Both go live immediately on
 * Wadzzo web and the mobile app — fans reach them from the calendar button on
 * the map — so there's no draft/review state to manage here, just the posts.
 */
export default function CreatorEventsPage() {
    const [tab, setTab] = useState<Tab>("events")
    const [when, setWhen] = useState<When>("upcoming")
    const [eventForm, setEventForm] = useState<{ open: boolean; event: EditableEvent | null }>({ open: false, event: null })
    const [postForm, setPostForm] = useState<{ open: boolean; post: EditableAnnouncement | null }>({ open: false, post: null })
    const [engagement, setEngagement] = useState<Engagement | null>(null)
    const [deleting, setDeleting] = useState<Deleting | null>(null)

    const events = api.events.myEvents.useQuery({ when }, { enabled: tab === "events" })
    const posts = api.events.myAnnouncements.useQuery(undefined, { enabled: tab === "announcements" })

    const utils = api.useUtils()
    const onDeleted = () => {
        toast.success("Deleted")
        setDeleting(null)
        void utils.events.myEvents.invalidate()
        void utils.events.myAnnouncements.invalidate()
    }
    const delEvent = api.events.deleteEvent.useMutation({ onSuccess: onDeleted, onError: (e) => toast.error(e.message) })
    const delPost = api.events.deleteAnnouncement.useMutation({ onSuccess: onDeleted, onError: (e) => toast.error(e.message) })
    const setPinned = api.events.setPinned.useMutation({
        onSuccess: (r) => {
            toast.success(r.pinned ? "Pinned to top" : "Unpinned")
            void utils.events.myAnnouncements.invalidate()
        },
    })

    return (
        <div className="w-full space-y-6 overflow-y-auto p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Events & Announcements</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Posts go live straight away for everyone on Wadzzo — web and app.
                    </p>
                </div>
                <Button
                    onClick={() =>
                        tab === "events"
                            ? setEventForm({ open: true, event: null })
                            : setPostForm({ open: true, post: null })
                    }
                >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {tab === "events" ? "New event" : "New announcement"}
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
                    {(
                        [
                            ["events", "Events", CalendarDays],
                            ["announcements", "Announcements", Megaphone],
                        ] as const
                    ).map(([key, label, Icon]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={cn(
                                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm transition",
                                tab === key
                                    ? "bg-primary font-medium text-primary-foreground shadow"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </button>
                    ))}
                </div>
                {tab === "events" && (
                    <div className="flex gap-1 rounded-xl border p-1">
                        {(["upcoming", "past"] as const).map((w) => (
                            <button
                                key={w}
                                onClick={() => setWhen(w)}
                                className={cn(
                                    "rounded-lg px-3 py-1 text-xs font-medium capitalize transition",
                                    when === w ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Lists */}
            {tab === "events" ? (
                events.isLoading ? (
                    <Grid>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</Grid>
                ) : !events.data?.length ? (
                    <EmptyState
                        icon={when === "past" ? CalendarX2 : CalendarDays}
                        title={when === "past" ? "No past events" : "No upcoming events"}
                        body="Events show up for fans on Wadzzo with the date, venue, RSVPs and directions."
                        action={when === "upcoming" ? () => setEventForm({ open: true, event: null }) : undefined}
                        actionLabel="Create your first event"
                    />
                ) : (
                    <Grid>
                        {events.data.map((e) => (
                            <EventTile
                                key={e.id}
                                event={e}
                                onEdit={() => setEventForm({ open: true, event: e })}
                                onEngagement={(t) => setEngagement({ kind: "event", id: e.id, title: e.title, tab: t })}
                                onDelete={() => setDeleting({ kind: "event", id: e.id, title: e.title })}
                            />
                        ))}
                    </Grid>
                )
            ) : posts.isLoading ? (
                <Grid>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</Grid>
            ) : !posts.data?.length ? (
                <EmptyState
                    icon={Megaphone}
                    title="No announcements yet"
                    body="Share news, drops and offers. Fans see them in the News feed."
                    action={() => setPostForm({ open: true, post: null })}
                    actionLabel="Post an announcement"
                />
            ) : (
                <Grid>
                    {posts.data.map((a) => (
                        <AnnouncementTile
                            key={a.id}
                            post={a}
                            onEdit={() => setPostForm({ open: true, post: a })}
                            onComments={() => setEngagement({ kind: "announcement", id: a.id, title: a.title, tab: "comments" })}
                            onTogglePin={() => setPinned.mutate({ id: a.id, pinned: !a.pinned })}
                            onDelete={() => setDeleting({ kind: "announcement", id: a.id, title: a.title })}
                        />
                    ))}
                </Grid>
            )}

            <EventFormDialog
                open={eventForm.open}
                event={eventForm.event}
                onOpenChange={(open) => setEventForm((s) => ({ ...s, open }))}
            />
            <AnnouncementFormDialog
                open={postForm.open}
                announcement={postForm.post}
                onOpenChange={(open) => setPostForm((s) => ({ ...s, open }))}
            />
            <EngagementDialog
                key={engagement ? `${engagement.id}-${engagement.tab}` : "none"}
                target={engagement}
                initialTab={engagement?.tab}
                onOpenChange={(open) => !open && setEngagement(null)}
            />

            <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleting?.kind === "event"
                                ? "The event, its RSVPs and comments are removed for everyone. This can't be undone."
                                : "The announcement and its comments are removed for everyone. This can't be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault()
                                if (!deleting) return
                                if (deleting.kind === "event") delEvent.mutate({ id: deleting.id })
                                else delPost.mutate({ id: deleting.id })
                            }}
                        >
                            {delEvent.isLoading || delPost.isLoading ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// ── Pieces ────────────────────────────────────────────────────────────────

const Grid = ({ children }: { children: React.ReactNode }) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
)

function whenLabel(start: Date, end: Date) {
    if (isSameDay(start, end)) return `${format(start, "EEE d MMM yyyy")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`
    return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`
}

function EventTile({
    event: e,
    onEdit,
    onEngagement,
    onDelete,
}: {
    event: EditableEvent
    onEdit: () => void
    onEngagement: (tab: "attendees" | "comments") => void
    onDelete: () => void
}) {
    const now = new Date()
    const live = e.startDate <= now && e.endDate >= now
    const past = e.endDate < now
    const full = e.capacity != null && e._count.rsvps >= e.capacity
    const links = e.pins.length + e.bounties.length

    return (
        <article className={cn("group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm", past && "opacity-80")}>
            <div className="relative h-36 bg-gradient-to-br from-primary/20 via-muted to-muted">
                {e.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.coverImage} alt="" className="h-full w-full object-cover" />
                )}
                <div className="absolute left-3 top-3 flex w-12 flex-col items-center rounded-xl bg-background/95 py-1 shadow">
                    <span className="text-[10px] font-semibold uppercase text-primary">{format(e.startDate, "MMM")}</span>
                    <span className="text-lg font-bold leading-none">{format(e.startDate, "d")}</span>
                </div>
                <div className="absolute right-2 top-2 flex items-center gap-1.5">
                    {live && <Badge className="bg-green-600 hover:bg-green-600">Live now</Badge>}
                    {past && <Badge variant="secondary">Ended</Badge>}
                    <TileMenu>
                        <DropdownMenuItem onClick={onEdit}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEngagement("attendees")}>
                            <Users className="mr-2 h-4 w-4" /> Who&apos;s going
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEngagement("comments")}>
                            <MessageCircle className="mr-2 h-4 w-4" /> Comments
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </TileMenu>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="line-clamp-2 font-semibold leading-snug">{e.title}</h3>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" /> {whenLabel(e.startDate, e.endDate)}
                </p>
                {(e.venueName ?? e.address) ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{e.venueName ?? e.address}</span>
                    </p>
                ) : e.link ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" /> Online
                    </p>
                ) : null}

                <div className="mt-auto flex items-center gap-4 border-t pt-3 text-xs">
                    <button onClick={() => onEngagement("attendees")} className={cn("flex items-center gap-1 hover:text-primary", full && "text-amber-600")}>
                        <Users className="h-3.5 w-3.5" />
                        {e._count.rsvps}
                        {e.capacity != null && ` / ${e.capacity}`} going
                    </button>
                    <button onClick={() => onEngagement("comments")} className="flex items-center gap-1 hover:text-primary">
                        <MessageCircle className="h-3.5 w-3.5" /> {e._count.comments}
                    </button>
                    {links > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                            <Link2 className="h-3.5 w-3.5" /> {links} linked
                        </span>
                    )}
                </div>
            </div>
        </article>
    )
}

function AnnouncementTile({
    post: a,
    onEdit,
    onComments,
    onTogglePin,
    onDelete,
}: {
    post: EditableAnnouncement
    onEdit: () => void
    onComments: () => void
    onTogglePin: () => void
    onDelete: () => void
}) {
    const expired = a.expiresAt != null && a.expiresAt < new Date()
    return (
        <article className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm", expired && "opacity-70")}>
            {a.images[0] && (
                <div className="relative h-36">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.images[0]} alt="" className="h-full w-full object-cover" />
                    {a.images.length > 1 && (
                        <span className="absolute bottom-2 right-2 rounded-md bg-background/90 px-1.5 text-xs font-medium">
                            +{a.images.length - 1}
                        </span>
                    )}
                </div>
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap gap-1.5">
                            {a.pinned && (
                                <Badge variant="secondary" className="gap-1">
                                    <Pin className="h-3 w-3" /> Pinned
                                </Badge>
                            )}
                            {expired && <Badge variant="outline">Expired — hidden from fans</Badge>}
                        </div>
                        <h3 className="line-clamp-2 font-semibold leading-snug">{a.title}</h3>
                    </div>
                    <TileMenu>
                        <DropdownMenuItem onClick={onEdit}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onTogglePin}>
                            {a.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                            {a.pinned ? "Unpin" : "Pin to top"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onComments}>
                            <MessageCircle className="mr-2 h-4 w-4" /> Comments
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </TileMenu>
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                <div className="mt-auto flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
                    <span>{formatDistanceToNowStrict(a.createdAt, { addSuffix: true })}</span>
                    <button onClick={onComments} className="flex items-center gap-1 hover:text-primary">
                        <MessageCircle className="h-3.5 w-3.5" /> {a._count.comments}
                    </button>
                    {a.expiresAt && !expired && (
                        <span className="ml-auto">Expires {format(a.expiresAt, "d MMM")}</span>
                    )}
                </div>
            </div>
        </article>
    )
}

function TileMenu({ children }: { children: React.ReactNode }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow" aria-label="Actions">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{children}</DropdownMenuContent>
        </DropdownMenu>
    )
}

function EmptyState({
    icon: Icon,
    title,
    body,
    action,
    actionLabel,
}: {
    icon: typeof CalendarDays
    title: string
    body: string
    action?: () => void
    actionLabel: string
}) {
    return (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
            {action && (
                <Button className="mt-5" onClick={action}>
                    <Plus className="mr-1.5 h-4 w-4" /> {actionLabel}
                </Button>
            )}
        </div>
    )
}
