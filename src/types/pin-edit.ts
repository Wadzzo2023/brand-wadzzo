import { PinType as PinTypeEnum } from "@prisma/client";
import { z } from "zod";

import { BADWORDS } from "~/utils/banned-word";

/** Editing a pin: shared by the edit page and the API. */
export const updateMapFormSchema = z.object({
    pinId: z.string(),
    lat: z
        .number({
            message: "Latitude is required",
        })
        .min(-180)
        .max(180),
    lng: z
        .number({
            message: "Longitude is required",
        })
        .min(-180)
        .max(180),
    description: z.string().optional(), // Made optional
    title: z
        .string()
        .min(3, "Title must be at least 3 characters long")
        .refine(
            (value) => {
                return !BADWORDS.some((word) => value.toLowerCase().includes(word.toLowerCase()))
            },
            {
                message: "Input contains banned words.",
            },
        ),
    image: z.string().optional(),
    startDate: z.date().optional(),
    endDate: z
        .date()
        .min(new Date(new Date().setHours(0, 0, 0, 0)), "End date cannot be in the past")
        .optional(),
    url: z.string().url().optional(),
    autoCollect: z.boolean(),
    multiPin: z.boolean().optional(),
    pinRemainingLimit: z.number().optional(),
    type: z.nativeEnum(PinTypeEnum).default(PinTypeEnum.OTHER), // Added new type field
})
