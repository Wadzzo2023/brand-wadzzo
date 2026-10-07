"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FileText,
  LinkIcon,
  Loader2,
  PanelTop,
  Plus,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import type { z } from "zod";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { Label } from "~/components/shadcn/ui/label";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { PLATFORM_ASSET } from "~/lib/stellar/constant";
import { cn } from "~/lib/utils";
import type { RequestBrandCreateFormSchema } from "~/types/brand-onboarding";
import { Dropzone } from "~/ui/upload/dropzone";
import { uploadToIpfsUrl } from "~/ui/upload/ipfs";
import { api } from "~/utils/api";
import { WADZZO_AR_URL } from "~/lib/embed";

/** The AR site brand vanity URLs live on (this platform's web app). */
const AR_HOST = WADZZO_AR_URL.replace(/^https?:\/\//, "");

type FormData = z.infer<typeof RequestBrandCreateFormSchema>;

const STEPS = [
  { step: 1, title: "Media", desc: "Profile & cover images" },
  { step: 2, title: "Details", desc: "Brand name & biography" },
  { step: 3, title: "Page Asset", desc: "Brand membership token" },
  { step: 4, title: "Vanity URL", desc: "Custom profile link" },
  { step: 5, title: "Review", desc: "Confirm & complete" },
] as const;

const CONFETTI_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];
const CONFETTI = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: `${(i * 1.67) % 100}%`,
  top: `${(i * 2.3) % 100}%`,
  duration: 2 + (i % 3) * 0.5,
  delay: (i % 5) * 0.1,
}));

