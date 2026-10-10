"use client";

import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useState } from "react";

import type { AgentStep } from "~/lib/agent/contract";
import { cn } from "~/lib/utils";

function StepLine({ step }: { step: AgentStep }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="mt-px flex size-4 shrink-0 items-center justify-center">
        {step.status === "running" ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : step.status === "done" ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <X className="size-3.5 text-destructive" />
        )}
      </span>
      <span className="min-w-0">
        <span className={cn(step.status === "running" ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
        {step.detail && <span className="block text-[11px] text-faint">{step.detail}</span>}
      </span>
    </li>
  );
}

/** While the agent works: each step as it happens ("Searching parks in Clinton County…" → "Found 12 places"). */
export function LiveSteps({ steps }: { steps: AgentStep[] }) {
  const running = steps.some((s) => s.status === "running");
  return (
    <div className="max-w-[92%] rounded-2xl rounded-tl-sm border bg-card px-3 py-2.5 shadow-xs" role="status" aria-live="polite">
      {steps.length === 0 ? (
        <Typing label="Thinking" />
      ) : (
        <ol className="space-y-1.5">
          {steps.map((s) => (
            <StepLine key={s.id} step={s} />
          ))}
          {!running && (
            <li className="pl-6">
              <Typing label="Putting it together" />
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <span className="flex gap-0.5" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-1 animate-bounce rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </span>
  );
}

/** On a saved answer: what the agent did, folded away. */
export function DoneSteps({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  const work = steps.filter((s) => s.label !== "Understanding your request…");
  if (work.length === 0) return null;
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-faint hover:text-muted-foreground" aria-expanded={open}>
        <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} />
        What I did ({work.length} step{work.length === 1 ? "" : "s"})
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1.5 border-l pl-2.5">
          {work.map((s) => (
            <StepLine key={s.id} step={s} />
          ))}
        </ol>
      )}
    </div>
  );
}
