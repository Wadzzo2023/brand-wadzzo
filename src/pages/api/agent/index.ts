// src/app/api/agent/run/route.ts
//
// QStash calls this endpoint after agent.create enqueues a job.
// Runs the full agent pipeline and writes the result back to AgentJob.
//
// ─── PIPELINE ────────────────────────────────────────────────────────────────
//
// 1. Read AgentJob from DB
// 2. resolveRoute()
//    ├── classifyIntent()   — LLM call, no tools
//    ├── dbPresenceCheck()  — Prisma query (only when needed)
//    └── returns: "management" | "pin_drop" | "clarify"
//
// 3. ROUTE:
//    ├── management → runCreatorAgent()
//    ├── pin_drop   → runPinDropAgent()
//    └── clarify    → buildClarificationResponse()
//
// 4. Write result back to AgentJob { status: "completed", result }
//
// Frontend polls agentRouter.pollJobResult() — unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignature } from "@upstash/qstash/nextjs";
import { db } from "~/server/db";

import {
    resolveRoute,
    buildClarificationResponse,
} from "~/lib/agent/classify-intent";

import { runCreatorAgent } from "~/lib/agent/creator-agent";
import { runPinDropAgent } from "~/lib/agent/pin-drop-agent";

import type { PinIntent, MessageRole, PinOptions, Pin } from "~/lib/agent/types";

// ─── Required for raw body (QStash signature verification) ───────────────────

export const config = { api: { bodyParser: false } };

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobPayload {
    jobId: string;
}

interface AgentRunPayload {
    messages: { role: MessageRole; text: string }[];
    intent: Partial<PinIntent> | null;
    pinOptions: PinOptions | null;
    creatorId: string;
    pins?: Pin[];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // ── parse QStash body ─────────────────────────────────────────────────────
    let body: JobPayload;
    try {
        body = req.body as JobPayload;
    } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    const { jobId } = body;
    if (!jobId) return res.status(400).json({ error: "Missing jobId" });

    // ── load job ──────────────────────────────────────────────────────────────
    const job = await db.agentJob.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    await db.agentJob.update({
        where: { id: jobId },
        data: { status: "processing" },
    });

    // ── parse payload ─────────────────────────────────────────────────────────
    let payload: AgentRunPayload;
    try {
        payload = JSON.parse(job.payload as string) as AgentRunPayload;
    } catch {
        await db.agentJob.update({
            where: { id: jobId },
            data: { status: "failed", error: "Invalid job payload" },
        });
        return res.status(200).json({ ok: false, error: "Invalid payload" });
    }

    const { messages, intent, pinOptions, creatorId, pins } = payload;

    // ── run pipeline ──────────────────────────────────────────────────────────
    try {
        const result = await runAgentPipeline({
            messages,
            intent,
            pinOptions,
            creatorId,
            pins,
        });

        await db.agentJob.update({
            where: { id: jobId },
            data: { status: "completed", result: result },
        });

        return res.status(200).json({ ok: true });

    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[/api/agent/run] Job ${jobId} failed:`, err);
        await db.agentJob
            .update({
                where: { id: jobId },
                data: { status: "failed", error: message },
            })
            .catch(() => null);
        return res.status(200).json({ ok: false, error: message });
    }
}

// ─── PIPELINE ─────────────────────────────────────────────────────────────────
//
// This is the only new function in this file.
// Everything else (handler, config, types) is unchanged.

async function runAgentPipeline(payload: AgentRunPayload): Promise<object> {
    const { messages, intent, pinOptions, creatorId, pins } = payload;

    console.log("[runAgentPipeline] Start", {
        creatorId,
        messageCount: messages.length,
        hasPinOptions: !!pinOptions,
        hasPins: !!pins?.length,
    });

    // ── STEP 1: ROUTE ─────────────────────────────────────────────────────────
    //
    // resolveRoute() runs two cheap operations:
    //   1. classifyIntent()  — dedicated LLM call (~200ms)
    //   2. dbPresenceCheck() — single Prisma query (only when needed)
    //
    // Returns one of three decisions:
    //   { route: "management" }
    //   { route: "pin_drop"   }
    //   { route: "clarify"    }

    const decision = await resolveRoute(messages, creatorId, intent);

    console.log("[runAgentPipeline] Route decision:", {
        route: decision.route,
        intent: decision.classification.intent,
        confidence: decision.classification.confidence,
        subIntent: decision.classification.subIntent,
        subject: decision.classification.extractedSubject,
        ...(decision.route === "clarify" && { reason: decision.reason }),
    });

    // ── STEP 2: EXECUTE ───────────────────────────────────────────────────────

    // ── MANAGEMENT ───────────────────────────────────────────────────────────
    if (decision.route === "management") {
        const result = await runCreatorAgent({
            messages,
            subIntent: decision.classification.subIntent,
            creatorId,
            priorIntent: intent,
        });

        return {
            reply: result.reply,
            stage: result.stage,
            intent: result.intent,
            // pins / pinOptions / jobId not present for management
        };
    }

    // ── PIN DROP ─────────────────────────────────────────────────────────────
    if (decision.route === "pin_drop") {
        const result = await runPinDropAgent({
            messages,
            intent,
            pinOptions,
            creatorId,
            pins,
        });

        return {
            reply: result.reply,
            stage: result.stage,
            intent: result.intent,
            pins: result.pins,
            pinOptions: result.pinOptions,
            jobId: result.jobId,
        };
    }

    // ── CLARIFY ──────────────────────────────────────────────────────────────
    // Route could not be determined confidently.
    // buildClarificationResponse() generates a targeted question
    // based on WHY the route was unclear:
    //   "db_conflict"    — creator already has matching pins
    //   "ambiguous"      — intent unclear from message
    //   "low_confidence" — classifier not confident enough

    const clarification = buildClarificationResponse(decision);

    console.log("[runAgentPipeline] Clarification needed:", {
        reason: decision.reason,
        subject: decision.classification.extractedSubject,
        message: clarification.message,
    });

    // preserve prior intent so conversation context is not lost
    const preservedIntent: PinIntent = {
        count: intent?.count ?? 0,
        countSpecified: intent?.countSpecified ?? false,
        query: intent?.query ?? decision.classification.extractedSubject ?? null,
        area: intent?.area ?? null,
        areaType: intent?.areaType ?? "unknown",
        confirmed: false,
        isNiche: intent?.isNiche ?? false,
        pinNumber: intent?.pinNumber ?? 1,
        ambiguousPinIntent: false,
    };

    return {
        reply: JSON.stringify(clarification),
        stage: "clarifying" as const,
        intent: preservedIntent,
    };
}

export default verifySignature(handler);