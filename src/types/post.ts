import { MediaType } from "@prisma/client";
import { z } from "zod";

export const MediaInfo = z.object({
  url: z.string(),
  type: z.nativeEnum(MediaType),
});
export const PostSchema = z.object({
  heading: z.string().min(1, { message: "Required" }),
  content: z.string().min(2, { message: "Minimum 2 characters required." }),
  subscription: z.string().optional(),
  medias: z.array(MediaInfo).optional(),
});
