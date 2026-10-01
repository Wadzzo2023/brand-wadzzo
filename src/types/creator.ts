import { z } from "zod";

export const creatorExtraFiledsSchema = z
  .object({
    navPermission: z.boolean().optional(),
  })
  // Keep keys other code stores here (e.g. aiUsage) when this is re-saved.
  .passthrough()
  .optional()
  .nullable();

export type CreatorExtraFields = z.infer<typeof creatorExtraFiledsSchema>;
