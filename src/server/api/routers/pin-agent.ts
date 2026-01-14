import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { db } from "~/server/db"
import type { Prisma } from "@prisma/client"
import { env } from "~/env"

// Schema for chat messages
const chatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
})

const chatInputSchema = z.object({
    message: z.string().min(1, "Message cannot be empty"),
    conversationHistory: z.array(chatMessageSchema).optional(),
    pinIds: z.array(z.string()).optional(),
})

const enhanceDescriptionSchema = z.object({
    description: z.string().min(1, "Description cannot be empty"),
})

async function formatPinDataForAnalysis(creatorId: string, pinIds?: string[]) {
    const whereClause: Prisma.LocationGroupWhereInput = {
        creatorId,
        ...(pinIds && pinIds.length > 0 && { id: { in: pinIds } }),
    }

    // Get recent pins from LocationGroup
    const pins = await db.locationGroup.findMany({
        where: whereClause,
        select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            type: true,
            multiPin: true,
            locations: {
                select: {
                    id: true,
                    latitude: true,
                    longitude: true,
                    autoCollect: true,
                    consumers: {
                        select: {
                            id: true,
                            userId: true,
                            claimedAt: true,
                            viewedAt: true,
                            createdAt: true,
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
        take: pinIds ? pinIds.length : 50,
    })

    if (pins.length === 0) {
        return null
    }

    // Format data for AI analysis with collection insights
    const formattedData = pins.map((pin) => {
        const allConsumers = pin.locations.flatMap((loc) => loc.consumers)
        const claimedCount = allConsumers.filter((c) => c.claimedAt).length
        const viewedCount = allConsumers.filter((c) => c.viewedAt).length
        const uniqueUsers = new Set(allConsumers.map((c) => c.userId)).size

        // Calculate collection timeline
        const collectionTimeline = allConsumers
            .filter((c) => c.claimedAt)
            .sort((a, b) => new Date(a.claimedAt!).getTime() - new Date(b.claimedAt!).getTime())
            .map((c) => new Date(c.claimedAt!).toISOString())

        return {
            id: pin.id,
            title: pin.title,
            description: pin.description,
            type: pin.type,
            locations: pin.locations.map((loc) => ({
                latitude: loc.latitude,
                longitude: loc.longitude,
                autoCollect: loc.autoCollect,
            })),
            timeline: {
                start: pin.startDate.toISOString(),
                end: pin.endDate.toISOString(),
                active: new Date() < pin.endDate,
            },
            collection: {
                totalClaims: claimedCount,
                totalViews: viewedCount,
                uniqueCollectors: uniqueUsers,
                claimedPercentage: allConsumers.length > 0 ? ((claimedCount / allConsumers.length) * 100).toFixed(2) : 0,
                collectionTimeline,
            },
            multiPin: pin.multiPin,
        }
    })

    return formattedData
}

// Helper function to build system prompt for pin analysis
function buildSystemPrompt(userMessage: string) {
    const isDetailedRequest = /analysis|trend|pattern|insight|predict|comprehensive|detailed|full report/i.test(
        userMessage,
    )

    const basePrompt = `You are an expert data analyst specializing in pin collection campaigns and location-based marketing. You help creators understand their pin collection data and provide strategic insights.

You can help with:
- Consumption patterns - when, where, and how frequently pins are being collected
- Performance trends - which pins excel, collection velocity, claim vs view ratios
- Consumer insights - engagement patterns, repeat collectors, geographic hotspots
- Predictions - forecast future collection trends and optimal campaign timing

Respond naturally and only provide the information requested. Keep responses concise unless asked for detailed analysis.`

    const detailedPrompt = `${basePrompt}

When the user asks for comprehensive analysis, structure your response with clear sections:
- **Consumption Patterns** - when, where, and frequency of collections
- **Performance Trends** - pin performance, collection velocity, metrics
- **Consumer Insights** - engagement patterns, behavior analysis
- **Predictions** - forecasts and recommendations

Provide clear, actionable insights with specific numbers and percentages.`

    return isDetailedRequest ? detailedPrompt : basePrompt
}

export const pinAgentRouter = createTRPCRouter({
    enhanceDescription: creatorProcedure
        .input(enhanceDescriptionSchema)
        .mutation(async ({ input }) => {
            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "system",
                                content: `You are an expert copywriter specializing in creating engaging and compelling descriptions . 
Your task is to enhance user-provided descriptions within 50-100 words by:
- Making them more engaging and descriptive
- Adding relevant details that would interest collectors
- Keeping them concise but impactful
- Maintaining the original intent and meaning
- Using active voice and compelling language

Return ONLY the enhanced description, nothing else.`,
                            },
                            {
                                role: "user",
                                content: `Please enhance this pin description:\n\n"${input.description}"`,
                            },
                        ],
                        temperature: 0.7,
                        max_tokens: 300,
                    }),
                })

                if (!response.ok) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const error = await response.json()
                    console.error("OpenAI API error:", error)
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Failed to enhance description",
                    })
                }

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const data = await response.json()
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const enhancedDescription = data.choices[0]?.message?.content as string

                if (!enhancedDescription) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "No response from AI",
                    })
                }

                return {
                    enhancedDescription: enhancedDescription.trim(),
                }
            } catch (error) {
                if (error instanceof TRPCError) throw error
                console.error("Description enhancement error:", error)
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to enhance description",
                })
            }
        }),

    analyzePin: creatorProcedure.input(chatInputSchema).mutation(async ({ ctx, input }) => {
        console.log("Starting pin analysis for creator:", input.pinIds)
        try {
            // Get pin data from LocationGroup
            const pinData = await formatPinDataForAnalysis(ctx.session.user.id, input.pinIds)

            if (!pinData) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No pins found for analysis",
                })
            }

            // Build conversation for OpenAI
            const conversationHistory = input.conversationHistory ?? []

            // Add user message with pin data context
            const messages = [
                ...conversationHistory.map((msg) => ({
                    role: msg.role as "user" | "assistant",
                    content: msg.content,
                })),
                {
                    role: "user" as const,
                    content: `${input.message}\n\nPin Collection Data:\n${JSON.stringify(pinData, null, 2)}`,
                },
            ]

            // Call OpenAI API with GPT-4o
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: buildSystemPrompt(input.message),
                        },
                        ...messages,
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                }),
            })

            if (!response.ok) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const error = await response.json()
                console.error("OpenAI API error:", error)
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to analyze pins with AI",
                })
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const data = await response.json()
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const assistantMessage = data.choices[0]?.message?.content

            if (!assistantMessage) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "No response from AI",
                })
            }

            return {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                response: assistantMessage,
                pinsAnalyzed: pinData.length,
            }
        } catch (error) {
            if (error instanceof TRPCError) throw error
            console.error("Chat analysis error:", error)
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to analyze pins",
            })
        }
    }),

    getCreatorPins: creatorProcedure.query(async ({ ctx }) => {
        const pins = await ctx.db.locationGroup.findMany({
            where: {
                creatorId: ctx.session.user.id,
            },
            select: {
                id: true,
                title: true,
                description: true,
                type: true,
                startDate: true,
                endDate: true,
                locations: {
                    select: {
                        consumers: {
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        })

        return pins.map((pin) => {
            const totalConsumers = pin.locations.reduce((sum, loc) => sum + loc.consumers.length, 0)

            return {
                id: pin.id,
                title: pin.title,
                description: pin.description,
                type: pin.type,
                active: new Date() < pin.endDate,
                totalCollections: totalConsumers,
            }
        })
    }),
})
