import { TRPCError } from "@trpc/server";
import OpenAI from "openai";

import { env } from "~/env";
import { db } from "~/server/db";

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/** Models are overridable per environment. */
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";

/** Per brand, per UTC day. Admins aren't limited. */
export const AI_DAILY_LIMIT = { text: 50, image: 10 } as const;
export type AiKind = keyof typeof AI_DAILY_LIMIT;

type Usage = { day: string; text: number; image: number };
const today = () => new Date().toISOString().slice(0, 10);

function readUsage(extraFields: unknown): Usage {
  const u = (extraFields as { aiUsage?: Partial<Usage> } | null)?.aiUsage;
  if (!u || u.day !== today()) return { day: today(), text: 0, image: 0 };
  return { day: u.day, text: u.text ?? 0, image: u.image ?? 0 };
}

async function isAdmin(userId: string) {
  return Boolean(await db.admin.findUnique({ where: { id: userId }, select: { id: true } }));
}

/** What's left today for this brand (null = unlimited). */
export async function aiRemaining(userId: string) {
  if (await isAdmin(userId)) return { text: null, image: null, limit: AI_DAILY_LIMIT, unlimited: true as const };
  const creator = await db.creator.findUnique({ where: { id: userId }, select: { extraFields: true } });
  const u = readUsage(creator?.extraFields);
  return {
    text: Math.max(0, AI_DAILY_LIMIT.text - u.text),
    image: Math.max(0, AI_DAILY_LIMIT.image - u.image),
    limit: AI_DAILY_LIMIT,
    unlimited: false as const,
  };
}

/**
 * Run `work` if the brand has quota left, and count it only if it succeeds.
 * Usage lives in Creator.extraFields.aiUsage (no schema change; other keys kept).
 */
export async function withAiQuota<T>(userId: string, kind: AiKind, work: () => Promise<T>): Promise<T> {
  const admin = await isAdmin(userId);
  if (!admin) {
    const creator = await db.creator.findUnique({ where: { id: userId }, select: { extraFields: true } });
    const u = readUsage(creator?.extraFields);
    if (u[kind] >= AI_DAILY_LIMIT[kind])
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You've used today's ${AI_DAILY_LIMIT[kind]} AI ${kind === "image" ? "images" : "generations"}. It resets at midnight UTC.`,
      });
  }

  let result: T;
  try {
    result = await work();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    console.error("[ai]", e);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e instanceof OpenAI.APIError ? friendlyOpenAiError(e) : "The AI couldn't finish that. Try again." });
  }

  if (!admin) {
    // Re-read so a concurrent request's count isn't lost, and keep other keys.
    const creator = await db.creator.findUnique({ where: { id: userId }, select: { extraFields: true } });
    const current = (creator?.extraFields as Record<string, unknown> | null) ?? {};
    const u = readUsage(current);
    await db.creator.update({ where: { id: userId }, data: { extraFields: { ...current, aiUsage: { ...u, [kind]: u[kind] + 1 } } } });
  }
  return result;
}

function friendlyOpenAiError(e: InstanceType<typeof OpenAI.APIError>) {
  if (e.status === 400 && /safety|moderation|policy/i.test(e.message)) return "That was blocked by the AI's safety filter. Try wording it differently.";
  if (e.status === 429) return "The AI is busy right now. Try again in a moment.";
  return "The AI couldn't finish that. Try again.";
}
