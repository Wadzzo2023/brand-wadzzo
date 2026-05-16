// ~/lib/agent/pin-db-tools.ts

import { db } from "~/server/db"
import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { qstash } from "../qstash"

// ─── Pagination helper ────────────────────────────────────────────────────────

function buildPagination(total: number, offset: number, limit: number, fetched: number) {
    const loadedUpTo = offset + fetched;
    return {
        total,
        offset,
        limit,
        hasMore: loadedUpTo < total,
        nextOffset: loadedUpTo < total ? offset + limit : null,
        showing: `${offset + 1}–${loadedUpTo} of ${total}`,
    };
}

// ─── Template ID helper ───────────────────────────────────────────────────────

async function getTemplateIds(creatorId: string): Promise<Set<string>> {
    const hotspots = await db.hotspot.findMany({
        where: { creatorId },
        select: {
            locationGroups: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { id: true },
            },
        },
    });
    return new Set(
        hotspots.map(h => h.locationGroups[0]?.id).filter(Boolean) as string[]
    );
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export const createDbTools = (creatorId: string) => {

    // ── TOOL 1: query_pins_by_ids ──────────────────────────────────────────────
    const queryPinsById = tool(
        async ({ ids }) => {
            const pins = await db.locationGroup.findMany({
                where: { id: { in: ids }, creatorId, hidden: false },
                select: {
                    id: true, title: true, description: true,
                    startDate: true, endDate: true, hotspotId: true, createdAt: true,
                    latitude: true, longitude: true, radius: true,
                    limit: true, remaining: true, image: true, link: true,
                    multiPin: true, hidden: true,
                    locations: {
                        where: { hidden: false },
                        select: { id: true, latitude: true, longitude: true, autoCollect: true, hidden: true },
                    },
                },
            });
            return JSON.stringify({ pins });
        },
        {
            name: "query_pins_by_ids",
            description:
                "Fetch specific LocationGroups by their exact IDs. " +
                "Use when user message contains 'SYSTEM: locationGroupIds=...' — " +
                "parse the IDs from that suffix and call this tool directly.",
            schema: z.object({
                ids: z.array(z.string()).describe("LocationGroup ids to fetch"),
            }),
        }
    );

    // ── TOOL 2: query_pins ────────────────────────────────────────────────────
    const queryPins = tool(
        async ({ filter, search, area, limit, offset }) => {
            console.log("[query_pins] called with:", { filter, search, area, limit, offset });
            const _filter = filter ?? "all";
            const _limit = limit ?? 10;   // default 10 — load more shows at >10
            const _offset = offset ?? 0;

            const templateIds = await getTemplateIds(creatorId);
            const templateIdArray = Array.from(templateIds);

            const whereBase = {
                creatorId,
                hidden: false,
                approved: true,
                ...(templateIdArray.length > 0 && { NOT: { id: { in: templateIdArray } } }),
                ...(_filter === "expired" && { endDate: { lt: new Date() } }),
                ...(_filter === "active" && { endDate: { gte: new Date() } }),
                ...(search && { title: { contains: search, mode: "insensitive" as const } }),
            };

            const [totalCount, pins] = await Promise.all([
                db.locationGroup.count({ where: whereBase }),
                db.locationGroup.findMany({
                    where: whereBase,
                    select: {
                        id: true, title: true, description: true,
                        startDate: true, endDate: true, hotspotId: true, createdAt: true,
                        latitude: true, longitude: true, radius: true,
                        limit: true, remaining: true, image: true, link: true,
                        multiPin: true, hidden: true,
                        locations: {
                            where: { hidden: false },
                            select: { id: true, latitude: true, longitude: true, autoCollect: true, hidden: true },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: _limit,
                    skip: _offset,
                }),
            ]);




            return JSON.stringify({
                pins,
                pagination: buildPagination(totalCount, _offset, _limit, pins.length),
            });
        },
        {
            name: "query_pins",
            description:
                "Read creator pins from DB with filters and pagination. " +
                "Always call before any write operation. " +
                "Pass area for location-based queries — geocoding handled internally. " +
                "Default limit is 10. Load more button appears when total > 10.",
            schema: z.object({
                filter: z.enum(["all", "active", "expired", "fully_claimed", "collection_disabled"])
                    .describe("status filter, use 'all' for no filter"),
                search: z.string().nullable().describe("fuzzy title search, null for no search"),
                area: z.string().nullable().describe("city/country/district name, null for no geo filter"),
                limit: z.number().int().min(1).max(50).describe("pins per page, default 10"),
                offset: z.number().int().min(0).describe("skip N pins for pagination, use 0 for first page"),
            }),
        }
    );

    // ── TOOL 3: query_hotspots ────────────────────────────────────────────────
    const queryHotspots = tool(
        async ({ search, isActive, limit, offset }) => {
            const _limit = limit ?? 10;
            const _offset = offset ?? 0;

            const where = {
                creatorId,
                ...(isActive !== null && isActive !== undefined && { isActive }),
                ...(search && {
                    locationGroups: {
                        some: { title: { contains: search, mode: "insensitive" as const } },
                    },
                }),
            };

            const [total, hotspots] = await Promise.all([
                db.hotspot.count({ where }),
                db.hotspot.findMany({
                    where,
                    include: {
                        locationGroups: {
                            orderBy: { createdAt: "asc" },
                            take: 1,
                            select: { title: true, createdAt: true },
                        },
                        _count: { select: { locationGroups: true } },
                    },
                    take: _limit,
                    skip: _offset,
                }),
            ]);

            return JSON.stringify({
                hotspots: hotspots.map(h => ({
                    id: h.id,
                    displayName: h.locationGroups[0]?.title ?? "Unnamed Hotspot",
                    isActive: h.isActive,
                    dropEveryDays: h.dropEveryDays,
                    dropCount: h._count.locationGroups,
                    qstashScheduleId: h.qstashScheduleId,
                })),
                pagination: buildPagination(total, _offset, _limit, hotspots.length),
            });
        },
        {
            name: "query_hotspots",
            description:
                "Read creator hotspots. Supports isActive filter and pagination. " +
                "Use isActive=true for 'show active hotspots'. " +
                "Use limit to cap results e.g. 'show 5 hotspots'. " +
                "Use query_hotspot_drops to get drops for a specific hotspot.",
            schema: z.object({
                search: z.string().nullable().describe("title search, null for all hotspots"),
                isActive: z.boolean().nullable().describe("filter by active/paused, null for both"),
                limit: z.number().int().min(1).max(50).describe("hotspots per page, default 10"),
                offset: z.number().int().min(0).describe("skip N hotspots, use 0 for first page"),
            }),
        }
    );

    // ── TOOL 4: query_hotspot_drops ───────────────────────────────────────────
    const queryHotspotDrops = tool(
        async ({ hotspotId, limit, offset }) => {
            const _limit = limit ?? 10;
            const _offset = offset ?? 0;

            const templateIds = await getTemplateIds(creatorId);

            const [total, drops] = await Promise.all([
                db.locationGroup.count({ where: { hotspotId, creatorId, hidden: false } }),
                db.locationGroup.findMany({
                    where: { hotspotId, creatorId, hidden: false },
                    select: {
                        id: true, title: true, startDate: true, endDate: true,
                        limit: true, remaining: true, createdAt: true,
                        locations: {
                            where: { hidden: false },
                            select: { id: true, latitude: true, longitude: true, autoCollect: true, hidden: true },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: _limit,
                    skip: _offset,
                }),
            ]);

            const filtered = drops.filter(d => !templateIds.has(d.id));

            return JSON.stringify({
                hotspotId,
                drops: filtered,
                pagination: buildPagination(total, _offset, _limit, filtered.length),
            });
        },
        {
            name: "query_hotspot_drops",
            description:
                "Get paginated drops for a specific hotspot. Templates excluded automatically.",
            schema: z.object({
                hotspotId: z.string(),
                limit: z.number().int().min(1).max(50).describe("drops per page, default 10"),
                offset: z.number().int().min(0).describe("skip N drops, use 0 for first page"),
            }),
        }
    );

    // ── TOOL 5: query_analytics_summary ──────────────────────────────────────
    const queryAnalyticsSummary = tool(
        async () => {
            const [
                totalClaimed, totalRedeemed, totalPins,
                activePins, expiredPins, fullyClaimedPins,
                totalLimitAgg, topPerformers,
            ] = await Promise.all([
                db.locationConsumer.count({
                    where: { location: { locationGroup: { creatorId, hidden: false } }, claimedAt: { not: null } },
                }),
                db.locationConsumer.count({
                    where: { location: { locationGroup: { creatorId, hidden: false } }, isRedeemed: true },
                }),
                db.locationGroup.count({ where: { creatorId, hidden: false } }),
                db.locationGroup.count({
                    where: { creatorId, hidden: false, endDate: { gte: new Date() }, remaining: { gt: 0 } },
                }),
                db.locationGroup.count({
                    where: { creatorId, hidden: false, endDate: { lt: new Date() } },
                }),
                db.locationGroup.count({
                    where: { creatorId, hidden: false, remaining: 0, limit: { gt: 0 } },
                }),
                db.locationGroup.aggregate({
                    where: { creatorId, hidden: false },
                    _sum: { limit: true },
                }),
                db.locationGroup.findMany({
                    where: { creatorId, hidden: false, limit: { gt: 0 } },
                    select: { id: true, title: true, limit: true, remaining: true },
                    orderBy: { remaining: "asc" },
                    take: 5,
                }),
            ]);

            const totalLimitSum = totalLimitAgg._sum.limit ?? 0;
            const claimRate = totalLimitSum > 0 ? `${Math.round(totalClaimed / totalLimitSum * 100)}%` : "N/A";
            const redeemRate = totalClaimed > 0 ? `${Math.round(totalRedeemed / totalClaimed * 100)}%` : "N/A";

            return JSON.stringify({
                summary: { totalClaimed, totalRedeemed, claimRate, redeemRate, totalPins, activePins, expiredPins, fullyClaimedPins },
                topPerformers: topPerformers.map(p => ({
                    id: p.id, title: p.title,
                    claimed: p.limit - p.remaining,
                    limit: p.limit, remaining: p.remaining,
                    claimRate: p.limit > 0 ? `${Math.round((p.limit - p.remaining) / p.limit * 100)}%` : "N/A",
                })),
            });
        },
        {
            name: "query_analytics_summary",
            description:
                "Get overall performance stats using pure DB aggregates. Fast — never fetches all pins.",
            schema: z.object({}),
        }
    );

    // ── TOOL 6: query_analytics_detail ───────────────────────────────────────
    const queryAnalyticsDetail = tool(
        async ({ limit, offset, sortBy, search }) => {
            const _limit = limit ?? 10;
            const _offset = offset ?? 0;
            const _sortBy = sortBy ?? "claimRate";

            const where = {
                creatorId,
                hidden: false,
                approved: true,
                limit: { gt: 0 },
                ...(search && { title: { contains: search, mode: "insensitive" as const } }),
            };

            const [total, pins] = await Promise.all([
                db.locationGroup.count({ where }),
                db.locationGroup.findMany({
                    where,
                    select: {
                        id: true, title: true, limit: true, remaining: true,
                        startDate: true, endDate: true,
                        locations: {
                            select: { consumers: { select: { claimedAt: true, isRedeemed: true } } },
                        },
                    },
                    orderBy: _sortBy === "remaining" ? { remaining: "asc" } : { createdAt: "desc" },
                    take: _limit,
                    skip: _offset,
                }),
            ]);

            const perPin = pins.map(p => {
                const consumers = p.locations.flatMap(l => l.consumers);
                const claimed = consumers.filter(c => c.claimedAt).length;
                const redeemed = consumers.filter(c => c.isRedeemed).length;
                const claimRateNum = p.limit > 0 ? Math.round(claimed / p.limit * 100) : 0;
                return { id: p.id, title: p.title, claimed, redeemed, limit: p.limit, remaining: p.remaining, claimRate: `${claimRateNum}%`, claimRateNum };
            });

            if (_sortBy === "claimRate") perPin.sort((a, b) => b.claimRateNum - a.claimRateNum);
            else if (_sortBy === "claimed") perPin.sort((a, b) => b.claimed - a.claimed);
            else if (_sortBy === "redeemed") perPin.sort((a, b) => b.redeemed - a.redeemed);

            const clean = perPin.map(({ claimRateNum: _, ...rest }) => rest);

            return JSON.stringify({
                perPin: clean,
                pagination: buildPagination(total, _offset, _limit, pins.length),
            });
        },
        {
            name: "query_analytics_detail",
            description:
                "Get paginated per-pin analytics breakdown. " +
                "sortBy options: claimRate | claimed | redeemed | remaining.",
            schema: z.object({
                limit: z.number().int().min(1).max(25).describe("pins per page, default 10"),
                offset: z.number().int().min(0).describe("skip N pins, use 0 for first page"),
                sortBy: z.enum(["claimRate", "claimed", "redeemed", "remaining"]).describe("sort order"),
                search: z.string().nullable().describe("filter by pin title, null for all"),
            }),
        }
    );

    // ── TOOL 7: query_collector_report ────────────────────────────────────────
    const queryCollectorReport = tool(
        async ({ email, locationGroupId, limit, offset }) => {
            const _limit = limit ?? 10;
            const _offset = offset ?? 0;

            const pinScope = locationGroupId
                ? { locationGroup: { id: locationGroupId, creatorId } }
                : { locationGroup: { creatorId } };

            const where = {
                location: pinScope,
                ...(email && { user: { email } }),
            };

            const [total, consumers] = await Promise.all([
                db.locationConsumer.count({ where }),
                db.locationConsumer.findMany({
                    where,
                    select: {
                        claimedAt: true, isRedeemed: true,
                        user: { select: { name: true, email: true, image: true } },
                        location: {
                            select: {
                                locationGroup: {
                                    select: { id: true, title: true, startDate: true, endDate: true },
                                },
                            },
                        },
                    },
                    orderBy: { claimedAt: "desc" },
                    take: _limit,
                    skip: _offset,
                }),
            ]);

            const pagination = buildPagination(total, _offset, _limit, consumers.length);

            if (email) {
                const collectorUser = consumers[0]?.user ?? null;
                const collections = consumers.map(c => ({
                    pinId: c.location.locationGroup.id,
                    pinTitle: c.location.locationGroup.title,
                    pinStartDate: c.location.locationGroup.startDate,
                    pinEndDate: c.location.locationGroup.endDate,
                    claimedAt: c.claimedAt,
                    isRedeemed: c.isRedeemed,
                }));
                return JSON.stringify({
                    mode: "single_collector",
                    collector: {
                        name: collectorUser?.name ?? "Unknown",
                        email: collectorUser?.email ?? email,
                        image: collectorUser?.image ?? null,
                        totalCollected: total,
                        totalRedeemed: collections.filter(c => c.isRedeemed).length,
                    },
                    collections,
                    pagination,
                });
            }

            const byCollector = new Map<string, {
                name: string; email: string; image: string | null;
                collected: number; redeemed: number; lastClaimedAt: Date | null;
            }>();

            for (const c of consumers) {
                const key = c.user.email;
                const existing = byCollector.get(key);
                if (existing) {
                    existing.collected++;
                    if (c.isRedeemed) existing.redeemed++;
                    if (c.claimedAt && (!existing.lastClaimedAt || c.claimedAt > existing.lastClaimedAt))
                        existing.lastClaimedAt = c.claimedAt;
                } else {
                    byCollector.set(key, {
                        name: c.user.name ?? "Unknown",
                        email: c.user.email,
                        image: c.user.image ?? null,
                        collected: 1,
                        redeemed: c.isRedeemed ? 1 : 0,
                        lastClaimedAt: c.claimedAt,
                    });
                }
            }

            return JSON.stringify({
                mode: "all_collectors",
                collectors: Array.from(byCollector.values()),
                pagination,
            });
        },
        {
            name: "query_collector_report",
            description:
                "Flexible collector report. " +
                "email only → single collector across all pins. " +
                "locationGroupId only → all collectors for that pin. " +
                "both → single collector on one pin. " +
                "neither → all collectors paginated. " +
                "Never returns redeemCode.",
            schema: z.object({
                email: z.string().nullable().describe("collector email for single-collector view, null for all"),
                locationGroupId: z.string().nullable().describe("scope to one pin, null for all pins"),
                limit: z.number().int().min(1).max(50).describe("results per page, default 10"),
                offset: z.number().int().min(0).describe("skip N results, use 0 for first page"),
            }),
        }
    );

    // ── TOOL 8: edit_pins ─────────────────────────────────────────────────────
    const editPins = tool(
        async ({ ids, fields }) => {
            const data = Object.fromEntries(
                Object.entries(fields).filter(([, v]) => v !== null && v !== undefined)
            );
            if (Object.keys(data).length === 0)
                return JSON.stringify({ ok: false, error: "No fields to update" });

            await db.locationGroup.updateMany({ where: { id: { in: ids }, creatorId }, data });
            return JSON.stringify({ ok: true, updated: ids.length });
        },
        {
            name: "edit_pins",
            description: "Update LocationGroup fields. Only non-null fields are applied.",
            schema: z.object({
                ids: z.array(z.string()),
                fields: z.object({
                    title: z.string().nullable(),
                    description: z.string().nullable(),
                    startDate: z.string().nullable(),
                    endDate: z.string().nullable(),
                    latitude: z.number().nullable(),
                    longitude: z.number().nullable(),
                    radius: z.number().nullable(),
                    image: z.string().nullable(),
                    link: z.string().nullable(),
                    multiPin: z.boolean().nullable(),
                }),
            }),
        }
    );

    // ── TOOL 9: edit_hotspot ──────────────────────────────────────────────────
    const editHotspot = tool(
        async ({ hotspotId, fields }) => {
            const h = await db.hotspot.findFirst({ where: { id: hotspotId, creatorId } });
            if (!h) return JSON.stringify({ ok: false, error: "Hotspot not found" });

            const data = Object.fromEntries(
                Object.entries(fields).filter(([, v]) => v !== null && v !== undefined)
            );
            if (Object.keys(data).length === 0)
                return JSON.stringify({ ok: false, error: "No fields to update" });

            await db.hotspot.update({ where: { id: hotspotId }, data });

            // cascade autoCollect to all linked locations
            if (fields.autoCollect !== null && fields.autoCollect !== undefined) {
                await db.location.updateMany({
                    where: { locationGroup: { hotspotId, creatorId } },
                    data: { autoCollect: fields.autoCollect },
                });
            }

            // cascade multiPin to all linked locationGroups
            if (fields.multiPin !== null && fields.multiPin !== undefined) {
                await db.locationGroup.updateMany({
                    where: { hotspotId, creatorId },
                    data: { multiPin: fields.multiPin },
                });
            }

            return JSON.stringify({ ok: true });
        },
        {
            name: "edit_hotspot",
            description:
                "Update hotspot-level fields. autoCollect cascades to all linked Locations. " +
                "multiPin cascades to all linked LocationGroups.",
            schema: z.object({
                hotspotId: z.string(),
                fields: z.object({
                    autoCollect: z.boolean().nullable(),
                    multiPin: z.boolean().nullable(),
                    dropEveryDays: z.number().int().nullable(),
                    pinDurationDays: z.number().int().nullable(),
                    hotspotStartDate: z.string().nullable(),
                    hotspotEndDate: z.string().nullable(),
                    isActive: z.boolean().nullable(),
                }),
            }),
        }
    );

    // ── TOOL 10: edit_location ────────────────────────────────────────────────
    const editLocation = tool(
        async ({ locationId, fields }) => {
            const clean = Object.fromEntries(
                Object.entries(fields).filter(([, v]) => v !== null && v !== undefined)
            );
            if (Object.keys(clean).length === 0)
                return JSON.stringify({ ok: false, error: "No fields to update" });

            await db.location.updateMany({
                where: { id: locationId, locationGroup: { creatorId } },
                data: clean,
            });
            return JSON.stringify({ ok: true });
        },
        {
            name: "edit_location",
            description: "Edit a single Location point (lat/lng/autoCollect/hidden).",
            schema: z.object({
                locationId: z.string(),
                fields: z.object({
                    latitude: z.number().nullable(),
                    longitude: z.number().nullable(),
                    autoCollect: z.boolean().nullable(),
                    hidden: z.boolean().nullable(),
                }),
            }),
        }
    );

    // ── TOOL 11: delete_pins ──────────────────────────────────────────────────
    const deletePins = tool(
        async ({ ids }) => {
            await db.locationGroup.updateMany({
                where: { id: { in: ids }, creatorId },
                data: { hidden: true },
            });
            return JSON.stringify({ ok: true, hidden: ids.length });
        },
        {
            name: "delete_pins",
            description: "Hide LocationGroups by setting hidden=true. The only delete operation for pins.",
            schema: z.object({
                ids: z.array(z.string()).describe("LocationGroup ids to hide"),
            }),
        }
    );

    // ── TOOL 12: delete_location ──────────────────────────────────────────────
    const deleteLocation = tool(
        async ({ locationId }) => {
            await db.location.updateMany({
                where: { id: locationId, locationGroup: { creatorId } },
                data: { hidden: true },
            });
            return JSON.stringify({ ok: true });
        },
        {
            name: "delete_location",
            description: "Hide a single Location point. Sibling locations are unaffected.",
            schema: z.object({ locationId: z.string() }),
        }
    );

    // ── TOOL 13: pause_hotspot ────────────────────────────────────────────────
    const pauseHotspot = tool(
        async ({ hotspotId }) => {
            const h = await db.hotspot.findFirst({ where: { id: hotspotId, creatorId } });
            if (!h) return JSON.stringify({ ok: false, error: "Not found" });

            if (h.qstashScheduleId)
                await qstash.schedules.pause({ schedule: h.qstashScheduleId }).catch(() => null);

            await db.hotspot.update({ where: { id: hotspotId }, data: { isActive: false } });
            return JSON.stringify({ ok: true });
        },
        {
            name: "pause_hotspot",
            description: "Pause hotspot schedule. Stops future drops. Existing pins unaffected.",
            schema: z.object({ hotspotId: z.string() }),
        }
    );

    // ── TOOL 14: resume_hotspot ───────────────────────────────────────────────
    const resumeHotspot = tool(
        async ({ hotspotId }) => {
            const h = await db.hotspot.findFirst({ where: { id: hotspotId, creatorId } });
            if (!h) return JSON.stringify({ ok: false, error: "Not found" });
            if (!h.qstashScheduleId)
                return JSON.stringify({ ok: false, error: "Schedule permanently removed. Cannot resume." });

            await qstash.schedules.resume({ schedule: h.qstashScheduleId }).catch(() => null);
            await db.hotspot.update({ where: { id: hotspotId }, data: { isActive: true } });
            return JSON.stringify({ ok: true });
        },
        {
            name: "resume_hotspot",
            description: "Resume a paused hotspot schedule. Fails if hotspot was deleted.",
            schema: z.object({ hotspotId: z.string() }),
        }
    );

    // ── TOOL 15: delete_hotspot ───────────────────────────────────────────────
    const deleteHotspot = tool(
        async ({ hotspotId }) => {
            const h = await db.hotspot.findFirst({ where: { id: hotspotId, creatorId } });
            if (!h) return JSON.stringify({ ok: false, error: "Not found" });

            if (h.qstashScheduleId) {
                await qstash.schedules.pause({ schedule: h.qstashScheduleId }).catch(() => null);
                await qstash.schedules.delete(h.qstashScheduleId).catch(e => console.log("QStash delete failed:", e));
            }

            await db.locationGroup.updateMany({ where: { hotspotId }, data: { hidden: true } });
            await db.hotspot.update({ where: { id: hotspotId }, data: { isActive: false } });
            return JSON.stringify({ ok: true });
        },
        {
            name: "delete_hotspot",
            description:
                "Delete a hotspot. Removes QStash schedule and hides all linked LocationGroups.",
            schema: z.object({ hotspotId: z.string() }),
        }
    );

    return [
        queryPinsById,
        queryPins,
        queryHotspots,
        queryHotspotDrops,
        queryAnalyticsSummary,
        queryAnalyticsDetail,
        queryCollectorReport,
        editPins,
        editHotspot,
        editLocation,
        deletePins,
        deleteLocation,
        pauseHotspot,
        resumeHotspot,
        deleteHotspot,
    ];
};