export default function ArtistOnboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [showConfetti, setShowConfetti] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    profileUrl: "",
    profileUrlPreview: "",
    coverUrl: "",
    coverImagePreview: "",
    displayName: "",
    bio: "",
    assetType: "new",
    assetName: "",
    assetImage: "",
    assetImagePreview: "",
    assetCode: "",
    issuer: "",
    vanityUrl: "",
  });

  const [isVanityUrlAvailable, setIsVanityUrlAvailable] = useState<boolean | null>(null);
  const [isCheckingVanityUrl, setIsCheckingVanityUrl] = useState(false);
  const [isTrusted, setIsTrusted] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<"profile" | "cover">("profile");

  // Debounced vanity URL check
  const checkVanity = api.fan.creator.checkVanityURLAvailabilityMutation.useMutation({
    onSuccess: (data) => {
      setIsCheckingVanityUrl(false);
      setIsVanityUrlAvailable(data.isAvailable);
    },
    onError: () => {
      setIsCheckingVanityUrl(false);
      setIsVanityUrlAvailable(false);
    },
  });

  useEffect(() => {
    const slug = formData.vanityUrl?.trim().toLowerCase();
    if (!slug) return;
    const timer = setTimeout(() => {
      checkVanity.mutate({ vanityURL: slug });
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.vanityUrl, checkVanity]);

  // Custom asset verification
  const checkAsset = api.fan.creator.checkCustomAssetValidity.useMutation({
    onSuccess: (valid) => {
      if (valid) {
        setIsTrusted(true);
        toast.success("Custom asset verified on Stellar network");
      } else {
        setIsTrusted(false);
        toast.error("Asset not found or issuer invalid");
      }
    },
    onError: (err) => {
      setIsTrusted(false);
      toast.error(err.message ?? "Failed to verify asset");
    },
  });

  const utils = api.useUtils();

  // Final submission mutation
  const requestBrand = api.fan.creator.requestForBrandCreation.useMutation({
    onSuccess: () => {
      toast.success("Brand application submitted successfully!");
      setShowConfetti(true);
      setTimeout(() => {
        void utils.fan.creator.meCreator.invalidate();
        router.push("/pins");
      }, 2000);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to submit brand application");
    },
  });

  // Step validation
  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return !!formData.profileUrl;
      case 2:
        return formData.displayName.trim().length >= 1 && formData.displayName.trim().length <= 99;
      case 3:
        if (formData.assetType === "new") {
          const validName = /^[a-zA-Z]{4,12}$/.test(formData.assetName.trim());
          return validName && !!formData.assetImage;
        } else {
          const validCode = /^[a-zA-Z]{4,12}$/.test(formData.assetCode.trim());
          const validIssuer = /^G[A-Z2-7]{55}$/.test(formData.issuer.trim());
          return validCode && validIssuer && isTrusted;
        }
      case 4:
        return (
          !!formData.vanityUrl &&
          formData.vanityUrl.trim().length > 0 &&
          isVanityUrlAvailable === true &&
          !isCheckingVanityUrl
        );
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
    } else {
      const payload: FormData = {
        ...formData,
        profileUrl: formData.profileUrl ?? undefined,
        coverUrl: formData.coverUrl ?? undefined,
        displayName: formData.displayName.trim(),
        bio: formData.bio && formData.bio.trim().length > 0 ? formData.bio.trim() : undefined,
        assetType: formData.assetType,
        assetName: formData.assetType === "new" ? formData.assetName.trim().toUpperCase() : "",
        assetImage: formData.assetType === "new" ? formData.assetImage : undefined,
        assetCode: formData.assetType === "custom" ? formData.assetCode.trim().toUpperCase() : "",
        issuer: formData.assetType === "custom" ? formData.issuer.trim() : "",
        vanityUrl: formData.vanityUrl.trim().toLowerCase(),
      };
      requestBrand.mutate(payload);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-background pt-6 pb-28 px-4 sm:px-6 lg:py-8 lg:px-8">
      {/* Confetti Celebration */}
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {CONFETTI.map((c) => (
            <motion.div
              key={c.id}
              className="absolute size-2.5 rounded-full"
              style={{ backgroundColor: c.color, left: c.left, top: c.top }}
              initial={{ opacity: 1, scale: 0, y: 0 }}
              animate={{ opacity: [1, 1, 0], scale: [0, 1.5, 0.8], y: [0, 400] }}
              transition={{ duration: c.duration, delay: c.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      <div className="mx-auto max-w-5xl">
        {/* Top Header */}
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Creator Portal</p>
            <h1 className="font-hud text-3xl font-bold tracking-tight text-foreground">Set Up Your Brand</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Step {currentStep} of {STEPS.length}</span>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Grid: Left Steps Rail, Right Step Card */}
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Steps Rail */}
          <aside className="hidden lg:block lg:col-span-4">
            <nav className="space-y-1.5 rounded-2xl border border-border bg-card p-3 shadow-xs">
              {STEPS.map((s) => {
                const isActive = currentStep === s.step;
                const isCompleted = currentStep > s.step;
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => {
                      if (isCompleted || s.step < currentStep) setCurrentStep(s.step);
                    }}
                    disabled={!isCompleted && s.step !== currentStep}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all",
                      isActive
                        ? "bg-primary/10 border border-primary/40 font-semibold text-foreground"
                        : isCompleted
                          ? "hover:bg-muted/60 text-foreground cursor-pointer"
                          : "text-muted-foreground opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors",
                        isCompleted
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : isActive
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <CheckCircle2 className="size-4" /> : s.step}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                    {isActive && <ChevronRight className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Form Content */}
          <main className="lg:col-span-8">
            <div className="rounded-2xl border border-border bg-card shadow-xs">
              <div key={currentStep} className="p-6 sm:p-8">
                  {/* Step 1: Media Upload */}
                  {currentStep === 1 && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="font-hud text-2xl font-bold tracking-tight">Brand Media</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Upload your brand identity artwork. Profile picture is required; cover banner is optional.
                        </p>
                      </div>

                      {/* Tab toggles */}
                      <div className="flex rounded-lg border border-border bg-muted/40 p-1">
                        <button
                          type="button"
                          onClick={() => setActiveMediaTab("profile")}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors",
                            activeMediaTab === "profile"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <User className="size-4" />
                          Profile Avatar <span className="text-destructive">*</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMediaTab("cover")}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors",
                            activeMediaTab === "cover"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <PanelTop className="size-4" />
                          Cover Banner (Optional)
                        </button>
                      </div>

                      {activeMediaTab === "profile" ? (
                        <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
                          <div className="flex flex-col items-center justify-center p-4">
                            <Dropzone
                              endpoint="profileUploader"
                              shape="circle"
                              value={formData.profileUrl}
                              onChange={(url) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  profileUrl: url ?? "",
                                  profileUrlPreview: url ?? "",
                                }))
                              }
                            />
                            <p className="mt-3 text-xs text-muted-foreground text-center">
                              Square PNG or JPG, at least 400×400px.
                            </p>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3">
                            <h3 className="text-sm font-semibold text-foreground">Avatar Guidelines</h3>
                            <ul className="space-y-2 text-xs text-muted-foreground">
                              <li className="flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                                Clear logo or recognizable portrait
                              </li>
                              <li className="flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                                Good contrast on light and dark backgrounds
                              </li>
                              <li className="flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                                Centered composition for circular cropping
                              </li>
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <Dropzone
                            endpoint="coverUploader"
                            shape="wide"
                            value={formData.coverUrl}
                            onChange={(url) =>
                              setFormData((prev) => ({
                                ...prev,
                                coverUrl: url ?? "",
                                coverImagePreview: url ?? "",
                              }))
                            }
                          />
                          <p className="text-xs text-muted-foreground text-center">
                            Landscape banner (recommended 1500×500px, max 5MB).
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2: Details */}
                  {currentStep === 2 && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="font-hud text-2xl font-bold tracking-tight">Artist Details</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Tell fans and collectors who you are and what you create.
                        </p>
                      </div>

                      <div className="grid gap-6 sm:grid-cols-12">
                        <div className="space-y-4 sm:col-span-8">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <Label htmlFor="displayName" className="text-sm font-semibold">
                                Brand / Artist Name <span className="text-destructive">*</span>
                              </Label>
                              <span className="text-xs text-muted-foreground">{formData.displayName.length}/99</span>
                            </div>
                            <Input
                              id="displayName"
                              name="displayName"
                              value={formData.displayName}
                              onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))}
                              placeholder="e.g. Neon Horizon Studios"
                              maxLength={99}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <Label htmlFor="bio" className="text-sm font-semibold">
                                Biography
                              </Label>
                              <span className="text-xs text-muted-foreground">{(formData.bio ?? "").length}/500</span>
                            </div>
                            <Textarea
                              id="bio"
                              name="bio"
                              rows={4}
                              value={formData.bio ?? ""}
                              onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
                              placeholder="Describe your art, projects, or vision..."
                              maxLength={500}
                            />
                          </div>
                        </div>

                        {/* Live mini preview */}
                        <div className="sm:col-span-4">
                          <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Preview</p>
                            <div className="relative mx-auto size-20 overflow-hidden rounded-full border border-border bg-card shadow-xs">
                              {formData.profileUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={formData.profileUrl}
                                  alt="Preview avatar"
                                  className="size-full object-cover"
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                                  <User className="size-8" />
                                </div>
                              )}
                            </div>
                            <h4 className="mt-3 truncate font-semibold text-foreground">
                              {formData.displayName.trim().length > 0 ? formData.displayName : "Artist Name"}
                            </h4>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {formData.bio && formData.bio.trim().length > 0 ? formData.bio : "Your bio will appear here."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Page Asset */}
                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="font-hud text-2xl font-bold tracking-tight">Page Asset (Membership Token)</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Fans hold this token to unlock membership tiers and access rewards.
                        </p>
                      </div>

                      {/* Mode selection */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, assetType: "new" }))}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                            formData.assetType === "new"
                              ? "border-primary bg-primary/10 ring-1 ring-primary"
                              : "border-border bg-card hover:border-primary/40"
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg",
                              formData.assetType === "new"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Plus className="size-4" />
                          </span>
                          <div>
                            <span className="block text-sm font-semibold text-foreground">Create a new token</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              Name your token and add an image. Wadzzo issues it on Stellar for you.
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, assetType: "custom" }))}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                            formData.assetType === "custom"
                              ? "border-primary bg-primary/10 ring-1 ring-primary"
                              : "border-border bg-card hover:border-primary/40"
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg",
                              formData.assetType === "custom"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <FileText className="size-4" />
                          </span>
                          <div>
                            <span className="block text-sm font-semibold text-foreground">Use existing token</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              Connect an existing token code and Stellar issuer account.
                            </span>
                          </div>
                        </button>
                      </div>

                      {formData.assetType === "new" ? (
                        <div className="grid gap-6 sm:grid-cols-2 sm:items-start pt-2">
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="assetName" className="text-sm font-semibold">
                                Token Code (4–12 Letters) <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="assetName"
                                value={formData.assetName}
                                onChange={(e) =>
                                  setFormData((p) => ({
                                    ...p,
                                    assetName: e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 12).toUpperCase(),
                                  }))
                                }
                                placeholder="e.g. HORIZON"
                                maxLength={12}
                              />
                              <p className="text-xs text-muted-foreground">
                                Letters only (A-Z). Cannot be changed after creation.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">
                              Token Artwork (IPFS) <span className="text-destructive">*</span>
                            </Label>
                            <Dropzone
                              endpoint="imageUploader"
                              uploader={uploadToIpfsUrl}
                              shape="square"
                              value={formData.assetImage}
                              previewUrl={formData.assetImagePreview}
                              onBeforeUpload={(file) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = typeof reader.result === "string" ? reader.result : "";
                                  setFormData((p) => ({
                                    ...p,
                                    assetImagePreview: result,
                                  }));
                                };
                                reader.readAsDataURL(file);
                                return file;
                              }}
                              onChange={(url) =>
                                setFormData((p) => {
                                  const existingPreview = p.assetImagePreview && p.assetImagePreview.length > 0 ? p.assetImagePreview : url ?? "";
                                  return {
                                    ...p,
                                    assetImage: url ?? "",
                                    assetImagePreview: url ? existingPreview : "",
                                  };
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 pt-2">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="assetCode" className="text-sm font-semibold">
                                Asset Code <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="assetCode"
                                value={formData.assetCode}
                                onChange={(e) => {
                                  setIsTrusted(false);
                                  setFormData((p) => ({
                                    ...p,
                                    assetCode: e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 12).toUpperCase(),
                                  }));
                                }}
                                placeholder="e.g. MYTOKEN"
                                maxLength={12}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="issuer" className="text-sm font-semibold">
                                Stellar Issuer Address <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="issuer"
                                value={formData.issuer}
                                onChange={(e) => {
                                  setIsTrusted(false);
                                  setFormData((p) => ({ ...p, issuer: e.target.value.trim() }));
                                }}
                                placeholder="G..."
                                maxLength={56}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                checkAsset.isPending ||
                                !formData.assetCode.trim() ||
                                formData.issuer.trim().length !== 56
                              }
                              onClick={() =>
                                checkAsset.mutate({
                                  assetCode: formData.assetCode.trim(),
                                  issuer: formData.issuer.trim(),
                                })
                              }
                            >
                              {checkAsset.isPending ? (
                                <>
                                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                                  Verifying on Stellar...
                                </>
                              ) : (
                                "Verify Asset"
                              )}
                            </Button>
                            {isTrusted && (
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCheck className="size-4" />
                                Asset Verified
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 4: Vanity URL */}
                  {currentStep === 4 && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="font-hud text-2xl font-bold tracking-tight">Choose Your Vanity URL</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Your brand profile address on the Wadzzo fan portal.
                        </p>
                      </div>

                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <Sparkles className="size-5 shrink-0 text-primary mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">Launch Offer</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Your custom vanity URL is <strong className="text-foreground">free for the first month</strong>.
                              Subsequent renewals are 500 {PLATFORM_ASSET.code}.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="vanityUrl" className="text-sm font-semibold">
                          Custom Web Address <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex items-center">
                          <span className="inline-flex h-10 items-center rounded-l-xl border border-r-0 border-border bg-muted/60 px-3 text-xs font-medium text-muted-foreground">
                            {AR_HOST}/
                          </span>
                          <Input
                            id="vanityUrl"
                            value={formData.vanityUrl}
                            onChange={(e) => {
                              const clean = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "");
                              setFormData((p) => ({
                                ...p,
                                vanityUrl: clean,
                              }));
                              if (!clean) {
                                setIsVanityUrlAvailable(null);
                                setIsCheckingVanityUrl(false);
                              } else {
                                setIsCheckingVanityUrl(true);
                                setIsVanityUrlAvailable(null);
                              }
                            }}
                            placeholder="your-brand-slug"
                            className="rounded-l-none"
                          />
                        </div>

                        {formData.vanityUrl && (
                          <div className="mt-2 text-xs">
                            {isCheckingVanityUrl ? (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                Checking availability...
                              </span>
                            ) : isVanityUrlAvailable === true ? (
                              <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCheck className="size-4" />
                                {AR_HOST}/{formData.vanityUrl} is available!
                              </span>
                            ) : isVanityUrlAvailable === false ? (
                              <span className="flex items-center gap-1.5 font-semibold text-destructive">
                                <XCircle className="size-4" />
                                This handle is already taken. Please choose another.
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 5: Review & Complete */}
                  {currentStep === 5 && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="font-hud text-2xl font-bold tracking-tight">Review Application</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Check your details below before submitting your brand profile application.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Profile review card */}
                        <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                              <User className="size-4 text-primary" />
                              Brand Identity
                            </h3>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)} className="h-7 text-xs">
                                Media
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="h-7 text-xs">
                                Details
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="relative size-12 overflow-hidden rounded-full border border-border bg-card">
                              {formData.profileUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={formData.profileUrl} alt="Avatar" className="size-full object-cover" />
                              ) : (
                                <User className="size-full p-2 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">{formData.displayName}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {formData.bio && formData.bio.trim().length > 0 ? formData.bio : "No bio entered"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Page asset review card */}
                        <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                              <Coins className="size-4 text-primary" />
                              Page Asset
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => setCurrentStep(3)} className="h-7 text-xs">
                              Edit
                            </Button>
                          </div>
                          <div className="flex items-center gap-3">
                            {formData.assetType === "new" &&
                              (() => {
                                const previewSrc =
                                  formData.assetImagePreview && formData.assetImagePreview.length > 0
                                    ? formData.assetImagePreview
                                    : formData.assetImage && formData.assetImage.length > 0
                                      ? formData.assetImage
                                      : null;
                                if (!previewSrc) return null;
                                return (
                                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={previewSrc}
                                      alt={formData.assetName.length > 0 ? formData.assetName : "Token Artwork"}
                                      className="size-full object-cover"
                                    />
                                  </div>
                                );
                              })()}
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {formData.assetType === "new" ? formData.assetName : formData.assetCode}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formData.assetType === "new" ? "New token issued by Wadzzo" : `Issuer: ${formData.issuer.slice(0, 8)}...`}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Vanity URL card */}
                        <div className="sm:col-span-2 rounded-xl border border-border bg-muted/20 p-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                              <LinkIcon className="size-4 text-primary" />
                              Public Vanity Link
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => setCurrentStep(4)} className="h-7 text-xs">
                              Edit
                            </Button>
                          </div>
                          <p className="font-mono text-sm text-primary">
                            {WADZZO_AR_URL}/{formData.vanityUrl}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 flex items-start gap-3">
                        <ClipboardCheck className="size-5 shrink-0 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Ready to Submit?</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Once submitted, your application will be reviewed by administrators. You will be redirected to your dashboard.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Actions */}
                  <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBack}
                      disabled={currentStep === 1 || requestBrand.isPending}
                      className="gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>

                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={!isStepValid() || requestBrand.isPending}
                      className="gap-2"
                    >
                      {requestBrand.isPending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Submitting...
                        </>
                      ) : currentStep === 5 ? (
                        "Submit Application"
                      ) : (
                        <>
                          Next
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
          </main>
        </div>
      </div>
    </div>
  );
}
