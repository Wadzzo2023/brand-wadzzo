import { describe, expect, it } from "vitest";
import { RequestBrandCreateFormSchema } from "~/types/brand-onboarding";

describe("Brand Onboarding Validation", () => {
  it("validates successful new asset creation payload", () => {
    const validNew = {
      profileUrl: "https://example.com/avatar.png",
      displayName: "Neon Horizon Studios",
      bio: "Creating immersive AR experiences.",
      assetType: "new" as const,
      assetName: "HORIZON",
      assetImage: "https://example.com/token.png",
      vanityUrl: "neon-horizon",
    };

    const parsed = RequestBrandCreateFormSchema.safeParse(validNew);
    expect(parsed.success).toBe(true);
  });

  it("requires assetImage when assetType is new", () => {
    const invalidNew = {
      profileUrl: "https://example.com/avatar.png",
      displayName: "Neon Horizon Studios",
      assetType: "new" as const,
      assetName: "HORIZON",
      vanityUrl: "neon-horizon",
    };

    const parsed = RequestBrandCreateFormSchema.safeParse(invalidNew);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Asset image is required for new assets");
    }
  });

  it("validates custom asset payload", () => {
    const validCustom = {
      profileUrl: "https://example.com/avatar.png",
      displayName: "Stellar Artisans",
      assetType: "custom" as const,
      assetCode: "ARTISAN",
      issuer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      vanityUrl: "stellar-artisans",
    };

    const parsed = RequestBrandCreateFormSchema.safeParse(validCustom);
    expect(parsed.success).toBe(true);
  });

  it("rejects empty or excessively long displayName", () => {
    const emptyName = {
      profileUrl: "https://example.com/avatar.png",
      displayName: "",
      assetType: "new" as const,
      assetImage: "https://example.com/token.png",
    };
    expect(RequestBrandCreateFormSchema.safeParse(emptyName).success).toBe(false);

    const longName = {
      profileUrl: "https://example.com/avatar.png",
      displayName: "a".repeat(100),
      assetType: "new" as const,
      assetImage: "https://example.com/token.png",
    };
    expect(RequestBrandCreateFormSchema.safeParse(longName).success).toBe(false);
  });
});
