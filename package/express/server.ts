import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import {
    extractIntent,
    buildIntentContext,
    toLangChainMessages,
    detectIsNiche,
    gapFillPins,
    parseAgentOutput,
    reformatToJson,
    stageFromResponse,
    mergeIntent
} from "./agent-logic.js";
import {
    ALL_TOOLS,
    AGENT_SYSTEM_PROMPT
} from "../../src/lib/agent/pin-drop-tools.js";
import type { MessageRole, PinIntent, Pin, PinOptions, AgentResponse, AgentStage } from "../../src/lib/agent/types";

dotenv.config({ path: "../../.env" });

const app = express();

app.use(cors());
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
    res.send("Wadzzo Agent Express Server (Agent Logic Only) is running.");
});

/**
 * Synchronous Agent Chat
 */
app.post("/api/agent/chat", async (req: any, res: any) => {
    try {
        const { messages, intent: currentIntent, creatorId } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Messages array is required" });
        }

        // 1. Extract intent
        const intent = await extractIntent(messages, currentIntent);

        // 2. Build system prompt
        const systemPrompt = AGENT_SYSTEM_PROMPT + buildIntentContext(intent);

        // 3. Run LLM agent
        const agent = createAgent({
            model: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 }),
            tools: [...ALL_TOOLS],
            systemPrompt,
            name: "pin_drop_agent",
        });

        const result = await agent.invoke({ messages: toLangChainMessages(messages) });

        // 4. Harvest pins from tool call results
        const responsePins: Pin[] = [];
        const searchedCities: string[] = [];

        for (const msg of result.messages) {
            if (msg._getType() !== "tool") continue;
            try {
                const toolInput = (msg as any).additional_kwargs?.tool_input;
                if (toolInput) {
                    const parsed = JSON.parse(toolInput);
                    if (parsed.city) searchedCities.push(parsed.city);
                }
            } catch { }

            try {
                const parsed = JSON.parse(msg.content as string);
                if (Array.isArray(parsed.pins) && parsed.pins.length > 0) {
                    responsePins.push(...parsed.pins);
                }
            } catch { }
        }

        const isNiche = detectIsNiche(result.messages) || (intent.isNiche ?? false);

        // 5. Cap / gap-fill
        let cappedPins: Pin[];
        if (!intent.countSpecified || intent.count == null) {
            cappedPins = responsePins;
        } else {
            const target = intent.count;
            cappedPins =
                responsePins.length >= target
                    ? responsePins.slice(0, target)
                    : (await gapFillPins(responsePins, target, intent.query ?? "", searchedCities, intent.area ?? null, isNiche)).slice(0, target);
        }

        // 6. Parse response JSON
        const lastMsg = result.messages.at(-1);
        const rawOutput = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content ?? "");
        let agentResponse = parseAgentOutput(rawOutput) ?? (await reformatToJson(rawOutput));

        // Guard: 0 pins -> info
        if (agentResponse.type === "results" && cappedPins.length === 0) {
            agentResponse = {
                type: "info",
                message: `No locations found for "${intent.query}" in "${intent.area ?? "worldwide"}". Try a different search.`,
            };
        }

        if (agentResponse.type === "results" && cappedPins.length > 0) {
            (agentResponse as any).pinCount = cappedPins.length;
            agentResponse.message = agentResponse.message?.replace(/\d+/, String(cappedPins.length));
        }

        const outputIntent = mergeIntent(agentResponse, { ...intent, isNiche }, cappedPins.length || undefined);

        return res.json({
            reply: JSON.stringify(agentResponse),
            stage: stageFromResponse(agentResponse),
            intent: outputIntent,
            pins: cappedPins.length > 0 ? cappedPins : undefined,
            pinOptions: agentResponse.type === "results"
                ? { autoCollect: false, groupingMode: "per-location" }
                : undefined
        });

    } catch (error: any) {
        console.error("Error in /api/agent/chat:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express Agent Server running on port ${PORT}`);
});

