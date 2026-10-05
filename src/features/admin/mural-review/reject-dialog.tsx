"use client";

import { Coins, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/shadcn/ui/alert-dialog";
import { Button } from "~/components/shadcn/ui/button";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

import { plural } from "./model";

type Reason = "NOT_A_MURAL" | "FRAUD";

const OPTIONS: { value: Reason; title: string; body: string; icon: typeof Trash2 }[] = [
  {
    value: "NOT_A_MURAL",
    title: "Not a mural",
    body: "An honest mistake — a poster, a sign, a plain wall. People keep the coins they earned.",
    icon: Trash2,
  },
  {
    value: "FRAUD",
    title: "Fraud / spam",
    body: "Faked or farmed. Coins earned from it are taken back (never below 0).",
    icon: ShieldAlert,
  },
];

/**
 * Rejecting a mural always asks why, because the reason decides what happens
 * to people's coins (plan §12.2). For FRAUD the dialog shows exactly how
 * much will be taken back before anything is confirmed.
 */
export function RejectDialog({
  ids,
  onOpenChange,
  busy,
  onConfirm,
}: {
  ids: string[] | null;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (reason: Reason) => void;
}) {
  // The parent keys this per selection, so each open starts on the safe reason.
  const [reason, setReason] = useState<Reason>("NOT_A_MURAL");

  const preview = api.admin.murals.revokePreview.useQuery(
    { ids: ids ?? [] },
    { enabled: Boolean(ids?.length) && reason === "FRAUD", refetchOnWindowFocus: false },
  );
  const n = ids?.length ?? 0;

  return (
    <AlertDialog open={Boolean(ids)} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-hud">Reject {n === 1 ? "this mural" : plural(n, "mural")}?</AlertDialogTitle>
          <AlertDialogDescription>It stops being collectable and disappears from every map.</AlertDialogDescription>
        </AlertDialogHeader>

        <div role="radiogroup" aria-label="Reason" className="space-y-2">
          {OPTIONS.map((o) => {
            const on = reason === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(o.value)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  on ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "hover:bg-accent",
                )}
              >
                <o.icon className={cn("mt-0.5 size-4 shrink-0", o.value === "FRAUD" ? "text-destructive" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{o.body}</span>
                </span>
              </button>
            );
          })}
        </div>

        {reason === "FRAUD" && (
          <p className="flex items-center gap-2 rounded-lg tone-danger px-3 py-2 text-sm">
            <Coins className="size-4 shrink-0" />
            {preview.isPending
              ? "Working out the coins…"
              : preview.data && preview.data.coins > 0
                ? `Takes back up to ${preview.data.coins.toLocaleString()} coins from ${plural(preview.data.users, "person", "people")}.`
                : "Nobody has coins from it to take back."}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(reason)}>
            {reason === "FRAUD" ? "Reject & take back coins" : "Reject"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
