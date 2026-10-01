"use client";

import { Loader2, Wand2 } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { api } from "~/utils/api";

export const plainText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** "Enhance with AI" for a rich-text field (used by the create pages). */
export function EnhanceButton({ text, onEnhanced }: { text: string; onEnhanced: (t: string) => void }) {
  const enhance = api.pinAgent.enhanceDescription.useMutation({
    onSuccess: (d) => {
      onEnhanced(d.enhancedDescription);
      toast.success("Enhanced");
    },
    onError: (e) => toast.error(e.message || "Couldn't enhance it"),
  });
  return (
    <div className="flex justify-end">
      <Button type="button" variant="outline" size="sm" disabled={!plainText(text ?? "") || enhance.isPending} onClick={() => enhance.mutate({ description: text.trim() })}>
        {enhance.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />} Enhance with AI
      </Button>
    </div>
  );
}
