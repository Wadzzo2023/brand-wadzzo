import { TRPCError } from "@trpc/server";
import { zodTextFormat } from "openai/helpers/zod";
import { Readable } from "stream";
import { z } from "zod";

import { env } from "~/env";
import { FILL_FORMS, FILL_SCHEMAS, FORM_BRIEF } from "~/server/ai/forms";
import { aiRemaining, IMAGE_MODEL, openai, TEXT_MODEL, withAiQuota } from "~/server/ai/openai";
import { createTRPCRouter, creatorProcedure } from "~/server/api/trpc";
import { uploadBufferToS3 } from "~/server/s3";
import { ipfsHashToPinataGatewayUrl } from "~/utils/ipfs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pinataSDK = require("@pinata/sdk") as new (o: { pinataJWTKey: string }) => {
  pinFileToIPFS: (s: Readable, o: { pinataMetadata: { name: string } }) => Promise<{ IpfsHash: string }>;
};

const formEnum = z.enum(FILL_FORMS);
const context = z.record(z.string(), z.string().max(4000)).default({});

const RULES = `Rules:
- Write in the same language the brand writes in.
- Be specific and vivid, never generic filler; no hashtags or emoji unless the brand used them.
- Never invent URLs, prices, addresses or facts the brand didn't give; use null when unknown.
- Respect every detail the brand gave (dates, numbers, names).`;

async function brandLine(db: typeof import("~/server/db").db, userId: string) {
  const c = await db.creator.findUnique({ where: { id: userId }, select: { name: true, bio: true } });
  return c ? `The brand is "${c.name}"${c.bio ? ` — ${c.bio.slice(0, 300)}` : ""}.` : "";
}

const contextBlock = (ctx: Record<string, string>) => {
  const lines = Object.entries(ctx)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `- ${k}: ${v.slice(0, 1500)}`);
  return lines.length ? `What's already in the form:\n${lines.join("\n")}` : "The form is empty so far.";
};

export const aiRouter = createTRPCRouter({
  /** Today's remaining AI text and image generations for this brand. */
  usage: creatorProcedure.query(({ ctx }) => aiRemaining(ctx.session.user.id)),

  /** "Fill with AI": one description → every field of a form, for the brand to review. */
  fillForm: creatorProcedure
    .input(
      z.object({
        form: formEnum,
        prompt: z.string().trim().min(3, "Describe what you want to create").max(2000),
        now: z.string().describe("Brand's local date-time"),
        timeZone: z.string().max(64),
        context,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const schema = FILL_SCHEMAS[input.form];
      return withAiQuota(ctx.session.user.id, "text", async () => {
        const res = await openai.responses.parse({
          model: TEXT_MODEL,
          input: [
            {
              role: "system",
              content: `You fill in the form for ${FORM_BRIEF[input.form]} on Wadzzo, a brand portal. ${await brandLine(ctx.db, ctx.session.user.id)}
It is now ${input.now} (${input.timeZone}). Choose sensible defaults for anything the brand didn't specify, and dates in the future.
${RULES}`,
            },
            { role: "user", content: `${contextBlock(input.context)}\n\nWhat the brand wants:\n${input.prompt}` },
          ],
          text: { format: zodTextFormat(schema, "form") },
        });
        if (!res.output_parsed) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI didn't return a form. Try rephrasing." });
        return res.output_parsed;
      });
    }),

  /** Write or rework one field, using the rest of the form as context. */
  writeField: creatorProcedure
    .input(
      z.object({
        form: formEnum,
        field: z.string().max(60),
        mode: z.enum(["write", "improve", "shorter", "longer", "fun", "professional"]),
        current: z.string().max(8000).default(""),
        format: z.enum(["text", "html"]).default("text"),
        maxChars: z.number().int().min(10).max(5000).optional(),
        context,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = {
        write: `Write the ${input.field}.`,
        improve: `Improve this ${input.field}: clearer, tighter, better flow. Keep its meaning and facts.`,
        shorter: `Make this ${input.field} noticeably shorter. Keep the key facts.`,
        longer: `Expand this ${input.field} with more useful, specific detail (no invented facts).`,
        fun: `Rewrite this ${input.field} to be more playful and exciting.`,
        professional: `Rewrite this ${input.field} to sound polished and professional.`,
      }[input.mode];
      const format =
        input.format === "html"
          ? "Return simple HTML only (<p>, <strong>, <em>, <ul><li>, <br>), no markdown, no code fences."
          : "Return plain text only, no quotes, no markdown.";
      return withAiQuota(ctx.session.user.id, "text", async () => {
        const res = await openai.responses.create({
          model: TEXT_MODEL,
          input: [
            {
              role: "system",
              content: `You write copy for ${FORM_BRIEF[input.form]} on Wadzzo. ${await brandLine(ctx.db, ctx.session.user.id)}
${RULES}
${format}${input.maxChars ? ` Stay under ${input.maxChars} characters.` : ""} Return only the ${input.field} itself.`,
            },
            {
              role: "user",
              content: `${contextBlock(input.context)}\n\n${task}${input.current.trim() ? `\n\nCurrent ${input.field}:\n${input.current}` : ""}`,
            },
          ],
        });
        let text = res.output_text.trim().replace(/^```(?:html)?\s*|\s*```$/g, "");
        if (input.format === "text") text = text.replace(/^["“](.*)["”]$/s, "$1");
        if (input.maxChars) text = text.slice(0, input.maxChars);
        if (!text) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The AI came back empty. Try again." });
        return { text };
      });
    }),

  /** Generate an image and store it (S3, or IPFS for asset thumbnails). */
  generateImage: creatorProcedure
    .input(
      z.object({
        form: formEnum,
        prompt: z.string().trim().min(3, "Describe the image").max(1500),
        aspect: z.enum(["square", "wide", "portrait"]).default("wide"),
        destination: z.enum(["s3", "ipfs"]).default("s3"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const size = { square: "1024x1024", wide: "1536x1024", portrait: "1024x1536" }[input.aspect] as "1024x1024" | "1536x1024" | "1024x1536";
      return withAiQuota(ctx.session.user.id, "image", async () => {
        const res = await openai.images.generate({
          model: IMAGE_MODEL,
          prompt: `${input.prompt}\n\nFor ${FORM_BRIEF[input.form]}. High quality, eye-catching, no words, letters, logos or watermarks.`,
          size,
          quality: "medium",
          n: 1,
        });
        const b64 = res.data?.[0]?.b64_json;
        if (!b64) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No image came back. Try again." });
        const bytes = Buffer.from(b64, "base64");

        if (input.destination === "ipfs") {
          const stream = Object.assign(Readable.from(bytes), { path: "ai-thumbnail.png" });
          const pinned = await new pinataSDK({ pinataJWTKey: env.PINATA_JWT }).pinFileToIPFS(stream, { pinataMetadata: { name: "ai-thumbnail.png" } });
          return { url: ipfsHashToPinataGatewayUrl(pinned.IpfsHash), ipfsHash: pinned.IpfsHash };
        }
        return { url: await uploadBufferToS3(bytes, "image/png"), ipfsHash: null };
      });
    }),
});
