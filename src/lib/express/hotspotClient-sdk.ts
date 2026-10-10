// ~/lib/hotspot-client.ts
//
// Synchronous REST client for hotspot management.
// Calls the Express task server's /hotspots API directly —
// these are fast DB + cron operations, not long-running jobs.
//
// Auth: every call carries the shared task-server secret (taskServerHeaders).
// The caller (a tRPC procedure) must already have checked the user may manage
// creatorId; the route handlers then scope each query to it.
//
// Note: GET routes pass creatorId as a query param (no body on GET).
//       POST/DELETE routes pass creatorId in the JSON body.

import { taskServerHeaders, taskServerUrl } from "./server-url";



// ─── Response types ───────────────────────────────────────────────────────────

export interface HotspotSummary {
    id: string;
    isActive: boolean;
    dropEveryDays: number;
    pinDurationDays: number;
    hotspotStartDate: string;
    hotspotEndDate: string;
    shape: string;
    autoCollect: boolean;
    totalDrops: number;
    hasSchedule: boolean;
    nextRunTime?: string | null;
    createdAt: string;
}

export interface HotspotDetail extends HotspotSummary {
    locationGroups: unknown[];
}

export interface HotspotActionResult {
    ok: boolean;
    hotspotId: string;
    isActive?: boolean;
    error?: string;
}

export interface UpdateHotspotInput {
    hotspotStartDate?: string;
    hotspotEndDate?: string;
    dropEveryDays?: number;
    pinDurationDays?: number;
    autoCollect?: boolean;
    multiPin?: boolean;
    scope?: "future_drops" | "all_drops";
}

export interface CreateHotspotInput {
    title: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    dropEveryDays: number;
    pinDurationDays: number;
    hotspotStartDate: string;   // ISO datetime
    hotspotEndDate: string;     // ISO datetime
    pinNumber: number;
    pinCollectionLimit: number;
    autoCollect: boolean;
    multiPin?: boolean;
    hotspotShape: "circle" | "rectangle" | "polygon";
    geoJson?: unknown;
    token?: number;
    tier?: string;
    creatorId: string
}

// ─── Shared response handler ──────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Hotspot API error (${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const hotspotClient = {
    // ── Create ────────────────────────────────────────────────────────────────

    async create(
        creatorId: string,
        input: CreateHotspotInput
    ): Promise<{ hotspotId: string }> {
        const res = await fetch(`${taskServerUrl()}/hotspots`, {
            method: "POST",
            headers: taskServerHeaders(),
            body: JSON.stringify({ ...input, creatorId }),  // creatorId in body — ownership scoping
        });
        return handleResponse<{ hotspotId: string }>(res);
    },

    // ── Read (creatorId as query param — no body on GET) ──────────────────────

    async list(creatorId: string): Promise<{ hotspots: HotspotSummary[] }> {
        const url = `${taskServerUrl()}/hotspots?creatorId=${encodeURIComponent(creatorId)}`;
        const res = await fetch(url, { headers: taskServerHeaders() });
        return handleResponse<{ hotspots: HotspotSummary[] }>(res);
    },

    async get(creatorId: string, hotspotId: string): Promise<HotspotDetail> {
        const url = `${taskServerUrl()}/hotspots/${hotspotId}?creatorId=${encodeURIComponent(creatorId)}`;
        const res = await fetch(url, { headers: taskServerHeaders() });
        return handleResponse<HotspotDetail>(res);
    },

    // ── Schedule control (creatorId in body) ──────────────────────────────────

    async pause(creatorId: string, hotspotId: string): Promise<HotspotActionResult> {
        const res = await fetch(`${taskServerUrl()}/hotspots/${hotspotId}/pause`, {
            method: "POST",
            headers: taskServerHeaders(),
            body: JSON.stringify({ creatorId }),
        });
        return handleResponse<HotspotActionResult>(res);
    },

    async resume(creatorId: string, hotspotId: string): Promise<HotspotActionResult> {
        const res = await fetch(`${taskServerUrl()}/hotspots/${hotspotId}/resume`, {
            method: "POST",
            headers: taskServerHeaders(),
            body: JSON.stringify({ creatorId }),
        });
        return handleResponse<HotspotActionResult>(res);
    },

    /** Change schedule / collection settings; the task server reschedules if the timing changed. */
    async update(creatorId: string, hotspotId: string, input: UpdateHotspotInput): Promise<HotspotActionResult & { rescheduled: boolean }> {
        const res = await fetch(`${taskServerUrl()}/hotspots/${hotspotId}`, {
            method: "PATCH",
            headers: taskServerHeaders(),
            body: JSON.stringify({ creatorId, ...input }),
        });
        return handleResponse<HotspotActionResult & { rescheduled: boolean }>(res);
    },

    async delete(creatorId: string, hotspotId: string): Promise<HotspotActionResult> {
        const res = await fetch(`${taskServerUrl()}/hotspots/${hotspotId}`, {
            method: "DELETE",
            headers: taskServerHeaders(),
            body: JSON.stringify({ creatorId }),
        });
        return handleResponse<HotspotActionResult>(res);
    },

    /** Manually trigger one drop — for admin/debug use. */
    async triggerDrop(
        creatorId: string,
        hotspotId: string
    ): Promise<{ ok: boolean; result?: unknown; reason?: string }> {
        const res = await fetch(`${taskServerUrl()}/hotspots/${hotspotId}/drop`, {
            method: "POST",
            headers: taskServerHeaders(),
            body: JSON.stringify({ creatorId }),
        });
        return handleResponse<{ ok: boolean; result?: unknown; reason?: string }>(res);
    },
};