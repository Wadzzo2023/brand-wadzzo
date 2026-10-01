"use client"

import { Check, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"
import { Button } from "~/components/shadcn/ui/button"
import { type EmbedDraft, embedPageUrl, heroSnippet, iframeSnippet, scriptSnippet } from "~/lib/embed"

/**
 * The "Add to website" tab: the snippets, where to paste them on common site
 * builders, and what to check when the map doesn't show.
 */
export function EmbedInstall({ id, draft }: { id: string; draft: EmbedDraft }) {
    const [height, setHeight] = useState(520)
    return (
        <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
            <div>
                <h2 className="text-xl font-semibold">Add this map to your website</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Paste the snippet once. Anything you change in Settings later updates the live map — no website edit
                    needed.
                </p>
            </div>

            {!draft.enabled && (
                <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                    This map is turned off — websites will show &quot;Map unavailable&quot; until you turn it on in Settings.
                </p>
            )}

            <Step n={1} title="Copy the snippet">
                <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                    Map height
                    <input type="range" min={320} max={800} step={20} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
                    <span className="tabular-nums">{height}px</span>
                </label>
                <Code text={scriptSnippet(id, height)} />
                <p className="text-sm text-muted-foreground">
                    The map fills the box and resizes with the page. You can change the height with your own CSS later.
                </p>
            </Step>

            <Step n={2} title="Paste it where the map should appear">
                <p className="text-sm text-muted-foreground">
                    In your site&apos;s editor, add an <b>HTML</b> / <b>Embed code</b> / <b>Custom code</b> block and paste
                    the snippet into it. Publish the page.
                </p>
                <ul className="space-y-1.5 text-sm">
                    <Platform name="WordPress">Add a <b>Custom HTML</b> block (or a Code widget in Elementor).</Platform>
                    <Platform name="Squarespace">Add a <b>Code</b> block, set to HTML.</Platform>
                    <Platform name="Wix">Add <b>Embed Code → Embed HTML</b>, choose <b>Code</b>, paste the iframe snippet below.</Platform>
                    <Platform name="Google Sites">Insert <b>Embed → Embed code</b> and paste the iframe snippet below.</Platform>
                    <Platform name="Government CMS (CivicPlus, Granicus, Neapolitan Labs…)">
                        Many strip &lt;script&gt; tags — use the iframe snippet below, or send the snippet to your web vendor.
                    </Platform>
                </ul>
            </Step>

            <Step n={3} title="Check it on your site">
                <p className="text-sm text-muted-foreground">
                    Open the page. You should see the map with drops. If you don&apos;t, see Troubleshooting below.
                </p>
                <a href={embedPageUrl(id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    Open the map on its own <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </Step>

            <section className="space-y-3 rounded-2xl border p-5">
                <h3 className="font-semibold">If your site doesn&apos;t allow scripts: iframe snippet</h3>
                <Code text={iframeSnippet(id, height)} />
                <p className="text-sm text-muted-foreground">Keep <code>allow=&quot;geolocation&quot;</code> — the “Near me” button needs it.</p>
            </section>

            <section className="space-y-3 rounded-2xl border p-5">
                <h3 className="font-semibold">Example: the map as your homepage hero</h3>
                <p className="text-sm text-muted-foreground">
                    The map sits behind your heading. <code>pointer-events:none</code> on the text layer lets visitors still
                    drag and tap the map around it. Keep headings small and to one side so they don&apos;t cover drops — or
                    put them above the map instead.
                </p>
                <Code text={heroSnippet(id)} />
            </section>

            <section className="space-y-2 rounded-2xl border p-5">
                <h3 className="font-semibold">Troubleshooting</h3>
                <Trouble q="The box is empty or shows a “refused to connect” page">
                    The website isn&apos;t in <b>Websites allowed</b>
                    {draft.allowedDomains.length ? ` (currently: ${draft.allowedDomains.join(", ")})` : ""}. Add its domain in
                    Settings and save — no need to re-paste the snippet.
                </Trouble>
                <Trouble q="It says “Map unavailable”">The map is turned off or was deleted. Turn it on in Settings.</Trouble>
                <Trouble q="The map is only a thin strip">Give the box a height — the snippet sets one; your page CSS may be overriding it.</Trouble>
                <Trouble q="“Near me” says location is blocked">
                    The visitor declined location, the page isn&apos;t on https, or the iframe is missing <code>allow=&quot;geolocation&quot;</code>.
                </Trouble>
                <Trouble q="Scrolling the page zooms the map">Switch <b>Scrolling</b> to “Page scrolls” in Settings.</Trouble>
            </section>
        </div>
    )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
    return (
        <section className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {n}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
                <h3 className="pt-1 font-semibold">{title}</h3>
                {children}
            </div>
        </section>
    )
}

function Code({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <div className="relative">
            <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 pr-24 text-[12.5px] leading-relaxed text-emerald-300">{text}</pre>
            <Button
                size="sm"
                variant="secondary"
                className="absolute right-2 top-2"
                onClick={() =>
                    void navigator.clipboard.writeText(text).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                    })
                }
            >
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
            </Button>
        </div>
    )
}

function Platform({ name, children }: { name: string; children: React.ReactNode }) {
    return (
        <li className="rounded-lg bg-muted/50 px-3 py-2">
            <span className="font-medium">{name}:</span> <span className="text-muted-foreground">{children}</span>
        </li>
    )
}

function Trouble({ q, children }: { q: string; children: React.ReactNode }) {
    return (
        <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">{q}</summary>
            <p className="mt-1.5 text-muted-foreground">{children}</p>
        </details>
    )
}
