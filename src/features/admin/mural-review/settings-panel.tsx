"use client";

import { Coins, Info, Save, Sparkles, Users, Repeat } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Input } from "~/components/shadcn/ui/input";
import { ErrorState } from "~/ui/error-state";
import { Skeleton } from "~/ui/skeleton";
import { api } from "~/utils/api";

type Form = { coinsPerScan: number; discoveryBonus: number; dailyScansPerMural: number; confirmationsNeeded: number };

const FIELDS: { key: keyof Form; label: string; help: string; icon: typeof Coins; min: number; max: number; suffix: string }[] = [
  { key: "coinsPerScan", label: "Coins per scan", help: "Every valid scan, approved or not.", icon: Coins, min: 0, max: 10_000, suffix: "coins" },
  { key: "discoveryBonus", label: "Discovery bonus", help: "Extra for each of the first finders.", icon: Sparkles, min: 0, max: 100_000, suffix: "coins" },
  { key: "dailyScansPerMural", label: "Scans per mural per day", help: "Per person; resets at their local midnight. Other murals are unlimited.", icon: Repeat, min: 1, max: 50, suffix: "scans" },
  { key: "confirmationsNeeded", label: "Finders before review", help: "Different people who must scan it before it reaches Pending. They all get the bonus.", icon: Users, min: 1, max: 20, suffix: "people" },
];

/** Admin › Mural review › Settings — the single MuralSettings row. */
export function SettingsPanel() {
  const utils = api.useUtils();
  const q = api.admin.murals.settings.useQuery(undefined, { refetchOnWindowFocus: false });
  // Unsaved edits; null = showing what's saved.
  const [draft, setDraft] = useState<Form | null>(null);
  const save = api.admin.murals.updateSettings.useMutation({
    onSuccess: (s) => {
      utils.admin.murals.settings.setData(undefined, s);
      setDraft(null);
      toast.success("Mural settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-80 w-full max-w-2xl rounded-xl" />;
  const form: Form = draft ?? q.data;

  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== q.data[k]);
  const valid = FIELDS.every((f) => Number.isInteger(form[f.key]) && form[f.key] >= f.min && form[f.key] <= f.max);

  return (
    <form
      className="max-w-2xl rounded-xl border bg-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate(form);
      }}
    >
      <div className="divide-y">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <f.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-sm font-semibold">{f.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{f.help}</span>
              </span>
            </span>
            <span className="flex items-center gap-2 sm:w-44">
              <Input
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={1}
                value={Number.isNaN(form[f.key]) ? "" : form[f.key]}
                onChange={(e) => setDraft({ ...form, [f.key]: e.target.valueAsNumber })}
                className="tabular-nums"
              />
              <span className="w-12 text-xs text-muted-foreground">{f.suffix}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" /> Applies to new scans from now; past coins don&apos;t change.
        </p>
        <div className="ml-auto flex gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Reset
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!dirty || !valid || save.isPending}>
            <Save /> {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
