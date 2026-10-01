import { PinType } from "@prisma/client";
import type { Feature } from "geojson";
import { z } from "zod";

import { BADWORDS } from "~/utils/banned-word";

export type HotspotShape = "circle" | "rectangle" | "polygon";

/** A hotspot: an area that keeps dropping pins on a schedule. Shared by the form and the API. */
export const createHotspotFormSchema = z.object({
    // Pin fields
    description: z.string().optional(),
    title: z
        .string()
        .min(3, "Title must be at least 3 characters long")
        .refine(
            (value) => !BADWORDS.some((word) => value.toLowerCase().includes(word.toLowerCase())),
            { message: "Input contains banned words." },
        ),
    image: z.string().url().optional(),
    url: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
    autoCollect: z.boolean().default(false),
    token: z.number().optional(),
    tokenAmount: z.number().nonnegative().optional(),
    pinNumber: z.number().nonnegative().min(1, "Number of pins must be at least 1").default(1),
    pinCollectionLimit: z.number().min(0).default(0),
    tier: z.string().optional(),
    multiPin: z.boolean().default(false),
    type: z.nativeEnum(PinType).default(PinType.OTHER),

    // Hotspot-specific fields
    hotspotShape: z.enum(["circle", "rectangle", "polygon"]).default("polygon"),
    dropEveryDays: z.number().min(1, "Must be at least 1 day").default(1),
    pinDurationDays: z.number().min(1, "Must be at least 1 day").default(3),
    hotspotStartDate: z.date(),
    hotspotEndDate: z.date(),
    geoJson: z.custom<Feature | null>((val) => val === null || typeof val === "object").optional(),
})

