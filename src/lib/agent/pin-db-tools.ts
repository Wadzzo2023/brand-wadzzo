// ~/lib/agent/db-tools.ts

import { db } from "~/server/db"  // ← direct import
import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { qstash } from "../qstash"

// creatorId injected at factory time
// AI never sees or touches it

export const createDbTools = (creatorId: string) => {

    // ─── TOOL 1: query_pins ──────────────────
    const queryPins = tool(
        async ({ filter, search, area }) => {

            // Step 1 — fetch all pins with lat/lng
            const pins = await db.locationGroup.findMany({
                where: {
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
                            mode: "insensitive"
                        }
                    })
                },
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
                orderBy: { createdAt: "desc" }
            })

            // Step 2 — strip templates
            const templateIds = await getTemplateIds(creatorId)
            let filtered = pins.filter(p => !templateIds.has(p.id))

            // Step 3 — if area provided, geocode and filter
            if (area) {
                try {
                    // call Nominatim to get GeoJSON boundary
                    const geoRes = await fetch(
                        `https://nominatim.openstreetmap.org/search` +
                        `?q=${encodeURIComponent(area)}` +
                        `&format=geojson` +
                        `&polygon_geojson=1` +
                        `&limit=1`,
                        {
                            headers: {
                                // Nominatim requires a User-Agent
                                "User-Agent": "PinAgent/1.0"
                            }
                        }
                    )

                    const geoData = await geoRes.json() as GeoJSON.FeatureCollection
                    const feature = geoData?.features?.[0]

                    if (feature?.geometry) {
                        const { booleanPointInPolygon, point, polygon, multiPolygon } =
                            await import("@turf/turf")

                        // handle both Polygon and MultiPolygon
                        const boundary = feature.geometry.type === "MultiPolygon"
                            ? multiPolygon(feature.geometry.coordinates)
                            : polygon(feature.geometry.coordinates)

                        filtered = filtered.filter(pin => {
                            // skip pins with no coordinates
                            if (!pin.latitude || !pin.longitude) return false
                            const pt = point([pin.longitude, pin.latitude])
                            return booleanPointInPolygon(pt, boundary)
                        })
                    }
                } catch (err) {
                    console.error("[query_pins] geo filter failed:", err)
                    // if geocoding fails, return all pins unfiltered
                    // do not crash the tool
                }
            }

            return JSON.stringify(filtered)
        },
        {
            name: "query_pins",
            description:
                "Read creator pins from DB with filters. " +
                "Always call this before any write operation. " +
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
                area: z.string()          // ← add this
                    .optional()
                    .describe("city, country, neighborhood, district — any area name")
            })
        }
    )


    // ─── TOOL 2: query_hotspots ──────────────
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
                                },
                                // earliest = template
                                // title comes from template
                            }
                        }
                    })
                },
                include: {
                    locationGroups: {
                        orderBy: { createdAt: "asc" },
                        take: 1,   // template only for name
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
                displayName: h.locationGroups[0]?.title
                    ?? "Unnamed Hotspot",
                isActive: h.isActive,
                dropEveryDays: h.dropEveryDays,
                dropCount: h._count.locationGroups,
                qstashScheduleId: h.qstashScheduleId
            }))

            return JSON.stringify(mapped)
        },
        {
            name: "query_hotspots",
            description: "Read creator hotspots from DB.",
            schema: z.object({
                search: z.string().optional()
            })
        }
    )


    // ─── TOOL 3: query_analytics ─────────────
    const queryAnalytics = tool(
        async ({ locationGroupId }) => {

            const where = {
                location: {
                    locationGroup: {
                        creatorId,
                        ...(locationGroupId && {
                            id: locationGroupId
                        })
                    }
                }
            }

            // aggregate counts
            const [claimed, redeemed, pins] =
                await Promise.all([

                    db.locationConsumer.count({
                        where: {
                            ...where,
                            claimedAt: { not: null }
                        }
                    }),

                    db.locationConsumer.count({
                        where: {
                            ...where,
                            isRedeemed: true
                        }
                    }),

                    db.locationGroup.findMany({
                        where: {
                            creatorId,
                            hidden: false,
                            ...(locationGroupId && {
                                id: locationGroupId
                            })
                        },
                        select: {
                            id: true,
                            title: true,
                            startDate: true,
                            endDate: true,
                            limit: true,
                            remaining: true,
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
                        }
                    })
                ])

            // compute per pin stats
            const perPin = pins.map(p => {
                const allConsumers = p.locations
                    .flatMap(l => l.consumers)
                const pinClaimed = allConsumers
                    .filter(c => c.claimedAt).length
                const pinRedeemed = allConsumers
                    .filter(c => c.isRedeemed).length
                const claimRate = p.limit > 0
                    ? Math.round(pinClaimed / p.limit * 100)
                    : 0

                return {
                    id: p.id,
                    title: p.title,
                    claimed: pinClaimed,
                    redeemed: pinRedeemed,
                    limit: p.limit,
                    remaining: p.remaining,
                    claimRate: `${claimRate}%`
                }
            })

            return JSON.stringify({
                totalClaimed: claimed,
                totalRedeemed: redeemed,
                claimRate: pins.length > 0
                    ? `${Math.round(claimed /
                        pins.reduce((a, p) =>
                            a + p.limit, 0) * 100)}%`
                    : "0%",
                perPin
            })
        },
        {
            name: "query_analytics",
            description:
                "Get claim and redeem stats for pins. " +
                "Returns aggregates only, never individual " +
                "LocationConsumer records.",
            schema: z.object({
                locationGroupId: z.string()
                    .optional()
                    .describe("scope to single pin, " +
                        "or omit for all pins")
            })
        }
    )


    // ─── TOOL 4: query_collectors ────────────
    const queryCollectors = tool(
        async ({ locationGroupId, email }) => {

            const consumers =
                await db.locationConsumer.findMany({
                    where: {
                        location: {
                            locationGroup: {
                                id: locationGroupId,
                                creatorId   // ← always scoped
                            }
                        },
                        ...(email && {
                            user: { email }
                        })
                    },
                    select: {
                        claimedAt: true,
                        isRedeemed: true,
                        // redeemCode: NEVER
                        // userId: NEVER
                        // viewedAt: NEVER
                        user: {
                            select: {
                                name: true,
                                image: true,
                                email: true
                            }
                        }
                    }
                })

            return JSON.stringify(consumers)
        },
        {
            name: "query_collectors",
            description:
                "Get collector info for a specific pin. " +
                "Returns name, image, email, claimedAt, " +
                "isRedeemed only. Never redeemCode.",
            schema: z.object({
                locationGroupId: z.string(),
                email: z.string()
                    .optional()
                    .describe("filter by specific collector")
            })
        }
    )


    // ─── TOOL 5: edit_pins ───────────────────
    const editPins = tool(
        async ({ ids, fields }) => {

            // strip null fields — never overwrite with null
            const data = Object.fromEntries(
                Object.entries(fields)
                    .filter(([_, v]) => v !== null &&
                        v !== undefined)
            )

            if (Object.keys(data).length === 0) {
                return JSON.stringify({
                    ok: false,
                    error: "No fields to update"
                })
            }

            await db.locationGroup.updateMany({
                where: {
                    id: { in: ids },
                    creatorId   // ← always scoped
                },
                data
            })

            return JSON.stringify({
                ok: true,
                updated: ids.length
            })
        },
        {
            name: "edit_pins",
            description:
                "Update LocationGroup fields. " +
                "Only pass fields to change — " +
                "null/missing fields are preserved.",
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


    // ─── TOOL 6: delete_pins ─────────────────
    const deletePins = tool(
        async ({ ids }) => {

            // delete = hidden true, always
            await db.locationGroup.updateMany({
                where: {
                    id: { in: ids },
                    creatorId   // ← always scoped
                },
                data: { hidden: true }
                // child Locations → NOT touched
                // LocationConsumer → NEVER touched
            })

            return JSON.stringify({
                ok: true,
                hidden: ids.length
            })
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


    // ─── TOOL 7: delete_location ─────────────
    const deleteLocation = tool(
        async ({ locationId }) => {

            await db.location.updateMany({
                where: {
                    id: locationId,
                    locationGroup: { creatorId }  // ← scoped
                },
                data: { hidden: true }
                // siblings → NOT touched
                // LocationConsumer → NEVER touched
            })

            return JSON.stringify({ ok: true })
        },
        {
            name: "delete_location",
            description:
                "Hide a single Location point. " +
                "Sibling locations are unaffected.",
            schema: z.object({
                locationId: z.string()
            })
        }
    )


    // ─── TOOL 8: pause_hotspot ───────────────
    const pauseHotspot = tool(
        async ({ hotspotId }) => {

            const h = await db.hotspot.findFirst({
                where: { id: hotspotId, creatorId }
            })
            if (!h) return JSON.stringify({
                ok: false, error: "Not found"
            })

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
                "Pause hotspot schedule. " +
                "Stops future drops. " +
                "Existing LocationGroups unaffected.",
            schema: z.object({
                hotspotId: z.string()
            })
        }
    )


    // ─── TOOL 9: resume_hotspot ──────────────
    const resumeHotspot = tool(
        async ({ hotspotId }) => {

            const h = await db.hotspot.findFirst({
                where: { id: hotspotId, creatorId }
            })
            if (!h) return JSON.stringify({
                ok: false, error: "Not found"
            })

            // block if deleted (no schedule)
            if (!h.qstashScheduleId) {
                return JSON.stringify({
                    ok: false,
                    error: "Hotspot was deleted. " +
                        "Schedule permanently removed. " +
                        "Cannot resume."
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
            description:
                "Resume a paused hotspot schedule. " +
                "Fails if hotspot was deleted.",
            schema: z.object({
                hotspotId: z.string()
            })
        }
    )


    // ─── TOOL 10: delete_hotspot ─────────────
    const deleteHotspot = tool(
        async ({ hotspotId }) => {

            const h = await db.hotspot.findFirst({
                where: { id: hotspotId, creatorId }
            })
            if (!h) return JSON.stringify({
                ok: false, error: "Not found"
            })

            if (h.qstashScheduleId) {
                await qstash.schedules.pause({
                    schedule: h.qstashScheduleId
                }).catch(() => null)

                await qstash.schedules.delete(
                    h.qstashScheduleId
                ).catch(e =>
                    console.log("QStash delete failed:", e)
                )
            }

            // hide all linked LocationGroups
            await db.locationGroup.updateMany({
                where: { hotspotId },
                data: { hidden: true }
                // child Locations → NOT touched
                // LocationConsumer → NEVER touched
            })

            // keep Hotspot record, just deactivate
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
                "Hides all linked LocationGroups. " +
                "Hotspot record stays in DB.",
            schema: z.object({
                hotspotId: z.string()
            })
        }
    )


    // ─── return all tools ────────────────────
    return [
        queryPins,
        queryHotspots,
        queryAnalytics,
        queryCollectors,
        editPins,
        deletePins,
        deleteLocation,
        pauseHotspot,
        resumeHotspot,
        deleteHotspot
    ]
}


// ─── helper: find template ids ───────────────
async function getTemplateIds(
    creatorId: string
): Promise<Set<string>> {

    // template = earliest createdAt per hotspot
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