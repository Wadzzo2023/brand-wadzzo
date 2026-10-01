import { MediaType, PinType } from "@prisma/client";
import { z } from "zod";

/**
 * "Fill with AI" output per form. Structured outputs need every key present,
 * so anything the brand might not want is nullable; the client only applies
 * non-null values. Dates are local wall-clock "YYYY-MM-DDTHH:mm" in the
 * brand's timezone (what datetime-local inputs use).
 */
const localDateTime = z.string().nullable().describe('Local date-time "YYYY-MM-DDTHH:mm" in the brand\'s timezone, or null');
const imagePrompt = z.string().describe("A short visual brief for a cover image that fits this — subject, mood, style. No text in the image.");
const DAY_CHOICES = [1, 2, 3, 5, 7, 14, 30] as const;
const dayChoice = z.number().int().describe(`One of ${DAY_CHOICES.join(", ")}`);

export const FILL_SCHEMAS = {
  pin: z.object({
    title: z.string().describe("Catchy pin title, max 60 chars"),
    description: z.string().describe("2–4 sentences: what it is and why walk there"),
    type: z.nativeEnum(PinType),
    url: z.string().nullable().describe("A link only if the brand gave one"),
    startDate: localDateTime,
    endDate: localDateTime,
    pinNumber: z.number().int().min(1).max(50).describe("How many pins to drop"),
    pinCollectionLimit: z.number().int().min(0).describe("Collections allowed per pin; 0 = unlimited"),
    radius: z.number().int().min(5).max(1000).describe("Collection radius in metres"),
    autoCollect: z.boolean(),
    multiPin: z.boolean(),
    tags: z.array(z.string()).max(7).describe("Up to 7 short search tags"),
    imagePrompt,
  }),
  hotspot: z.object({
    title: z.string().describe("Catchy title shown on every dropped pin, max 60 chars"),
    description: z.string().describe("2–4 sentences"),
    type: z.nativeEnum(PinType),
    url: z.string().nullable(),
    hotspotStartDate: localDateTime,
    hotspotEndDate: localDateTime,
    dropEveryDays: dayChoice,
    pinDurationDays: dayChoice,
    pinNumber: z.number().int().min(1).max(50).describe("Pins per drop"),
    pinCollectionLimit: z.number().int().min(0).describe("Collections allowed per pin; 0 = unlimited"),
    autoCollect: z.boolean(),
    multiPin: z.boolean(),
    imagePrompt,
  }),
  post: z.object({
    heading: z.string().describe("Post title, max 80 chars"),
    contentHtml: z.string().describe("Post body as simple HTML (<p>, <strong>, <em>, <ul><li>). 60–200 words."),
    imagePrompt,
  }),
  announcement: z.object({
    title: z.string().describe("Max 120 chars"),
    body: z.string().describe("Plain text, 40–150 words, line breaks allowed"),
    ctaLabel: z.string().nullable().describe("Button text (max 40) if a link makes sense"),
    ctaUrl: z.string().nullable().describe("Only a URL the brand gave"),
    imagePrompt,
  }),
  bounty: z.object({
    title: z.string().describe("Max 65 chars"),
    contentHtml: z.string().describe("Task description as simple HTML: what to do, how winners are chosen, rules. 60–200 words."),
    prizeInUSD: z.number().nullable().describe("Only if the brand mentioned a budget"),
    totalWinner: z.number().int().min(1).max(100),
    requiredBalance: z.number().min(0).describe("Platform tokens fans must hold to join; usually 0"),
    imagePrompt,
  }),
  event: z.object({
    title: z.string().describe("Max 120 chars"),
    description: z.string().describe("Plain text, 60–200 words: what's happening, who it's for, what to bring"),
    start: localDateTime,
    end: localDateTime,
    inPerson: z.boolean(),
    venueName: z.string().nullable(),
    address: z.string().nullable(),
    link: z.string().nullable().describe("Only a URL the brand gave"),
    linkLabel: z.string().nullable().describe("Button text, max 40"),
    capacity: z.number().int().min(1).nullable(),
    imagePrompt,
  }),
  asset: z.object({
    name: z.string().describe("Collectible name, max 60 chars"),
    description: z.string().describe("2–4 sentences on what buyers get"),
    code: z.string().describe("On-chain asset code: 4–12 letters A–Z only, uppercase, derived from the name"),
    mediaType: z.nativeEnum(MediaType),
    limit: z.number().int().min(1).describe("Supply"),
    priceUSD: z.number().min(0),
    imagePrompt,
  }),
} as const;

export type FillForm = keyof typeof FILL_SCHEMAS;
export type FillResult<F extends FillForm> = z.infer<(typeof FILL_SCHEMAS)[F]>;
export const FILL_FORMS = Object.keys(FILL_SCHEMAS) as [FillForm, ...FillForm[]];

export const FORM_BRIEF: Record<FillForm, string> = {
  pin: "a map pin fans walk to and collect in the Wadzzo location game",
  hotspot: "a hotspot: an area on the map that keeps dropping collectible pins on a schedule",
  post: "a post to the brand's followers (news, media, perks)",
  announcement: "a short announcement in the brand's News feed",
  bounty: "a bounty: a task fans complete for a prize",
  event: "an event fans can RSVP to",
  asset: "a collectible NFT/asset sold in the brand's store",
};
