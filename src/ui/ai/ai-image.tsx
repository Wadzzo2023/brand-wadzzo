"use client";

import { Check, ImagePlus, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Textarea } from "~/components/shadcn/ui/textarea";
import { cn } from "~/lib/utils";
import type { FillForm } from "~/server/ai/forms";
import { api } from "~/utils/api";

import { AiQuota } from "./shared";

const ASPECT_CLASS = { square: "aspect-square", wide: "aspect-[3/2]", portrait: "aspect-[2/3]" } as const;

/**
 * "Generate with AI" for an image field: a prompt (pre-written from the form),
 * a preview, then "Use this image". Nothing changes until the brand picks it.
 */
export function AiImageButton({
  form,
  suggestedPrompt,
  aspect = "wide",
  destination = "s3",
  onImage,
  label = "Generate with AI",
  className,
}: {
  form: FillForm;
  /** A starting prompt built from the form (title/description or the AI fill's brief). */
  suggestedPrompt: string;
  aspect?: "square" | "wide" | "portrait";
  /** Asset thumbnails go to IPFS; everything else to S3. */
  destination?: "s3" | "ipfs";
  onImage: (url: string, ipfsHash?: string) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(suggestedPrompt);
  const [result, setResult] = useState<{ url: string; ipfsHash: string | null } | null>(null);
  const utils = api.useUtils();
  const generate = api.ai.generateImage.useMutation({
    onSuccess: (r) => {
      setResult(r);
      void utils.ai.usage.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Each time it opens, start from the latest form content (unless an image is already showing).
  const openDialog = () => {
    if (!result && suggestedPrompt) setPrompt(suggestedPrompt);
    setOpen(true);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className={cn("gap-1.5", className)} onClick={openDialog}>
        <Sparkles className="size-4 text-primary" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !generate.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-hud">
              <ImagePlus className="size-5 text-primary" /> Generate an image
            </DialogTitle>
            <DialogDescription>Describe it, or keep the brief written from your form.</DialogDescription>
          </DialogHeader>

          <div className={cn("relative w-full overflow-hidden rounded-lg border bg-surface-2", ASPECT_CLASS[aspect], aspect === "portrait" && "mx-auto max-w-56")}>
            {result ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.url} alt="Generated" className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                {generate.isPending ? (
                  <>
                    <Loader2 className="size-6 animate-spin text-primary" />
                    Creating your image — this takes up to a minute…
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-8 text-faint" />
                    Your image appears here
                  </>
                )}
              </div>
            )}
          </div>

          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={1500} className="resize-none" aria-label="Image description" />

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <AiQuota kind="image" />
            <div className="flex gap-2">
              <Button
                type="button"
                variant={result ? "outline" : "default"}
                disabled={generate.isPending || prompt.trim().length < 3}
                onClick={() => generate.mutate({ form, prompt, aspect, destination })}
              >
                {generate.isPending ? <Loader2 className="animate-spin" /> : result ? <RefreshCw /> : <Sparkles />}
                {generate.isPending ? "Generating…" : result ? "Try again" : "Generate"}
              </Button>
              {result && (
                <Button
                  type="button"
                  disabled={generate.isPending}
                  onClick={() => {
                    onImage(result.url, result.ipfsHash ?? undefined);
                    setOpen(false);
                    setResult(null);
                  }}
                >
                  <Check /> Use this image
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
