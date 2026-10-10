"use client";

import { AlertTriangle, Check, CircleSlash, ClipboardCheck, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { Progress } from "~/components/shadcn/ui/progress";
import type { ActionEdits, AgentBlock, NamedRef, PinDefaults, ProposedAction } from "~/lib/agent/contract";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

import type { ActionState } from "../use-agent-chat";
import { Card, ShortList, day, dayTime } from "./card-kit";
import { ANNOUNCEMENT_FIELDS, DraftFields, EVENT_FIELDS, HOTSPOT_FIELDS, PinSettings, PlacePicker } from "./proposal-forms";

type Proposal = Extract<AgentBlock, { kind: "proposal" }>;

const DESTRUCTIVE: ProposedAction["type"][] = ["hide_pins", "delete_event", "delete_announcement"];

/** A change the agent prepared. Nothing happens until the person confirms here. */
export function ProposalCard({
  block,
  state,
  busy,
  cancelling,
  onConfirm,
  onCancel,
}: {
  block: Proposal;
  state: ActionState | undefined;
  /** Confirming right now. */
  busy: boolean;
  cancelling: boolean;
  onConfirm: (edits?: ActionEdits) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { action } = block;
  const status = state?.status ?? "pending";
  const open = status === "pending";
  const locked = !open || busy || cancelling;

  // Editable parts of the proposal.
  const [keep, setKeep] = useState<Set<string>>(() => new Set(action.type === "create_pins" ? action.items.map((i) => i.key) : []));
  const [defaults, setDefaults] = useState<PinDefaults | null>(action.type === "create_pins" ? action.defaults : null);
  const initialDraft = useMemo(
    () =>
      (action.type === "create_event" ? action.event : action.type === "create_announcement" ? action.announcement : action.type === "create_hotspot" ? action.hotspot : null) as Record<
        string,
        unknown
      > | null,
    [action],
  );
  const [draft, setDraft] = useState(initialDraft);

  const destructive = DESTRUCTIVE.includes(action.type) || (action.type === "hotspot_state" && action.op === "delete");
  const confirmLabel =
    action.type === "create_pins"
      ? `Create ${keep.size} pin${keep.size === 1 ? "" : "s"}`
      : action.type === "hide_pins"
        ? `Delete ${action.pins.length} pin${action.pins.length === 1 ? "" : "s"}`
        : action.type === "hotspot_state"
          ? { pause: "Pause hotspot", resume: "Resume hotspot", delete: "Delete hotspot" }[action.op]
          : action.type.startsWith("delete_")
            ? "Delete"
            : action.type.startsWith("create_")
              ? action.type === "create_announcement"
                ? "Post"
                : "Create"
              : "Save changes";

  const confirm = () => {
    const edits: ActionEdits = {};
    if (action.type === "create_pins") {
      edits.keep = [...keep];
      edits.defaults = defaults ?? undefined;
    }
    if (draft) edits.draft = draft;
    void onConfirm(edits);
  };

  return (
    <Card icon={ClipboardCheck} title={block.summary} className={cn(open && "border-primary/40 ring-1 ring-primary/15")}>
      <Body action={action} keep={keep} setKeep={setKeep} defaults={defaults} setDefaults={setDefaults} draft={draft} setDraft={setDraft} locked={locked} />

      <footer className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {status === "pending" && (
          <>
            <Button size="sm" variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={busy || cancelling || (action.type === "create_pins" && keep.size === 0)}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />} {confirmLabel}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy || cancelling}>
              {cancelling && <Loader2 className="animate-spin" />} {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
            {state?.result?.message && <p className="w-full text-xs text-destructive">{state.result.message}</p>}
          </>
        )}
        {status === "running" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Working on it…
          </span>
        )}
        {status === "done" && (
          <div className="w-full space-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <Check className="size-3.5" /> {state?.result?.message ?? "Done"}
            </span>
            {state?.result?.pinJobId && <PinJobProgress jobId={state.result.pinJobId} />}
          </div>
        )}
        {status === "cancelled" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleSlash className="size-3.5" /> Cancelled
          </span>
        )}
        {status === "failed" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" /> {state?.result?.message ?? "This change couldn't be made."}
          </span>
        )}
      </footer>
    </Card>
  );
}

