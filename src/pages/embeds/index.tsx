"use client"

import { Code2, Copy, CopyPlus, Eye, Globe, MoreVertical, MousePointerClick, Pencil, Plus, Power, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/router"
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
import { scriptSnippet } from "~/lib/embed"
import { cn } from "~/lib/utils"
import { api } from "~/utils/api"

/**
 * ── /embeds ────────────────────────────────────────────────────────────────
 *
 * A brand's website maps: the Wadzzo map, configured here, pasted onto their
 * own site (a county homepage hero, a tourism page…) with one snippet. The map
 * itself is served by wadzzoAR; changes saved here go live without touching
 * the website.
 */
export default function EmbedsPage() {
    const router = useRouter()
    const utils = api.useUtils()
    const list = api.embeds.list.useQuery()
    const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)

    const refresh = () => void utils.embeds.list.invalidate()
    const duplicate = api.embeds.duplicate.useMutation({
        onSuccess: () => {
            toast.success("Duplicated")
            refresh()
        },
    })
    const setEnabled = api.embeds.setEnabled.useMutation({
        onSuccess: (r) => {
            toast.success(r.enabled ? "Map turned on" : "Map turned off — websites show 'Map unavailable'")
            refresh()
        },
    })
    const del = api.embeds.delete.useMutation({
        onSuccess: () => {
            toast.success("Deleted")
            setDeleting(null)
            refresh()
        },
        onError: (e) => toast.error(e.message),
    })

    const copy = (id: string) =>
        void navigator.clipboard.writeText(scriptSnippet(id)).then(() => toast.success("Snippet copied"))

    return (
        <div className="w-full space-y-6 overflow-y-auto p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Website Map</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        Put the Wadzzo map on your own website — a homepage hero, a visitors page, anywhere. Paste one
                        snippet; settings you change here update the live map.
                    </p>
                </div>
                <Button onClick={() => void router.push("/embeds/new")}>
                    <Plus className="mr-1.5 h-4 w-4" /> New map
                </Button>
            </div>

            {list.isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-48 rounded-2xl" />
                    ))}
                </div>
            ) : list.isError ? (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
                    <p className="font-medium text-destructive">Couldn&apos;t load your maps.</p>
                    <p className="mt-1 text-muted-foreground">{list.error.message}</p>
                    {/MapEmbed|does not exist/i.test(list.error.message) && (
                        <p className="mt-2 text-muted-foreground">
                            The embed tables aren&apos;t in this database yet — run <code>npx prisma db push</code>.
                        </p>
                    )}
                </div>
            ) : !list.data.length ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                        <Code2 className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="mt-4 font-semibold">No website maps yet</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        Create one, set where it opens and how it looks, then paste the snippet into your site. Visitors
                        see every drop nearby and open them in Wadzzo.
                    </p>
                    <Button className="mt-5" onClick={() => void router.push("/embeds/new")}>
                        <Plus className="mr-1.5 h-4 w-4" /> Create your first map
                    </Button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {list.data.map((e) => (
                        <article
                            key={e.id}
                            className={cn("flex flex-col rounded-2xl border bg-card p-4 shadow-sm", !e.enabled && "opacity-75")}
                        >
                            <div className="flex items-start gap-3">
                                <span
                                    className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border"
                                    style={{ background: e.accentColor }}
                                    aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                    <Link href={`/embeds/${e.id}`} className="block truncate font-semibold hover:underline">
                                        {e.name}
                                    </Link>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                        {e.enabled ? <Badge className="bg-green-600 hover:bg-green-600">Live</Badge> : <Badge variant="secondary">Off</Badge>}
                                        <Badge variant="outline" className="gap-1">
                                            <Globe className="h-3 w-3" />
                                            {e.allowedDomains.length ? e.allowedDomains.slice(0, 2).join(", ") + (e.allowedDomains.length > 2 ? ` +${e.allowedDomains.length - 2}` : "") : "Any website"}
                                        </Badge>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => void router.push(`/embeds/${e.id}`)}>
                                            <Pencil className="mr-2 h-4 w-4" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => copy(e.id)}>
                                            <Copy className="mr-2 h-4 w-4" /> Copy snippet
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => duplicate.mutate({ id: e.id })}>
                                            <CopyPlus className="mr-2 h-4 w-4" /> Duplicate
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setEnabled.mutate({ id: e.id, enabled: !e.enabled })}>
                                            <Power className="mr-2 h-4 w-4" /> {e.enabled ? "Turn off" : "Turn on"}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => setDeleting({ id: e.id, name: e.name })}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
                                <Stat icon={Eye} label="Views" week={e.last7.views} month={e.last30.views} />
                                <Stat icon={MousePointerClick} label="Pin taps" week={e.last7.pinTaps} month={e.last30.pinTaps} />
                                <Stat icon={Globe} label="Opened" week={e.last7.openClicks} month={e.last30.openClicks} />
                            </div>
                            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">last 7 days · 30 days in grey</p>

                            <div className="mt-auto flex gap-2 pt-4">
                                <Button variant="outline" className="flex-1" onClick={() => copy(e.id)}>
                                    <Copy className="mr-1.5 h-4 w-4" /> Copy snippet
                                </Button>
                                <Button className="flex-1" onClick={() => void router.push(`/embeds/${e.id}`)}>
                                    <Pencil className="mr-1.5 h-4 w-4" /> Edit
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Websites using this map will show &quot;Map unavailable&quot;, and its stats are removed. This
                            can&apos;t be undone — to pause it instead, turn it off.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(ev) => {
                                ev.preventDefault()
                                if (deleting) del.mutate({ id: deleting.id })
                            }}
                        >
                            {del.isLoading ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function Stat({ icon: Icon, label, week, month }: { icon: typeof Eye; label: string; week: number; month: number }) {
    return (
        <div>
            <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                <Icon className="h-3 w-3" /> {label}
            </p>
            <p className="text-lg font-semibold tabular-nums">{week.toLocaleString()}</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">{month.toLocaleString()}</p>
        </div>
    )
}
