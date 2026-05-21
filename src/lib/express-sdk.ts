// client-sdk/task-client.ts
// Copy this file into your Next.js project at ~/lib/task-client.ts
//
// Next.js is now a THIN CLIENT — it only enqueues jobs and polls for results.
// All agent/pipeline/DB logic runs on the Express task server.

import jwt from "jsonwebtoken";
import { env } from "~/env";

const TASK_SERVER_URL = "https://portal.actn.xyz/wadzzo/api/"

function makeToken(): string {
    const secret = env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET is not set in Next.js env");
    return jwt.sign(
        { sub: "nextjs-app", iat: Math.floor(Date.now() / 1000) },
        secret, // ✅ guard instead of ! assertion — throws clearly if still missing
        { expiresIn: "30m" },
    );
}


function authHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${makeToken()}`,
    };
}

export type JobType = "agent_run" | "create_pins" | "generic";
export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface PollResult {
    jobId: string;
    status: JobStatus;
    result: unknown;
    error?: string;
    progress: number;
}

export const taskClient = {
    /** Enqueue a job — returns { jobId } immediately (no waiting). */
    async enqueue(
        type: JobType,
        creatorId: string,
        payload: Record<string, unknown>,
        maxAttempts = 3,
    ): Promise<{ jobId: string }> {
        const res = await fetch(`${TASK_SERVER_URL}/jobs/enqueue`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ type, creatorId, payload, maxAttempts }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Task server error (${res.status}): ${text.slice(0, 200)}`);
        }
        return res.json() as Promise<{ jobId: string }>;
    },

    /** Poll once — compatible with your existing pollJobResult tRPC shape. */
    async poll(jobId: string): Promise<PollResult> {
        const res = await fetch(`${TASK_SERVER_URL}/jobs/${jobId}`, {
            headers: authHeaders(),
        });
        if (res.status === 404) throw new Error("Job not found");
        if (!res.ok) throw new Error(`Poll error: ${res.status}`);
        return res.json() as Promise<PollResult>;
    },

    /** Cancel a job. */
    async cancel(jobId: string): Promise<void> {
        await fetch(`${TASK_SERVER_URL}/jobs/${jobId}/cancel`, {
            method: "POST",
            headers: authHeaders(),
        });
    },
};