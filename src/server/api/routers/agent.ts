// server/routers/agent.ts
//
// The map agent (chat on the Pins map). The brand app owns who-may-do-what:
//
//  • every procedure first works out the brand it acts for (resolveActingBrand):
//    a brand acts for itself; an admin may act for a brand in their scope;
//  • conversations are per brand AND per person;
//  • the task server only ever gets that checked brand id, runs the agent
//    (read-only on brand data) and saves its answer and proposals;
//  • proposals change nothing until the person confirms, and are carried out
//    here (executeAction) after checking everything again.
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { AgentBlock, AgentRunPayload, AgentRunResult, AgentStep, ActionStatus, ProposedAction } from "~/lib/agent/contract";
import { taskClient } from "~/lib/express/taskClient-sdk";
import { ActionEditsInput, executeAction } from "~/server/agent/actions";
import { withAiQuota } from "~/server/ai/openai";
import { resolveActingBrand } from "~/server/api/access";
import { getHomeArea } from "~/server/home-area";

import { createTRPCRouter, protectedProcedure } from "../trpc";

type Ctx = Parameters<typeof resolveActingBrand>[0];

/** The brand to act for; omitted means the caller's own brand. */
const BrandInput = z.object({ creatorId: z.string().optional() });

const MESSAGES_PER_CONVERSATION = 200;

async function mayActFor(ctx: Ctx, creatorId: string) {
  return resolveActingBrand(ctx, creatorId).then(
    () => true,
    () => false,
  );
}

/** The caller's own conversation for this brand (NOT_FOUND otherwise). */
async function ownConversation(ctx: Ctx, creatorId: string, id: string) {
  const conversation = await ctx.db.agentConversation.findFirst({
    where: { id, creatorId, userId: ctx.session.user.id },
    select: { id: true, title: true, platformId: true },
  });
  if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  return conversation;
}

type MessageRow = { id: string; role: string; text: string; blocks: Prisma.JsonValue; steps: Prisma.JsonValue; createdAt: Date };

function toMessage(m: MessageRow) {
  return {
    id: m.id,
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    text: m.text,
    blocks: (Array.isArray(m.blocks) ? m.blocks : []) as unknown as AgentBlock[],
    steps: (Array.isArray(m.steps) ? m.steps : []) as unknown as AgentStep[],
    createdAt: m.createdAt,
  };
}
export type AgentMessage = ReturnType<typeof toMessage>;

const messageSelect = { id: true, role: true, text: true, blocks: true, steps: true, createdAt: true } as const;

async function actionStates(ctx: Ctx, conversationId: string) {
  const rows = await ctx.db.agentAction.findMany({ where: { conversationId }, select: { id: true, status: true, result: true } });
  return Object.fromEntries(rows.map((a) => [a.id, { status: a.status as ActionStatus, result: a.result as { message?: string; pinJobId?: string } | null }]));
}

