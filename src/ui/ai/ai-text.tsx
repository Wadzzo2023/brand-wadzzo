"use client";

import { ChevronDown, Loader2, Minimize2, PenLine, Briefcase, PartyPopper, Sparkles, Maximize2, Undo2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/shadcn/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { FillForm } from "~/server/ai/forms";
import { api } from "~/utils/api";

import { AiQuota, htmlToText } from "./shared";

type Mode = "write" | "improve" | "shorter" | "longer" | "fun" | "professional";
const REWRITES: { mode: Mode; label: string; icon: typeof PenLine }[] = [
  { mode: "improve", label: "Improve writing", icon: Sparkles },
  { mode: "shorter", label: "Make shorter", icon: Minimize2 },
  { mode: "longer", label: "Make longer", icon: Maximize2 },
  { mode: "fun", label: "More fun", icon: PartyPopper },
  { mode: "professional", label: "More professional", icon: Briefcase },
];

/**
 * The AI button for one text field. Empty field → "Write with AI" (one click);
 * with text → a menu of rewrites. Uses the rest of the form as context, and
 * offers an undo after every change.
 */
export function AiTextButton({
  form,
  field,
  value,
  onChange,
  context,
  format = "text",
  maxChars,
  className,
}: {
  form: FillForm;
  /** Human name of the field, e.g. "title" or "description". */
  field: string;
  value: string;
  onChange: (text: string) => void;
  context?: Record<string, string>;
  format?: "text" | "html";
  maxChars?: number;
  className?: string;
}) {
  const [previous, setPrevious] = useState<string | null>(null);
  const write = api.ai.writeField.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: ({ text }) => onChange(text),
  });
  const empty = (format === "html" ? htmlToText(value) : value.trim()).length === 0;

  const run = (mode: Mode) => {
    setPrevious(value);
    write.mutate({ form, field, mode, current: value, format, maxChars, context: context ?? {} });
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {previous !== null && !write.isPending && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
          }}
        >
          <Undo2 className="size-3.5" /> Undo
        </Button>
      )}
      {empty ? (
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={write.isPending} onClick={() => run("write")}>
          {write.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5 text-primary" />}
          Write with AI
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={write.isPending}>
              {write.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-primary" />}
              AI
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="flex items-center justify-between text-xs font-normal">
              Rewrite {field}
              <AiQuota kind="text" className="text-[10px]" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {REWRITES.map((r) => (
              <DropdownMenuItem key={r.mode} onSelect={() => run(r.mode)}>
                <r.icon className="size-4 text-muted-foreground" /> {r.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => run("write")}>
              <PenLine className="size-4 text-muted-foreground" /> Write a new one
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
