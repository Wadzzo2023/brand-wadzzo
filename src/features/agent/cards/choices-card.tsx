"use client";

import { Check, CornerDownLeft, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/shadcn/ui/button";
import type { AgentBlock } from "~/lib/agent/contract";
import { cn } from "~/lib/utils";

type Choices = Extract<AgentBlock, { kind: "choices" }>;

/**
 * A question from the agent with tappable options. One tap answers a
 * single-choice question; with `multiple`, tick several then Continue. The
 * answer goes back as the person's next message.
 */
export function ChoicesCard({ block, disabled, onAnswer }: { block: Choices; disabled: boolean; onAnswer: (labels: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const answered = block.answered;
  const locked = disabled || Boolean(answered);

  const choose = (label: string) => {
    if (locked) return;
    if (!block.multiple) return onAnswer([label]);
    setPicked((p) => (p.includes(label) ? p.filter((l) => l !== label) : [...p, label]));
  };
  const submitOther = () => {
    const text = other.trim();
    if (text && !locked) onAnswer(block.multiple ? [...picked, text] : [text]);
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-linear-to-br from-primary/10 via-card to-card p-3">
      <p className="mb-2 flex items-start gap-2 text-sm font-medium">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" />
        {block.question}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((o) => {
          const on = answered ? answered.includes(o.label) : picked.includes(o.label);
          return (
            <button
              key={o.id}
              type="button"
              disabled={locked && !on}
              onClick={() => choose(o.label)}
              title={o.description}
              aria-pressed={on}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60 hover:bg-primary/5",
                locked && !on && "opacity-50",
                locked && "cursor-default",
              )}
            >
              {on && <Check className="size-3 shrink-0" />}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
      {block.options.some((o) => o.description) && !locked && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {block.options
            .filter((o) => o.description)
            .map((o) => (
              <li key={o.id}>
                <b className="font-medium text-foreground">{o.label}</b> — {o.description}
              </li>
            ))}
        </ul>
      )}
      {!locked && (block.allowOther || block.multiple) && (
        <div className="mt-2 flex items-center gap-1.5">
          {block.allowOther && (
            <div className="relative min-w-0 flex-1">
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submitOther())}
                placeholder="Something else…"
                className="h-8 w-full rounded-md border bg-card pl-2.5 pr-7 text-xs outline-none focus:border-primary"
                maxLength={200}
              />
              <CornerDownLeft className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-faint" />
            </div>
          )}
          {block.multiple && (
            <Button size="sm" disabled={picked.length === 0 && !other.trim()} onClick={() => (other.trim() ? submitOther() : onAnswer(picked))}>
              Continue{picked.length > 0 && ` (${picked.length})`}
            </Button>
          )}
        </div>
      )}
      {answered && answered.some((a) => !block.options.some((o) => o.label === a)) && (
        <p className="mt-2 text-xs text-muted-foreground">You said: {answered.filter((a) => !block.options.some((o) => o.label === a)).join(", ")}</p>
      )}
    </section>
  );
}
