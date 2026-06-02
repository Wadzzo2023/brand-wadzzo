// server/api/routers/tag.ts
import { z } from "zod"
import { createTRPCRouter, creatorProcedure } from "../trpc"
import { TRPCError } from "@trpc/server"
import { env } from "~/env"

export const tagRouter = createTRPCRouter({
    // Get all tags created by the creator
    myTags: creatorProcedure
        .input(z.object({ creatorId: z.string().optional() }))
        .query(async ({ ctx, input }) => {
            const userId = input.creatorId ?? ctx.session.user.id
            return await ctx.db.locationTag.findMany({
                where: { creatorId: userId },
                orderBy: { label: "asc" },
            })
        }),

    // Create a new tag
    create: creatorProcedure
        .input(z.object({ label: z.string().min(1), creatorId: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            const userId = input.creatorId ?? ctx.session.user.id
            const name = input.label.toLowerCase().replace(/\s+/g, "-")
            return await ctx.db.locationTag.upsert({
                where: { name },
                create: { name, label: input.label, creatorId: userId },
                update: {},
            })
        }),

    // Delete a tag
    delete: creatorProcedure
        .input(z.object({ id: z.string(), creatorId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const userId = input.creatorId ?? ctx.session.user.id
            return await ctx.db.locationTag.delete({ where: { id: input.id, creatorId: userId } })
        }),

    // AI generate tags based on title + description + type
    aiGenerate: creatorProcedure
        .input(z.object({
            title: z.string(),
            description: z.string().optional(),
            type: z.string(),
            latitude: z.number(),
            longitude: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {

            // check DB cache first
            const cached = await ctx.db.locationTagCache.findUnique({
                where: { title: input.title },
            })
            if (cached) {
                console.log(`Cache hit for "${input.title}"`)
                return { tags: cached.tags }
            }

            // reverse geocode
            let locationContext = ""
            try {
                const geoRes = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${input.latitude}&lon=${input.longitude}&format=json&addressdetails=1&zoom=16`,
                    { headers: { "User-Agent": "YourAppName/1.0" } }
                )
                const geoData = await geoRes.json() as {
                    address?: {
                        neighbourhood?: string; suburb?: string
                        city?: string; town?: string
                        state?: string; country?: string
                        amenity?: string; leisure?: string; tourism?: string
                    }
                }
                const addr = geoData.address ?? {}
                locationContext = [
                    addr.amenity, addr.leisure, addr.tourism,
                    addr.neighbourhood ?? addr.suburb,
                    addr.city ?? addr.town,
                    addr.state, addr.country,
                ].filter(Boolean).join(", ")
            } catch { /* ignore */ }

            // OpenAI Responses API with web search
            const response = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-5.4-mini",
                    tools: [{ type: "web_search_preview" }],
                    input: `You are a location tagging expert for a map app.
Search the web to identify what this location pin really is.

Title: "${input.title}"
Coordinates: ${input.latitude}, ${input.longitude}
Address: ${locationContext || "unknown"}
Description: ${input.description?.trim() ?? "none"}
Type: ${input.type}

Generate exactly 7 search-optimized tags in this priority:
- ARTIST/CREATOR (thomas dambo, banksy)
- COLLECTION/SERIES (thomas dambo trolls)
- OBJECT TYPE (troll sculpture, fast food, coffee shop)
- THEME (outdoor art, family friendly, dining)
- LOCATION (city, state, country)

Return ONLY a valid JSON array of 7 strings.`,
                }),
            })

            if (!response.ok) {
                const err = await response.json() as { error: { message: string } }
                console.error("OpenAI error:", err)
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI tag generation failed" })
            }

            const data = await response.json() as {
                output: { type: string; content?: { type: string; text: string }[] }[]
            }

            const textContent = data.output
                .filter((o) => o.type === "message")
                .flatMap((o) => o.content ?? [])
                .filter((c) => c.type === "output_text")
                .map((c) => c.text)
                .join("")

            let tags: string[] = []
            try {
                const match = textContent.match(/\[[\s\S]*?\]/)
                if (match) {
                    tags = (JSON.parse(match[0]) as unknown[])
                        .map((t) => String(t).toLowerCase().trim())
                        .filter((t) => t.length > 0 && t.length < 50)
                }
            } catch {
                tags = textContent
                    .replace(/```json|```/g, "")
                    .split(/[\n,]+/)
                    .map((t) => t.replace(/^[-•*"'\[\]\s]+|["'\[\]\s]+$/g, "").toLowerCase().trim())
                    .filter((t) => t.length > 0 && t.length < 50)
            }

            const result = [...new Set(tags)].slice(0, 7)

            // save to DB cache
            await ctx.db.locationTagCache.create({
                data: { title: input.title, tags: result },
            })

            return { tags: result }
        }),
})