export const agentRouter = createTRPCRouter({
  /** Header info: which brand, its home area, and starter prompts. */
  overview: protectedProcedure.input(BrandInput).query(async ({ ctx, input }) => {
    const brand = await resolveActingBrand(ctx, input.creatorId);
    const [creator, home] = await Promise.all([
      ctx.db.creator.findUnique({ where: { id: brand.creatorId }, select: { name: true, profileUrl: true } }),
      getHomeArea(ctx.db, brand.creatorId),
    ]);
    const area = home?.name ?? "my area";
    return {
      brand: { id: brand.creatorId, name: creator?.name ?? "Brand", image: creator?.profileUrl ?? null },
      homeArea: home ? { name: home.name, source: home.source, feature: home.feature } : null,
      suggestions: [
        `Find all public parks in ${area} and pin them`,
        `Which of my pins were collected most this month?`,
        `Find upcoming events in ${area} this weekend`,
        `Show my pins that expire in the next 7 days`,
      ],
    };
  }),

  conversations: protectedProcedure.input(BrandInput).query(async ({ ctx, input }) => {
    const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
    return ctx.db.agentConversation.findMany({
      where: { creatorId, userId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { id: true, title: true, updatedAt: true },
    });
  }),

  conversation: protectedProcedure.input(BrandInput.extend({ id: z.string() })).query(async ({ ctx, input }) => {
    const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
    const conversation = await ownConversation(ctx, creatorId, input.id);
    const [rows, actions] = await Promise.all([
      ctx.db.agentMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: MESSAGES_PER_CONVERSATION, select: messageSelect }),
      actionStates(ctx, conversation.id),
    ]);
    return { id: conversation.id, title: conversation.title, messages: rows.reverse().map(toMessage), actions };
  }),

  deleteConversation: protectedProcedure.input(BrandInput.extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { creatorId } = await resolveActingBrand(ctx, input.creatorId);
    await ownConversation(ctx, creatorId, input.id);
    await ctx.db.agentConversation.delete({ where: { id: input.id } });
    return { ok: true };
  }),

  /**
   * Sends a message (starting a conversation if needed) and starts the agent.
   * `answer` records which options the person tapped on a question card.
   */
  send: protectedProcedure
    .input(
      BrandInput.extend({
        conversationId: z.string().optional(),
        text: z.string().trim().min(1).max(2000),
        timeZone: z.string().max(60).optional(),
        answer: z.object({ messageId: z.string(), blockId: z.string(), labels: z.array(z.string().max(200)).max(20) }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brand = await resolveActingBrand(ctx, input.creatorId);
      // Each question counts as one of the brand's daily AI generations (admins aren't limited).
      return withAiQuota(ctx.session.user.id, "text", async () => {
        const conversation = input.conversationId
          ? await ownConversation(ctx, brand.creatorId, input.conversationId)
          : await ctx.db.agentConversation.create({
              data: { creatorId: brand.creatorId, platformId: brand.platformId, userId: ctx.session.user.id, title: input.text.slice(0, 80) },
              select: { id: true, title: true, platformId: true },
            });

        if (input.answer) await markAnswered(ctx, conversation.id, input.answer);

        const userMessage = await ctx.db.agentMessage.create({
          data: { conversationId: conversation.id, role: "user", text: input.text },
          select: messageSelect,
        });
        await ctx.db.agentConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

        const payload: AgentRunPayload = { conversationId: conversation.id, creatorId: brand.creatorId, platformId: brand.platformId, timeZone: input.timeZone };
        // One attempt: the person can simply ask again, and a retry could answer twice.
        const { jobId } = await taskClient.enqueue("agent_run", brand.creatorId, payload, 1);
        return { conversationId: conversation.id, jobId, userMessage: toMessage(userMessage) };
      });
    }),

  /**
   * Live progress of a run: its steps while it works, then the saved answer.
   * Only someone who may act for the job's brand sees it.
   */
  poll: protectedProcedure.input(z.object({ jobId: z.string() })).query(async ({ ctx, input }) => {
    const job = await taskClient.poll(input.jobId).catch(() => null);
    if (!job || !(await mayActFor(ctx, job.creatorId))) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

    const steps = (job.steps ?? []) as AgentStep[];
    if (job.status !== "completed") {
      return { status: job.status, steps, error: job.status === "failed" ? "The assistant couldn't finish. Please try again." : undefined, message: null };
    }
    const { messageId } = (job.result ?? {}) as Partial<AgentRunResult>;
    const row = messageId
      ? await ctx.db.agentMessage.findFirst({ where: { id: messageId, conversation: { creatorId: job.creatorId, userId: ctx.session.user.id } }, select: messageSelect })
      : null;
    return { status: job.status, steps, error: undefined, message: row ? toMessage(row) : null };
  }),

  /** Carries out a proposal the person confirmed (once), with their edits from the card. */
  confirm: protectedProcedure.input(BrandInput.extend({ actionId: z.string(), edits: ActionEditsInput.optional() })).mutation(async ({ ctx, input }) => {
    const brand = await resolveActingBrand(ctx, input.creatorId);
    const action = await ctx.db.agentAction.findFirst({
      where: { id: input.actionId, creatorId: brand.creatorId, conversation: { userId: ctx.session.user.id } },
      select: { id: true, payload: true },
    });
    if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });

    // Claim it: only a pending proposal runs, and only once.
    const { count } = await ctx.db.agentAction.updateMany({ where: { id: action.id, status: "pending" }, data: { status: "running" } });
    if (count === 0) throw new TRPCError({ code: "CONFLICT", message: "This proposal was already handled" });

    try {
      const result = await executeAction(ctx.db, brand, action.payload as unknown as ProposedAction, input.edits);
      await ctx.db.agentAction.update({ where: { id: action.id }, data: { status: "done", result } });
      return { status: "done" as const, ...result };
    } catch (err) {
      const message = err instanceof TRPCError ? err.message : "Couldn't complete this change. Please try again.";
      // A rejected input can be fixed on the card and retried; anything else stays failed.
      const retryable = err instanceof TRPCError && err.code === "BAD_REQUEST";
      await ctx.db.agentAction.update({ where: { id: action.id }, data: { status: retryable ? "pending" : "failed", result: { message } } });
      if (err instanceof TRPCError) throw err;
      console.error("[agent.confirm]", err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  }),

  cancel: protectedProcedure.input(BrandInput.extend({ actionId: z.string() })).mutation(async ({ ctx, input }) => {
    const brand = await resolveActingBrand(ctx, input.creatorId);
    const { count } = await ctx.db.agentAction.updateMany({
      where: { id: input.actionId, creatorId: brand.creatorId, status: "pending", conversation: { userId: ctx.session.user.id } },
      data: { status: "cancelled" },
    });
    if (count === 0) throw new TRPCError({ code: "CONFLICT", message: "This proposal was already handled" });
    return { status: "cancelled" as const };
  }),

  /** Progress of a bulk pin creation started by a confirmed proposal. */
  pinJob: protectedProcedure.input(z.object({ jobId: z.string() })).query(async ({ ctx, input }) => {
    const job = await ctx.db.locationGroupJob.findUnique({
      where: { id: input.jobId },
      select: { id: true, creatorId: true, status: true, total: true, completed: true, log: true, error: true },
    });
    if (!job || !(await mayActFor(ctx, job.creatorId))) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
    const log = (Array.isArray(job.log) ? job.log : []) as { title: string; status: "ok" | "error" }[];
    return {
      status: job.status as "pending" | "processing" | "completed" | "failed",
      total: job.total,
      completed: job.completed,
      failed: log.filter((l) => l?.status === "error").map((l) => l.title),
      error: job.error,
    };
  }),
});

/** Records the options picked on a question card, so it shows as answered. */
async function markAnswered(ctx: Ctx, conversationId: string, answer: { messageId: string; blockId: string; labels: string[] }) {
  const message = await ctx.db.agentMessage.findFirst({ where: { id: answer.messageId, conversationId, role: "assistant" }, select: { blocks: true } });
  if (!message || !Array.isArray(message.blocks)) return;
  const blocks = (message.blocks as unknown as AgentBlock[]).map((b) => (b.kind === "choices" && b.id === answer.blockId ? { ...b, answered: answer.labels } : b));
  await ctx.db.agentMessage.update({ where: { id: answer.messageId }, data: { blocks: blocks as unknown as Prisma.InputJsonValue } });
}
