// ~/lib/agent/db-tools.ts

import { db } from "~/server/db"
import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { qstash } from "../qstash"

// creatorId injected at factory time
// AI never sees or touches it

// ─── Pagination helper ────────────────────────────────────────────────────────

function buildPagination(
    total: number,
    offset: number,
    limit: number,
    fetched: number
) {
    return {
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
        nextOffset: offset + limit < total ? offset + limit : null,
        showing: `${offset + 1}–${Math.min(offset + fetched, total)} of ${total}`,
    }
}

export const createDbTools = (creatorId: string) => {

    // ─── TOOL 1: query_pins ──────────────────────────────────────────────
    // Paginated. Returns slim projection + pagination envelope.
    const queryPins = tool(
        async ({ filter, search, area, limit = 10, offset = 0 }) => {

            const whereBase = {
                creatorId,
                hidden: false,
                ...(filter === "expired" && {
                    endDate: { lt: new Date() }
                }),
                ...(filter === "active" && {
                    endDate: { gte: new Date() }
                }),
                ...(search && {
                    title: {
                        contains: search,
                        mode: "insensitive" as const
                    }
                })
            }

            const [totalCount, pins] = await Promise.all([
                db.locationGroup.count({ where: whereBase }),
                db.locationGroup.findMany({
                    where: whereBase,
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        startDate: true,
                        endDate: true,
                        hotspotId: true,
                        createdAt: true,
                        latitude: true,
                        longitude: true,
                        radius: true,
                        limit: true,
                        remaining: true,
                        image: true,
                        link: true,
                        multiPin: true,
                        hidden: true,
                        locations: {
                            where: { hidden: false },
                            select: {
                                id: true,
                                latitude: true,
                                longitude: true,
                                autoCollect: true,
                                hidden: true,
                            }
                        }
                    },
                    orderBy: { createdAt: "desc" },
                    take: limit,
                    skip: offset,
                })
            ])

            // strip templates
            const templateIds = await getTemplateIds(creatorId)
            let filtered = pins.filter(p => !templateIds.has(p.id))

            // if area provided, geocode and filter
            if (area) {
                try {
                    const geoRes = await fetch(
                        `https://nominatim.openstreetmap.org/search` +
                        `?q=${encodeURIComponent(area)}` +
                        `&format=geojson` +
                        `&polygon_geojson=1` +
                        `&limit=1`,
                        { headers: { "User-Agent": "PinAgent/1.0" } }
                    )
                    const geoData = await geoRes.json() as GeoJSON.FeatureCollection
                    const feature = geoData?.features?.[0]
                    if (feature?.geometry) {
                        const { booleanPointInPolygon, point, polygon, multiPolygon } =
                            await import("@turf/turf")
                        const boundary = feature.geometry.type === "MultiPolygon"
                            ? multiPolygon(feature.geometry.coordinates)
                            : polygon(feature.geometry.coordinates)
                        filtered = filtered.filter(pin => {
                            if (!pin.latitude || !pin.longitude) return false
                            const pt = point([pin.longitude, pin.latitude])
                            return booleanPointInPolygon(pt, boundary)
                        })
                    }
                } catch (err) {
                    console.error("[query_pins] geo filter failed:", err)
                }
            }

            return JSON.stringify({
                pins: filtered,
                pagination: buildPagination(totalCount, offset, limit, filtered.length)
            })
        },
        {
            name: "query_pins",
            description:
                "Read creator pins from DB with filters and pagination. " +
                "Always call this before any write operation. " +
                "Default limit is 10. Use offset to paginate. " +
                "Response includes pagination.hasMore and pagination.nextOffset. " +
                "Pass area param for any location-based query " +
                "(city, country, neighborhood, district etc). " +
                "Tool handles geocoding internally.",
            schema: z.object({
                filter: z.enum([
                    "all",
                    "active",
                    "expired",
                    "fully_claimed",
                    "collection_disabled"
                ]).default("all"),
                search: z.string()
                    .optional()
                    .describe("fuzzy title search"),
                area: z.string()
                    .optional()
                    .describe("city, country, neighborhood, district — any area name"),
                limit: z.number().int().min(1).max(50).default(10)
                    .describe("pins per page, default 10"),
                offset: z.number().int().min(0).default(0)
                    .describe("skip N pins for pagination"),
            })
        }
    )


    // ─── TOOL 2: query_hotspots ──────────────────────────────────────────
    // Returns slim summary only — NO drops array to avoid context explosion.
    // Use query_hotspot_drops for paginated drops of a specific hotspot.
    const queryHotspots = tool(
        async ({ search }) => {

            const hotspots = await db.hotspot.findMany({
                where: {
                    creatorId,
                    ...(search && {
                        locationGroups: {
                            some: {
                                title: {
                                    contains: search,
                                    mode: "insensitive"
                                }
                            }
                        }
                    })
                },
                include: {
                    locationGroups: {
                        orderBy: { createdAt: "asc" },
                        take: 1,
                        select: {
                            title: true,
                            createdAt: true
                        }
                    },
                    _count: {
                        select: { locationGroups: true }
                    }
                }
            })

            const mapped = hotspots.map(h => ({
                id: h.id,
                displayName: h.locationGroups[0]?.title ?? "Unnamed Hotspot",
                isActive: h.isActive,
                dropEveryDays: h.dropEveryDays,
                dropCount: h._count.locationGroups,
                qstashScheduleId: h.qstashScheduleId
                // NOTE: no drops array — use query_hotspot_drops for that
            }))

            return JSON.stringify(mapped)
        },
        {
            name: "query_hotspots",
            description:
                "Read creator hotspots summary from DB. " +
                "Returns name, isActive, dropEveryDays, dropCount only. " +
                "NO drops/pins included — use query_hotspot_drops to get drops for a specific hotspot.",
            schema: z.object({
                search: z.string().optional()
            })
        }
    )


    // ─── TOOL 3: query_hotspot_drops ─────────────────────────────────────
    // Paginated drops for a specific hotspot. Separated from query_hotspots
    // to avoid sending hundreds of drops to the LLM at once.
    const queryHotspotDrops = tool(
        async ({ hotspotId, limit = 20, offset = 0 }) => {

            const templateIds = await getTemplateIds(creatorId)

            const [total, drops] = await Promise.all([
                db.locationGroup.count({
                    where: {
                        hotspotId,
                        creatorId,
                        hidden: false,
                    }
                }),
                db.locationGroup.findMany({
                    where: {
                        hotspotId,
                        creatorId,
                        hidden: false,
                    },
                    select: {
                        id: true,
                        title: true,
                        startDate: true,
                        endDate: true,
                        limit: true,
                        remaining: true,
                        createdAt: true,
                        locations: {
                            where: { hidden: false },
                            select: {
                                id: true,
                                latitude: true,
                                longitude: true,
                                autoCollect: true,
                                hidden: true,
                            }
                        }
                    },
                    orderBy: { createdAt: "desc" },
                    take: limit,
                    skip: offset,
                })
            ])

            // filter out template
            const filtered = drops.filter(d => !templateIds.has(d.id))

            return JSON.stringify({
                hotspotId,
                drops: filtered,
                pagination: buildPagination(total, offset, limit, filtered.length)
            })
        },
        {
            name: "query_hotspot_drops",
            description:
                "Get paginated drops (LocationGroups) for a specific hotspot. " +
                "Use after query_hotspots to drill into a hotspot's drops. " +
                "Templates are excluded automatically.",
            schema: z.object({
                hotspotId: z.string(),
                limit: z.number().int().min(1).max(50).default(20),
                offset: z.number().int().min(0).default(0),
            })
        }
    )


    // ─── TOOL 4: query_analytics_summary ─────────────────────────────────
    // Pure DB aggregates — O(1) regardless of pin count.
    // Use for: "overall stats", "how are my pins doing", "total claims",
    // "best performing pins". NEVER fetches all pins into memory.
    const queryAnalyticsSummary = tool(
        async () => {

            const [
                totalClaimed,
                totalRedeemed,
                totalPins,
                activePins,
                expiredPins,
                fullyClaimedPins,
                totalLimitAgg,
                topPerformers,
            ] = await Promise.all([

                db.locationConsumer.count({
                    where: {
                        location: {
                            locationGroup: { creatorId, hidden: false }
                        },
                        claimedAt: { not: null }
                    }
                }),

                db.locationConsumer.count({
                    where: {
                        location: {
                            locationGroup: { creatorId, hidden: false }
                        },
                        isRedeemed: true
                    }
                }),

                db.locationGroup.count({
                    where: { creatorId, hidden: false }
                }),

                db.locationGroup.count({
                    where: {
                        creatorId,
                        hidden: false,
                        endDate: { gte: new Date() },
                        remaining: { gt: 0 }
                    }
                }),

                db.locationGroup.count({
                    where: {
                        creatorId,
                        hidden: false,
                        endDate: { lt: new Date() }
                    }
                }),

                db.locationGroup.count({
                    where: {
                        creatorId,
                        hidden: false,
                        remaining: 0,
                        limit: { gt: 0 }
                    }
                }),

                db.locationGroup.aggregate({
                    where: { creatorId, hidden: false },
                    _sum: { limit: true }
                }),

                // top 5 by fewest remaining (most claimed proportionally)
                db.locationGroup.findMany({
                    where: {
                        creatorId,
                        hidden: false,
                        limit: { gt: 0 }
                    },
                    select: {
                        id: true,
                        title: true,
                        limit: true,
                        remaining: true,
                    },
                    orderBy: { remaining: "asc" },
                    take: 5,
                }),
            ])

            const totalLimitSum = totalLimitAgg._sum.limit ?? 0
            const claimRate = totalLimitSum > 0
                ? `${Math.round(totalClaimed / totalLimitSum * 100)}%`
                : "N/A"
            const redeemRate = totalClaimed > 0
                ? `${Math.round(totalRedeemed / totalClaimed * 100)}%`
                : "N/A"

            return JSON.stringify({
                summary: {
                    totalClaimed,
                    totalRedeemed,
                    claimRate,
                    redeemRate,
                    totalPins,
                    activePins,
                    expiredPins,
                    fullyClaimedPins,
                },
                topPerformers: topPerformers.map(p => ({
                    id: p.id,
                    title: p.title,
                    claimed: p.limit - p.remaining,
                    limit: p.limit,
                    remaining: p.remaining,
                    claimRate: p.limit > 0
                        ? `${Math.round((p.limit - p.remaining) / p.limit * 100)}%`
                        : "N/A"
                }))
            })
        },
        {
            name: "query_analytics_summary",
            description:
                "Get overall performance stats using pure DB aggregates. " +
                "Use for: overall stats, how are my pins doing, total claims, " +
                "best performing pins, generate report. " +
                "Fast — never fetches all pins into memory. " +
                "For paginated per-pin breakdown use query_analytics_detail.",
            schema: z.object({})
        }
    )


    // ─── TOOL 5: query_analytics_detail ──────────────────────────────────
    // Paginated per-pin breakdown. Use for "show all pin stats", "breakdown".
    const queryAnalyticsDetail = tool(
        async ({ limit = 10, offset = 0, sortBy = "claimRate", search }) => {

            const where = {
                creatorId,
                hidden: false,
                limit: { gt: 0 },
                ...(search && {
                    title: { contains: search, mode: "insensitive" as const }
                })
            }

            const [total, pins] = await Promise.all([
                db.locationGroup.count({ where }),
                db.locationGroup.findMany({
                    where,
                    select: {
                        id: true,
                        title: true,
                        limit: true,
                        remaining: true,
                        startDate: true,
                        endDate: true,
                        locations: {
                            select: {
                                consumers: {
                                    select: {
                                        claimedAt: true,
                                        isRedeemed: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: sortBy === "remaining"
                        ? { remaining: "asc" }
                        : { createdAt: "desc" },
                    take: limit,
                    skip: offset,
                })
            ])

            const perPin = pins.map(p => {
                const consumers = p.locations.flatMap(l => l.consumers)
                const claimed = consumers.filter(c => c.claimedAt).length
                const redeemed = consumers.filter(c => c.isRedeemed).length
                const claimRateNum = p.limit > 0
                    ? Math.round(claimed / p.limit * 100)
                    : 0
                return {
                    id: p.id,
                    title: p.title,
                    claimed,
                    redeemed,
                    limit: p.limit,
                    remaining: p.remaining,
                    claimRate: `${claimRateNum}%`,
                    claimRateNum,
                }
            })

            if (sortBy === "claimRate") {
                perPin.sort((a, b) => b.claimRateNum - a.claimRateNum)
            } else if (sortBy === "claimed") {
                perPin.sort((a, b) => b.claimed - a.claimed)
            } else if (sortBy === "redeemed") {
                perPin.sort((a, b) => b.redeemed - a.redeemed)
            }

            // strip internal sort key before sending to LLM
            const clean = perPin.map(({ claimRateNum: _, ...rest }) => rest)

            return JSON.stringify({
                perPin: clean,
                pagination: buildPagination(total, offset, limit, pins.length)
            })
        },
        {
            name: "query_analytics_detail",
            description:
                "Get paginated per-pin analytics breakdown. " +
                "Use for: show all pin stats, sort by performance, breakdown by pin. " +
                "sortBy options: claimRate | claimed | redeemed | remaining. " +
                "Default 10 pins per page. For overall totals use query_analytics_summary.",
            schema: z.object({
                limit: z.number().int().min(1).max(25).default(10),
                offset: z.number().int().min(0).default(0),
                sortBy: z.enum(["claimRate", "claimed", "redeemed", "remaining"])
                    .default("claimRate"),
                search: z.string().optional()
                    .describe("filter to specific pin by title")
            })
        }
    )


    // ─── TOOL 6: query_collector_report ──────────────────────────────────
    // Flexible collector report:
    //   email only          → single collector profile across all pins
    //   locationGroupId only → all collectors for that pin
    //   both                → single collector scoped to one pin
    //   neither             → all collectors across all pins, paginated
    const queryCollectorReport = tool(
        async ({ email, locationGroupId, limit = 10, offset = 0 }) => {

            const pinScope = locationGroupId
                ? { locationGroup: { id: locationGroupId, creatorId } }
                : { locationGroup: { creatorId } }

            const where = {
                location: pinScope,
                ...(email && { user: { email } })
            }

            const [total, consumers] = await Promise.all([
                db.locationConsumer.count({ where }),
                db.locationConsumer.findMany({
                    where,
                    select: {
                        claimedAt: true,
                        isRedeemed: true,
                        // redeemCode: NEVER
                        user: {
                            select: {
                                name: true,
                                email: true,
                                image: true,
                            }
                        },
                        location: {
                            select: {
                                locationGroup: {
                                    select: {
                                        id: true,
                                        title: true,
                                        startDate: true,
                                        endDate: true,
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { claimedAt: "desc" },
                    take: limit,
                    skip: offset,
                })
            ])

            const pagination = buildPagination(total, offset, limit, consumers.length)

            // single collector view
            if (email) {
                const collectorUser = consumers[0]?.user ?? null
                const collections = consumers.map(c => ({
                    pinId: c.location.locationGroup.id,
                    pinTitle: c.location.locationGroup.title,
                    pinStartDate: c.location.locationGroup.startDate,
                    pinEndDate: c.location.locationGroup.endDate,
                    claimedAt: c.claimedAt,
                    isRedeemed: c.isRedeemed,
                }))

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
                })
            }

            // all collectors view — group by user email
            const byCollector = new Map<string, {
                name: string
                email: string
                image: string | null
                collected: number
                redeemed: number
                lastClaimedAt: Date | null
            }>()

            for (const c of consumers) {
                const key = c.user.email
                const existing = byCollector.get(key)
                if (existing) {
                    existing.collected++
                    if (c.isRedeemed) existing.redeemed++
                    if (c.claimedAt && (!existing.lastClaimedAt || c.claimedAt > existing.lastClaimedAt)) {
                        existing.lastClaimedAt = c.claimedAt
                    }
                } else {
                    byCollector.set(key, {
                        name: c.user.name ?? "Unknown",
                        email: c.user.email,
                        image: c.user.image ?? null,
                        collected: 1,
                        redeemed: c.isRedeemed ? 1 : 0,
                        lastClaimedAt: c.claimedAt,
                    })
                }
            }

            return JSON.stringify({
                mode: "all_collectors",
                collectors: Array.from(byCollector.values()),
                pagination,
            })
        },
        {
            name: "query_collector_report",
            description:
                "Flexible collector report. " +
                "email only → single collector profile across all pins. " +
                "locationGroupId only → all collectors for that pin. " +
                "email + locationGroupId → single collector scoped to one pin. " +
                "neither → all collectors across all pins, paginated. " +
                "Never returns redeemCode.",
            schema: z.object({
                email: z.string().optional()
                    .describe("specific collector email — omit for all collectors"),
                locationGroupId: z.string().optional()
                    .describe("scope to one pin — omit for all pins"),
                limit: z.number().int().min(1).max(50).default(10),
                offset: z.number().int().min(0).default(0),
            })
        }
    )


    // ─── TOOL 7: edit_pins ───────────────────────────────────────────────
    const editPins = tool(
        async ({ ids, fields }) => {

            const data = Object.fromEntries(
                Object.entries(fields)
                    .filter(([_, v]) => v !== null && v !== undefined)
            )

            if (Object.keys(data).length === 0) {
                return JSON.stringify({ ok: false, error: "No fields to update" })
            }

            await db.locationGroup.updateMany({
                where: { id: { in: ids }, creatorId },
                data
            })

            return JSON.stringify({ ok: true, updated: ids.length })
        },
        {
            name: "edit_pins",
            description:
                "Update LocationGroup fields. " +
                "Only pass fields to change — null/missing fields are preserved.",
            schema: z.object({
                ids: z.array(z.string()),
                fields: z.object({
                    title: z.string().nullish(),
                    description: z.string().nullish(),
                    startDate: z.string().nullish(),
                    endDate: z.string().nullish(),
                    latitude: z.number().nullish(),
                    longitude: z.number().nullish(),
                    radius: z.number().nullish(),
                    image: z.string().nullish(),
                    link: z.string().nullish(),
                    multiPin: z.boolean().nullish()
                    // hidden → NEVER here, use delete_pins
                    // limit → NEVER
                    // remaining → NEVER
                })
            })
        }
    )

    const editLocation = tool(
        async ({ locationId, fields }) => {
            const clean = Object.fromEntries(
                Object.entries(fields).filter(([, v]) => v !== null && v !== undefined)
            )
            if (Object.keys(clean).length === 0)
                return JSON.stringify({ ok: false, error: "No fields to update" })

            await db.location.updateMany({
                where: {
                    id: locationId,
                    locationGroup: { creatorId } // ownership check
                },
                data: clean
            })
            return JSON.stringify({ ok: true })
        },
        {
            name: "edit_location",
            description:
                "Edit a single Location point (lat/lng/autoCollect/hidden). " +
                "Use locationId from the SYSTEM metadata in the user message — never guess it.",
            schema: z.object({
                locationId: z.string(),
                fields: z.object({
                    latitude: z.number().nullish(),
                    longitude: z.number().nullish(),
                    autoCollect: z.boolean().nullish(),
                    hidden: z.boolean().nullish(),
                })
            })
        }
    )
    // ─── TOOL 8: delete_pins ─────────────────────────────────────────────
    const deletePins = tool(
        async ({ ids }) => {

            await db.locationGroup.updateMany({
                where: { id: { in: ids }, creatorId },
                data: { hidden: true }
            })

            return JSON.stringify({ ok: true, hidden: ids.length })
        },
        {
            name: "delete_pins",
            description:
                "Hide LocationGroups by setting hidden=true. " +
                "This is the ONLY delete operation for pins. " +
                "Child Locations are hidden by parent rule.",
            schema: z.object({
                ids: z.array(z.string())
                    .describe("LocationGroup ids to hide")
            })
        }
    )


    // ─── TOOL 9: delete_location ─────────────────────────────────────────
    const deleteLocation = tool(
        async ({ locationId }) => {

            await db.location.updateMany({
                where: {
                    id: locationId,
                    locationGroup: { creatorId }
                },
                data: { hidden: true }
            })

            return JSON.stringify({ ok: true })
        },
        {
            name: "delete_location",
            description: "Hide a single Location point. Sibling locations are unaffected.",
            schema: z.object({ locationId: z.string() })
        }
    )


    // ─── TOOL 10: pause_hotspot ──────────────────────────────────────────
    const pauseHotspot = tool(
        async ({ hotspotId }) => {

            const h = await db.hotspot.findFirst({
                where: { id: hotspotId, creatorId }
            })
            if (!h) return JSON.stringify({ ok: false, error: "Not found" })

            if (h.qstashScheduleId) {
                await qstash.schedules.pause({
                    schedule: h.qstashScheduleId
                }).catch(() => null)
            }

            await db.hotspot.update({
                where: { id: hotspotId },
                data: { isActive: false }
            })

            return JSON.stringify({ ok: true })
        },
        {
            name: "pause_hotspot",
            description:
                "Pause hotspot schedule. Stops future drops. Existing LocationGroups unaffected.",
            schema: z.object({ hotspotId: z.string() })
        }
    )


    // ─── TOOL 11: resume_hotspot ─────────────────────────────────────────
    const resumeHotspot = tool(
        async ({ hotspotId }) => {

            const h = await db.hotspot.findFirst({
                where: { id: hotspotId, creatorId }
            })
            if (!h) return JSON.stringify({ ok: false, error: "Not found" })

            if (!h.qstashScheduleId) {
                return JSON.stringify({
                    ok: false,
                    error: "Hotspot was deleted. Schedule permanently removed. Cannot resume."
                })
            }

            await qstash.schedules.resume({
                schedule: h.qstashScheduleId
            }).catch(() => null)

            await db.hotspot.update({
                where: { id: hotspotId },
                data: { isActive: true }
            })

            return JSON.stringify({ ok: true })
        },
        {
            name: "resume_hotspot",
            description: "Resume a paused hotspot schedule. Fails if hotspot was deleted.",
            schema: z.object({ hotspotId: z.string() })
        }
    )


    // ─── TOOL 12: delete_hotspot ─────────────────────────────────────────
    const deleteHotspot = tool(
        async ({ hotspotId }) => {

            const h = await db.hotspot.findFirst({
                where: { id: hotspotId, creatorId }
            })
            if (!h) return JSON.stringify({ ok: false, error: "Not found" })

            if (h.qstashScheduleId) {
                await qstash.schedules.pause({
                    schedule: h.qstashScheduleId
                }).catch(() => null)
                await qstash.schedules.delete(h.qstashScheduleId)
                    .catch(e => console.log("QStash delete failed:", e))
            }

            await db.locationGroup.updateMany({
                where: { hotspotId },
                data: { hidden: true }
            })

            await db.hotspot.update({
                where: { id: hotspotId },
                data: { isActive: false }
            })

            return JSON.stringify({ ok: true })
        },
        {
            name: "delete_hotspot",
            description:
                "Delete a hotspot. Removes QStash schedule. " +
                "Hides all linked LocationGroups. Hotspot record stays in DB.",
            schema: z.object({ hotspotId: z.string() })
        }
    )


    // ─── return all tools ────────────────────────────────────────────────
    return [
        queryPins,
        queryHotspots,
        queryHotspotDrops,
        queryAnalyticsSummary,
        queryAnalyticsDetail,
        queryCollectorReport,
        editPins,
        editLocation,
        deletePins,
        deleteLocation,
        pauseHotspot,
        resumeHotspot,
        deleteHotspot,
    ]
}


// ─── helper: find template ids ───────────────────────────────────────────────
async function getTemplateIds(creatorId: string): Promise<Set<string>> {
    const hotspots = await db.hotspot.findMany({
        where: { creatorId },
        select: {
            locationGroups: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { id: true }
            }
        }
    })
    return new Set(
        hotspots
            .map(h => h.locationGroups[0]?.id)
            .filter(Boolean) as string[]
    )
}