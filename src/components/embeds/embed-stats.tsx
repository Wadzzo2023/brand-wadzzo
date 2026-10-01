"use client"

import { Loader2 } from "lucide-react"
import { useState } from "react"
import { cn } from "~/lib/utils"
import { api } from "~/utils/api"

const METRICS = [
    { key: "views", label: "Map views", hint: "Times the map loaded on a website" },
    { key: "pinTaps", label: "Pin taps", hint: "Visitors opened a drop's card" },
    { key: "openClicks", label: "Opened in Wadzzo", hint: "Visitors went on to Wadzzo" },
    { key: "eventsClicks", label: "Events button", hint: "Clicks on the events button" },
    { key: "bountiesClicks", label: "Bounties button", hint: "Clicks on the bounties button" },
] as const

/** Totals plus a day-by-day table (UTC days). Counts come from wadzzoAR. */
export function EmbedStats({ id }: { id: string }) {
    const [days, setDays] = useState<7 | 30 | 90>(30)
    const q = api.embeds.stats.useQuery({ id, days })

    if (q.isLoading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }
    if (q.isError) return <p className="p-6 text-sm text-destructive">{q.error.message}</p>

    const rows = q.data
    const total = (k: (typeof METRICS)[number]["key"]) => rows.reduce((s, r) => s + r[k], 0)
    const views = total("views")
    const taps = total("pinTaps")
    const opens = total("openClicks")

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">How the map is doing</h2>
                <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
                    {([7, 30, 90] as const).map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={cn("rounded-lg px-3 py-1 text-sm", days === d ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                        >
                            {d} days
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {METRICS.map((m) => (
                    <div key={m.key} className="rounded-2xl border bg-card p-4" title={m.hint}>
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{total(m.key).toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {views > 0 && (
                <p className="text-sm text-muted-foreground">
                    {Math.round((taps / views) * 100)}% of views led to a pin tap, and {taps ? Math.round((opens / taps) * 100) : 0}% of
                    pin taps went on to Wadzzo.
                </p>
            )}

            <div className="overflow-hidden rounded-2xl border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                            <th className="px-4 py-2 font-medium">Day (UTC)</th>
                            {METRICS.map((m) => (
                                <th key={m.key} className="px-4 py-2 text-right font-medium">
                                    {m.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {[...rows].reverse().map((r) => (
                            <tr key={r.day} className={cn(r.views === 0 && "text-muted-foreground")}>
                                <td className="px-4 py-2">{r.day}</td>
                                {METRICS.map((m) => (
                                    <td key={m.key} className="px-4 py-2 text-right tabular-nums">
                                        {r[m.key].toLocaleString()}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
