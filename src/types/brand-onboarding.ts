import { z } from "zod";

/** The brand onboarding form (client) and the create-brand request (server) share this. */
export const RequestBrandCreateFormSchema = z
    .object({
        profileUrl: z.string().url().optional(),
        profileUrlPreview: z.string().optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        coverImagePreview: z.string().optional(),
        displayName: z
            .string()
            .min(1, "Display name is required")
            .max(99, "Display name must be less than 100 characters"),
        bio: z.string().optional(),
        assetType: z.enum(["new", "custom"]),
        assetName: z.string().default(""),
        assetImage: z.string().url().optional(),
        assetImagePreview: z.string().optional(),
        assetCode: z.string().default(""),
        issuer: z.string().default(""),
        vanityUrl: z.string().default(""),
    })
    .refine(
        (data) => {
            // If assetType is "new", assetImage is required
            if (data.assetType === "new") {
                return !!data.assetImage;
            }
            // If assetType is "custom", assetCode and issuer are required
            return true;
        },
        {
            message: "Asset image is required for new assets",
            path: ["assetImage"],
        },
    );
