// Client for the Express task server's job queue (package/express-wadzzo).
// Long work (the map agent, bulk pin creation) runs there; this app enqueues it
// and polls. Callers must check the user may act for `creatorId` first.

import { taskServerHeaders, taskServerUrl } from "./server-url";


export type JobType = "agent_run" | "create_pins" | "generic";
export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface PollResult {
    jobId: string;
    /** The brand the job runs for — check the caller may see it before returning anything. */
    creatorId: string;
    status: JobStatus;
    result: unknown;
    error?: string;
    progress: number;
    /** agent_run: what the agent is doing (AgentStep[]). */
    steps?: unknown[];
}

export const taskClient = {
    /** Enqueue a job — returns { jobId } immediately (no waiting). */
    async enqueue(
        type: JobType,
        creatorId: string,
        payload: Record<string, unknown>,
        maxAttempts = 3,
    ): Promise<{ jobId: string }> {
        const res = await fetch(`${taskServerUrl()}/jobs/enqueue`, {
            method: "POST",
            headers: taskServerHeaders(),
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
        const res = await fetch(`${taskServerUrl()}/jobs/${jobId}`, {
            headers: taskServerHeaders(),
        });
        if (res.status === 404) throw new Error("Job not found");
        if (!res.ok) throw new Error(`Poll error: ${res.status}`);
        return res.json() as Promise<PollResult>;
    },

    /** Cancel a job. */
    async cancel(jobId: string): Promise<void> {
        await fetch(`${taskServerUrl()}/jobs/${jobId}/cancel`, {
            method: "POST",
            headers: taskServerHeaders(),
        });
    },
};