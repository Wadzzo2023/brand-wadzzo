"use client";

import { Loader2, Sparkles, Undo2, Wand2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Textarea } from "~/components/shadcn/ui/textarea";
import type { FillForm, FillResult } from "~/server/ai/forms";
import { api } from "~/utils/api";

import { localNow, AiQuota } from "./shared";

/**
 * "Fill with AI" at the top of a create form: describe it in a sentence and
 * every field is filled in for review. `apply` writes the result into the form
 * and returns an undo function (so the brand can take it all back).
 */
export function AiFillCard<F extends FillForm>({
  form,
  context,
  apply,
  examples,
  placeholder = "Describe what you want in a sentence or two…",
}: {
  form: F;
  /** Current form values, so the AI can build on what's there. */
  context?: Record<string, string>;
  apply: (result: FillResult<F>) => (() => void) | void;
  examples?: string[];
  placeholder?: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const fill = api.ai.fillForm.useMutation({
    onSuccess: (result) => {
      const u = apply(result);
      setUndo(() => u ?? null);
      toast.success("Filled in — review everything before you publish");
    },
    onError: (e) => toast.error(e.message),
  });

  const run = () => fill.mutate({ form, prompt, ...localNow(), context: context ?? {} });

  return (
    <section className="relative overflow-hidden rounded-xl border border-primary/30 bg-linear-to-br from-primary/10 via-card to-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <h2 className="font-hud text-base font-semibold">Fill with AI</h2>
        <AiQuota kind="text" className="ml-auto" />
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim().length >= 3) {
            e.preventDefault();
            run();
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder={placeholder}
        className="resize-none bg-card"
        aria-label="Describe what you want the AI to fill in"
      />
      {examples && !prompt && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <p className="hidden text-xs text-muted-foreground sm:block">Nothing is published — you review every field first.</p>
        <div className="ml-auto flex gap-2">
          {undo && !fill.isPending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                undo();
                setUndo(null);
              }}
            >
              <Undo2 /> Undo
            </Button>
          )}
          <Button type="button" size="sm" onClick={run} disabled={fill.isPending || prompt.trim().length < 3}>
            {fill.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {fill.isPending ? "Filling…" : "Fill form"}
          </Button>
        </div>
      </div>
    </section>
  );
}
