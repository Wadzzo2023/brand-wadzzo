"use client"

import { Code2, Copy, CopyPlus, Eye, Globe, MoreVertical, MousePointerClick, Pencil, Plus, Power, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation";
import { useState } from "react"
import toast from "react-hot-toast"
import { Badge } from "~/components/shadcn/ui/badge"
import { Button } from "~/components/shadcn/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/shadcn/ui/dropdown-menu"
import { scriptSnippet } from "~/lib/embed"
import { cn } from "~/lib/utils"
import { ConfirmDialog } from "~/ui/confirm-dialog"
import { EmptyState } from "~/ui/empty-state"
import { ErrorState } from "~/ui/error-state"
import { PageBody, PageHeader } from "~/ui/page-header"
import { Skeleton } from "~/ui/skeleton"
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
        <PageBody>
            <PageHeader
                eyebrow="Drops"
                title="Website Map"
                description="Put the Wadzzo map on your own website — a homepage hero, a visitors page, anywhere. Paste one snippet; settings you change here update the live map."
                actions={
                    <Button asChild>
                        <Link href="/embeds/new">
                            <Plus /> New map
                        </Link>
                    </Button>
                }
            />

            <div className="mt-6">
            {list.isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-48 rounded-xl" />
                    ))}
                </div>
            ) : list.isError ? (
                <ErrorState
                    message={
                        /MapEmbed|does not exist/i.test(list.error.message)
                            ? "The embed tables aren't in this database yet — run npx prisma db push."
                            : list.error.message
                    }
                    onRetry={() => void list.refetch()}
                />
            ) : !list.data?.length ? (
                <EmptyState
                    icon={Code2}
                    title="No website maps yet"
                    description="Create one, set where it opens and how it looks, then paste the snippet into your site. Visitors see every drop nearby and open them in Wadzzo."
                    action={
                        <Button asChild>
                            <Link href="/embeds/new">
                                <Plus /> Create your first map
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {list.data?.map((e) => (
                        <article
                            key={e.id}
                            className={cn("flex flex-col rounded-xl border bg-card p-4", !e.enabled && "opacity-75")}
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
                                        {e.enabled ? <Badge>Live</Badge> : <Badge variant="secondary">Off</Badge>}
                                        <Badge variant="outline" className="gap-1">
                                            <Globe className="h-3 w-3" />
                                            {e.allowedDomains.length ? e.allowedDomains.slice(0, 2).join(", ") + (e.allowedDomains.length > 2 ? ` +${e.allowedDomains.length - 2}` : "") : "Any website"}
                                        </Badge>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${e.name}`}>
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
                                    <Copy /> Copy snippet
                                </Button>
                                <Button className="flex-1" asChild>
                                    <Link href={`/embeds/${e.id}`}>
                                            <Pencil /> Edit
                                    </Link>
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            </div>

            <ConfirmDialog
                open={!!deleting}
                onOpenChange={(o) => !o && setDeleting(null)}
                title={`Delete “${deleting?.name ?? ""}”?`}
                description="Websites using this map will show “Map unavailable”, and its stats are removed. This can't be undone — to pause it instead, turn it off."
                busy={del.isPending}
                onConfirm={() => deleting && del.mutate({ id: deleting.id })}
            />
        </PageBody>
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
