"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { Loader2, MessageCircle, Trash2, Users } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/shadcn/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/shadcn/ui/tabs"
import { api } from "~/utils/api"

type Target = { kind: "event" | "announcement"; id: string; title: string }

/**
 * Who's going (events only) and the public comment thread, with the brand's
 * power to remove comments from its own posts.
 */
export function EngagementDialog({
    target,
    initialTab = "comments",
    onOpenChange,
}: {
    target: Target | null
    initialTab?: "attendees" | "comments"
    onOpenChange: (open: boolean) => void
}) {
    return (
        <Dialog open={!!target} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden p-0">
                {target && (
                    <>
                        <DialogHeader className="border-b px-6 py-4">
                            <DialogTitle className="truncate pr-6">{target.title}</DialogTitle>
                            <DialogDescription>
                                {target.kind === "event" ? "RSVPs and comments" : "Comments"}
                            </DialogDescription>
                        </DialogHeader>
                        {target.kind === "event" ? (
                            <Tabs defaultValue={initialTab} className="px-6 pb-6">
                                <TabsList className="mt-4 grid w-full grid-cols-2">
                                    <TabsTrigger value="attendees">
                                        <Users className="mr-1.5 h-3.5 w-3.5" /> Going
                                    </TabsTrigger>
                                    <TabsTrigger value="comments">
                                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Comments
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent value="attendees">
                                    <Attendees eventId={target.id} />
                                </TabsContent>
                                <TabsContent value="comments">
                                    <Comments target={target} />
                                </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="px-6 pb-6 pt-4">
                                <Comments target={target} />
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

function Attendees({ eventId }: { eventId: string }) {
    const q = api.events.attendees.useQuery({ id: eventId })
    if (q.isLoading) return <Spinner />
    if (!q.data?.length) return <Empty text="No RSVPs yet." />
    return (
        <ul className="max-h-[55vh] divide-y overflow-y-auto">
            {q.data.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <Person name={r.user.name} image={r.user.image} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.user.name ?? "Anonymous"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(r.createdAt, { addSuffix: true })}
                    </span>
                </li>
            ))}
        </ul>
    )
}

function Comments({ target }: { target: Target }) {
    const utils = api.useUtils()
    const q = api.events.comments.useQuery({ kind: target.kind, id: target.id })
    const [confirm, setConfirm] = useState<string | null>(null)
    const remove = api.events.deleteComment.useMutation({
        onSuccess: () => {
            toast.success("Comment removed")
            setConfirm(null)
            void utils.events.comments.invalidate({ kind: target.kind, id: target.id })
            void utils.events.myEvents.invalidate()
            void utils.events.myAnnouncements.invalidate()
        },
        onError: (e) => toast.error(e.message),
    })

    if (q.isLoading) return <Spinner />
    if (!q.data?.length) return <Empty text="No comments yet." />
    return (
        <ul className="max-h-[55vh] space-y-4 overflow-y-auto pt-2">
            {q.data.map((c) => (
                <li key={c.id} className="flex gap-3">
                    <Person name={c.user.name} image={c.user.image} />
                    <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium">{c.user.name ?? "Anonymous"}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {formatDistanceToNowStrict(c.createdAt, { addSuffix: true })}
                            </span>
                            <button
                                onClick={() =>
                                    confirm === c.id
                                        ? remove.mutate({ kind: target.kind, commentId: c.id })
                                        : setConfirm(c.id)
                                }
                                onBlur={() => setConfirm(null)}
                                disabled={remove.isPending}
                                className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                {confirm === c.id && <span className="text-destructive">Remove?</span>}
                            </button>
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">{c.content}</p>
                    </div>
                </li>
            ))}
        </ul>
    )
}

function Person({ name, image }: { name: string | null; image: string | null }) {
    return (
        <Avatar className="h-8 w-8 shrink-0">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback className="text-xs">{(name ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
    )
}

const Spinner = () => (
    <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
)

const Empty = ({ text }: { text: string }) => <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>
