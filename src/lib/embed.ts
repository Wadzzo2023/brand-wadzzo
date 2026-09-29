import type { EmbedGesture, EmbedPinSource, EmbedTheme, PinType } from "@prisma/client"

/**
 * Where the embedded map is served from — wadzzoAR (web.wadzzo.com), not this
 * app. NEXT_PUBLIC_WADZZO_AR_URL sets it per environment; the fallback keeps
 * production snippets pointing at the real host even if the variable is missing.
 */
export const WADZZO_AR_URL = (
    process.env.NEXT_PUBLIC_WADZZO_AR_URL ??
    (process.env.NODE_ENV === "production" ? "https://web.wadzzo.com" : "http://localhost:3000")
).replace(/\/$/, "")

export interface EmbedDraft {
    name: string
    enabled: boolean
    centerLat: number
    centerLng: number
    zoom: number
    userLocation: boolean
    gestureMode: EmbedGesture
    theme: EmbedTheme
    accentColor: string
    pinSource: EmbedPinSource
    pinTypes: PinType[]
    showFilterChips: boolean
    showSearch: boolean
    showNearby: boolean
    eventsLabel: string
    eventsUrl: string | null
    bountiesLabel: string
    bountiesUrl: string | null
    allowedDomains: string[]
}

export const DEFAULT_DRAFT: EmbedDraft = {
    name: "Website map",
    enabled: true,
    centerLat: 39.5,
    centerLng: -98.35,
    zoom: 3.5,
    userLocation: false,
    gestureMode: "COOPERATIVE",
    theme: "AUTO",
    accentColor: "#39ff88",
    pinSource: "ALL",
    pinTypes: [],
    showFilterChips: false,
    showSearch: true,
    showNearby: true,
    eventsLabel: "Find Events",
    eventsUrl: `${WADZZO_AR_URL}/events`,
    bountiesLabel: "View Bounties",
    bountiesUrl: `${WADZZO_AR_URL}/bounty`,
    allowedDomains: [],
}

/**
 * The editor's unsaved settings, as the `c` param wadzzoAR's preview reads.
 * `creatorId` is the brand whose pins "Only my brand" shows.
 */
export function previewUrl(draft: EmbedDraft, creatorId: string | null) {
    const json = JSON.stringify({ ...draft, creatorId })
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    return `${WADZZO_AR_URL}/embed/preview?c=${b64}`
}

export const embedPageUrl = (id: string) => `${WADZZO_AR_URL}/embed/${id}`

export const scriptSnippet = (id: string, height = 520) =>
    `<div data-wadzzo-embed="${id}" style="height:${height}px"></div>\n<script async src="${WADZZO_AR_URL}/embed.js"></script>`

export const iframeSnippet = (id: string, height = 520) =>
    `<iframe src="${embedPageUrl(id)}" title="Wadzzo map" width="100%" height="${height}" style="border:0;display:block" loading="lazy" allow="geolocation"></iframe>`

/** A hero section with the map behind the page's own heading and buttons. */
export const heroSnippet = (id: string) => `<section style="position:relative;height:560px;overflow:hidden">
  <div data-wadzzo-embed="${id}" style="position:absolute;inset:0"></div>
  <div style="position:relative;z-index:1;pointer-events:none;padding:48px">
    <h1 style="pointer-events:auto">Explore our county</h1>
  </div>
</section>
<script async src="${WADZZO_AR_URL}/embed.js"></script>`

export const PIN_TYPE_LABEL: Record<PinType, string> = {
    EVENT: "Events",
    LANDMARK: "Landmarks",
    EXPERIENCE: "Experiences",
    LAUNCH: "Launches",
    BOUNTY: "Bounties",
    OTHER: "Other",
}
