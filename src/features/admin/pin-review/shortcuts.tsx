"use client";

import { Keyboard } from "lucide-react";
import { useEffect, useRef } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/shadcn/ui/dialog";

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["J"], label: "Next pin" },
  { keys: ["K"], label: "Previous pin" },
  { keys: ["Enter"], label: "Open / close the preview" },
  { keys: ["X"], label: "Select or unselect" },
  { keys: ["A"], label: "Approve (selected pins, or the current one)" },
  { keys: ["R"], label: "Reject (selected pins, or the current one)" },
  { keys: ["E"], label: "Edit the current pin" },
  { keys: ["L"], label: "Show or hide its locations" },
  { keys: ["Esc"], label: "Clear the selection" },
  { keys: ["?"], label: "Show these shortcuts" },
];

export type ShortcutHandlers = Partial<Record<"next" | "prev" | "open" | "select" | "approve" | "reject" | "edit" | "locations" | "escape" | "help", () => void>>;

const KEYMAP: Record<string, keyof ShortcutHandlers> = {
  j: "next",
  k: "prev",
  Enter: "open",
  x: "select",
  a: "approve",
  r: "reject",
  e: "edit",
  l: "locations",
  Escape: "escape",
  "?": "help",
};

/**
 * Pin review's keyboard shortcuts. Ignored while typing, with a modifier held,
 * or while `paused` (a dialog is open). Escape is left to open overlays.
 */
export function useReviewShortcuts(handlers: ShortcutHandlers, paused: boolean) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Enter on a focused button/link should do what that control does.
      if (e.key === "Enter" && t && /^(BUTTON|A)$/.test(t.tagName)) return;
      const action = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? (e.key === "?" ? "help" : undefined);
      const fn = action && ref.current[action];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-hud">
            <Keyboard className="size-5 text-primary" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Review pins without the mouse. Every approve and reject can be undone from the message that follows.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