function Body({
  action,
  keep,
  setKeep,
  defaults,
  setDefaults,
  draft,
  setDraft,
  locked,
}: {
  action: ProposedAction;
  keep: Set<string>;
  setKeep: (k: Set<string>) => void;
  defaults: PinDefaults | null;
  setDefaults: (d: PinDefaults) => void;
  draft: Record<string, unknown> | null;
  setDraft: (d: Record<string, unknown>) => void;
  locked: boolean;
}) {
  switch (action.type) {
    case "create_pins":
      return (
        <>
          <PinSettings value={defaults!} onChange={setDefaults} disabled={locked} hasEvents={action.items.some((i) => i.kind === "event")} />
          <PlacePicker items={action.items} keep={keep} onChange={setKeep} disabled={locked} />
        </>
      );
    case "create_event":
      return <DraftFields fields={EVENT_FIELDS} value={draft!} onChange={setDraft} disabled={locked} />;
    case "create_announcement":
      return <DraftFields fields={ANNOUNCEMENT_FIELDS} value={draft!} onChange={setDraft} disabled={locked} />;
    case "create_hotspot":
      return (
        <>
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            A circle around {draft?.lat?.toString().slice(0, 7)}, {draft?.lng?.toString().slice(0, 8)} that drops new pins on a schedule.
          </p>
          <DraftFields fields={HOTSPOT_FIELDS} value={draft!} onChange={setDraft} disabled={locked} />
        </>
      );
    case "update_pins":
      return (
        <>
          <Changes changes={action.changes} />
          <Names items={action.pins} />
        </>
      );
    case "hide_pins":
      return (
        <>
          <p className="px-3 pt-2 text-xs text-muted-foreground">Deleted pins disappear from the map for fans. Their collection history stays in your reports.</p>
          <Names items={action.pins} />
        </>
      );
    case "update_hotspot":
      return <Changes changes={action.changes} />;
    case "update_event":
      return <Changes changes={action.changes} />;
    case "update_announcement":
      return <Changes changes={action.changes} />;
    case "hotspot_state":
      return action.op === "delete" ? <p className="px-3 pt-2 text-xs text-muted-foreground">The hotspot stops dropping pins and its live drops are removed.</p> : null;
    case "delete_event":
    case "delete_announcement":
      return <p className="px-3 pt-2 text-xs text-muted-foreground">This can&rsquo;t be undone.</p>;
  }
}

function Names({ items }: { items: NamedRef[] }) {
  return <ShortList items={items} initial={4} empty="" render={(p) => <li key={p.id} className="truncate px-3 py-1.5 text-sm">{p.title}</li>} />;
}

const LABEL: Record<string, string> = {
  title: "Title",
  description: "Description",
  body: "Message",
  startDate: "Starts",
  endDate: "Ends",
  link: "Link",
  image: "Image",
  collectionLimit: "Collection limit",
  autoCollect: "Auto-collect",
  dropEveryDays: "Drop every",
  pinDurationDays: "Each drop lasts",
  venueName: "Venue",
  address: "Address",
  capacity: "Capacity",
  pinned: "Pinned",
  ctaLabel: "Button text",
  ctaUrl: "Button link",
  expiresAt: "Hide after",
};

function show(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return dayTime(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return day(value);
  if (key === "dropEveryDays" || key === "pinDurationDays") return `${String(value)} days`;
  return String(value);
}

function Changes({ changes }: { changes: Record<string, unknown> }) {
  const rows = Object.entries(changes).filter(([k, v]) => v !== undefined && k !== "lat" && k !== "lng");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b px-3 py-2 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{LABEL[k] ?? k}</dt>
          <dd className="truncate font-medium">{show(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Live progress of a confirmed bulk pin creation. */
function PinJobProgress({ jobId }: { jobId: string }) {
  const utils = api.useUtils();
  const job = api.agent.pinJob.useQuery({ jobId }, { refetchInterval: (q) => (q.state.data?.status === "completed" || q.state.data?.status === "failed" ? false : 1500) });
  const finished = job.data?.status === "completed" || job.data?.status === "failed";
  useEffect(() => {
    if (finished) void utils.maps.pin.invalidate();
  }, [finished, utils]);

  if (!job.data) return null;
  const { total, completed, failed, status, error } = job.data;
  return (
    <div className="space-y-1">
      <Progress value={total ? (completed / total) * 100 : 0} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground">
        {status === "completed"
          ? `All ${total} pins are on the map.`
          : status === "failed"
            ? `${completed} of ${total} created${failed.length ? ` — couldn't create: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}` : error ? ` — ${error}` : ""}.`
            : completed === 0
              ? `Getting place details and tags for ${total} pins…`
              : `Creating pins… ${completed} of ${total}`}
      </p>
    </div>
  );
}
