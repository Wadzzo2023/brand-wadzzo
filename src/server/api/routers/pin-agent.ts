import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { env } from "~/env"

const enhanceDescriptionSchema = z.object({
    description: z.string().min(1, "Description cannot be empty"),
})

/**
 * "Enhance" button on description fields. (The old pin-analysis chat that used
 * to live here was replaced by the map agent — see routers/agent.ts.)
 */
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
- Rewrite the user's description to be clearer, more professional, and well-structured.
- Keep the original meaning.
- Do NOT add new information.
- Fix grammar, spelling, and sentence flow.
- Make it concise and easy to understand.

Return ONLY the enhanced description, nothing else.`,
                            },
                            {
                                role: "user",
                                content: `Please enhance this description:\n\n"${input.description}"`,
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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

})
