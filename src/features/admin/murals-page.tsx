"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check as CheckIcon,
  CheckCircle2,
  BarChart3,
  Clock,
  Copy,
  Frame,
  RotateCcw,
  Settings2,
  ShieldX,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import toast, { type Toast } from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { PageBody, PageHeader } from "~/ui/page-header";
import { Avatar } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatusPill } from "~/ui/status-pill";
import { FilterChips, SearchInput } from "~/ui/toolbar";
import { api } from "~/utils/api";

import { plural, REJECT_LABEL, VIEW_STATUS, type MuralRow, type View } from "./mural-review/model";
import { InsightsPanel } from "./mural-review/insights-panel";
import { MuralPreviewSheet } from "./mural-review/preview-sheet";
import { RejectDialog } from "./mural-review/reject-dialog";
import { SettingsPanel } from "./mural-review/settings-panel";

const VIEWS: View[] = ["pending", "gathering", "approved", "rejected", "insights", "settings"];
const LISTS = new Set<View>(["pending", "gathering", "approved", "rejected"]);

/**
 * Admin › Mural review (wadzzoAR/docs/murals/plan.md §9).
 *
 * Murals come from users, not brands: anyone scanning street art creates
 * one, and it lands here once enough different people have found it. Cards
 * rather than rows because the decision is visual — is that a mural? — so
 * the photo leads. Flags call out what deserves a closer look before
 * approving. Decisions apply at once with an Undo, like Pin review; reject
 * always asks why because the reason decides what happens to coins.
 */
export default function MuralReviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params?.get("view") ?? "";
  const view: View = VIEWS.includes(raw as View) ? (raw as View) : "pending";
  const base = pathname ?? "/admin/murals";
  const setView = (v: View) => router.replace(v === "pending" ? base : `${base}?view=${v}`, { scroll: false });

  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);

  const counts = api.admin.murals.counts.useQuery(undefined, { refetchOnWindowFocus: false });
  const list = api.admin.murals.list.useQuery(
    { status: view === "settings" || view === "insights" ? "PENDING" : VIEW_STATUS[view] },
    { enabled: LISTS.has(view), refetchOnWindowFocus: false },
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = list.data?.murals ?? [];
    return q ? all.filter((m) => m.title.toLowerCase().includes(q) || m.artist?.toLowerCase().includes(q)) : all;
  }, [list.data, search]);

  // ── Decisions with undo ─────────────────────────────────────────────────
  const utils = api.useUtils();
  const refresh = () => {
    void utils.admin.murals.list.invalidate();
    void utils.admin.murals.counts.invalidate();
    void utils.admin.murals.byId.invalidate();
  };
  const decide = api.admin.murals.decide.useMutation({ onSettled: refresh });
  const busy = decide.isPending;

  const undoable = (message: string, undo: () => Promise<unknown>) =>
    toast(
      (t: Toast) => (
        <span className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-success" />
          {message}
          <button
            type="button"
            className="ml-1 rounded px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/10"
            onClick={() => {
              toast.dismiss(t.id);
              undo().then(
                () => toast.success("Undone"),
                (e: Error) => toast.error(e.message),
              );
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 7000 },
    );

  /** Where a mural goes back to when a decision is undone. */
  const previous = (id: string) => {
    const m = list.data?.murals.find((x) => x.id === id);
    return m ? { status: m.status === "DISCOVERED" ? ("PENDING" as const) : m.status, reason: m.rejectReason ?? undefined } : null;
  };

  const apply = (ids: string[], status: "PENDING" | "APPROVED" | "REJECTED", reason: "NOT_A_MURAL" | "FRAUD" | undefined, message: string) => {
    const before = ids.map((id) => ({ id, prev: previous(id) }));
    if (previewId && ids.includes(previewId)) step(1, ids);
    decide.mutate(
      { ids, status, reason },
      {
        onSuccess: ({ revoked }) => {
          const extra = revoked.coins > 0 ? ` · ${revoked.coins.toLocaleString()} coins taken back` : "";
          undoable(message + extra, async () => {
            for (const b of before) {
              if (b.prev) await decide.mutateAsync({ ids: [b.id], status: b.prev.status, reason: b.prev.reason });
            }
          });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const approve = (id: string) => apply([id], "APPROVED", undefined, "Approved — it's on every map");
  const moveBack = (id: string) => apply([id], "PENDING", undefined, "Moved back to review");

  // ── Preview stepping ────────────────────────────────────────────────────
  const index = previewId ? rows.findIndex((m) => m.id === previewId) : -1;
  function step(dir: 1 | -1, leaving: string[] = []) {
    if (index < 0) return;
    const pool = rows.filter((m) => !leaving.includes(m.id) || m.id === previewId);
    const i = pool.findIndex((m) => m.id === previewId);
    const next = pool[i + dir];
    setPreviewId(next && !leaving.includes(next.id) ? next.id : null);
  }

  const c = counts.data;
  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Mural review"
        description="Street art people found with the Murals camera. It lands here once enough different people have scanned it."
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterChips
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "pending", label: "Waiting for review", icon: Clock, count: c?.PENDING },
            { value: "gathering", label: "Gathering finders", icon: Users, count: c?.DISCOVERED },
            { value: "approved", label: "Approved", icon: CheckCircle2, count: c?.APPROVED },
            { value: "rejected", label: "Rejected", icon: ShieldX, count: c?.REJECTED },
            { value: "insights", label: "Insights", icon: BarChart3 },
            { value: "settings", label: "Settings", icon: Settings2 },
          ]}
        />
        {LISTS.has(view) && (
          <div className="sm:ml-auto">
            <SearchInput onSearch={setSearch} placeholder="Search title or artist" />
          </div>
        )}
      </div>

      <div className="mt-5">
        {view === "settings" ? (
          <SettingsPanel />
        ) : view === "insights" ? (
          <InsightsPanel />
        ) : list.isPending ? (
          <GridSkeleton />
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={view === "pending" ? CheckCircle2 : Frame}
            title={search ? "No murals match" : view === "pending" ? "All caught up" : view === "gathering" ? "Nothing gathering" : `No ${view} murals`}
            description={
              search
                ? "Try another title or artist."
                : view === "pending"
                  ? "Murals arrive here once enough different people have scanned them."
                  : view === "gathering"
                    ? "Fresh finds wait here until enough people confirm them. They can already be collected."
                    : undefined
            }
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {plural(rows.length, "mural")}
              {view === "gathering" && " · collectable already; approve early if it's clearly a mural"}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {rows.map((m) => (
                <MuralCard
                  key={m.id}
                  m={m}
                  needed={list.data?.confirmationsNeeded ?? 3}
                  busy={busy}
                  focused={m.id === previewId}
                  onOpen={() => setPreviewId(m.id)}
                  onApprove={() => approve(m.id)}
                  onReject={() => setRejectIds([m.id])}
                  onMoveBack={() => moveBack(m.id)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <MuralPreviewSheet
        id={previewId}
        onClose={() => setPreviewId(null)}
        busy={busy}
        actions={{ approve, reject: (id) => setRejectIds([id]), moveBack }}
        position={index >= 0 ? { index, total: rows.length } : null}
        onStep={(d) => step(d)}
      />

      <RejectDialog
        key={rejectIds?.join(",") ?? "closed"}
        ids={rejectIds}
        onOpenChange={(o) => !o && setRejectIds(null)}
        busy={busy}
        onConfirm={(reason) => {
          const ids = rejectIds ?? [];
          setRejectIds(null);
          apply(ids, "REJECTED", reason, `Rejected · ${REJECT_LABEL[reason]}`);
        }}
      />
    </PageBody>
  );
}

function Flags({ m }: { m: MuralRow }) {
  const items: { icon: typeof Zap; label: string; title: string }[] = [];
  if (m.flags.newAccounts > 0) items.push({ icon: UserPlus, label: m.flags.newAccounts === 1 ? "New account" : `${m.flags.newAccounts} new accounts`, title: "A first finder joined in the last 7 days" });
  if (m.flags.quickConfirm) items.push({ icon: Zap, label: "Quick confirm", title: "Two first finders scanned within 2 minutes of each other" });
  if (m.flags.borderline) items.push({ icon: AlertTriangle, label: "Check photos", title: "Vision saw a possible screen, or the art score was low" });
  if (m.flags.duplicates > 0) items.push({ icon: Copy, label: "Possible duplicate", title: `${plural(m.flags.duplicates, "other mural")} within 50 m` });
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((f) => (
        <span key={f.label} title={f.title}>
          <StatusPill tone="warning" icon={f.icon}>
            {f.label}
          </StatusPill>
        </span>
      ))}
    </div>
  );
}

function MuralCard({
  m,
  needed,
  busy,
  focused,
  onOpen,
  onApprove,
  onReject,
  onMoveBack,
}: {
  m: MuralRow;
  needed: number;
  busy: boolean;
  focused: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onMoveBack: () => void;
}) {
  const open = m.status === "PENDING" || m.status === "DISCOVERED";
  return (
    <li className={cn("flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow", focused && "ring-2 ring-primary")}>
      <button type="button" onClick={onOpen} className="group relative block aspect-[4/3] w-full overflow-hidden bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute top-2 left-2 flex gap-1">
          {m.status === "REJECTED" && m.rejectReason && <StatusPill tone="danger">{REJECT_LABEL[m.rejectReason]}</StatusPill>}
          {m.status === "APPROVED" && (
            <StatusPill tone="success" dot>
              On maps
            </StatusPill>
          )}
        </span>
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
          {Array.from({ length: needed }, (_, i) => (
            <span key={i} className={cn("size-1.5 rounded-full", i < m.distinctScanners ? "bg-white" : "bg-white/30")} />
          ))}
          <span className="ml-1 tabular-nums">{m.distinctScanners}</span>
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <span className="block truncate font-semibold">{m.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {m.artist ? `by ${m.artist} · ` : m.autoTitled ? "Not named · " : ""}
            {plural(m.scanCount, "scan")} · found {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">
            {m.finders.slice(0, 4).map((f) => (
              <span key={f.id} title={`#${f.rank} ${f.name ?? ""}`}>
                <Avatar src={f.image} name={f.name} className="size-6 ring-2 ring-card" />
              </span>
            ))}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {m.finders[0]?.name ?? "Someone"}
            {m.finders.length > 1 && ` + ${m.finders.length - 1}`}
          </span>
        </div>

        <Flags m={m} />

        <div className="mt-auto flex gap-2 pt-1">
          {open ? (
            <>
              <Button size="sm" variant="outline" className="flex-1 text-destructive hover:text-destructive" disabled={busy} onClick={onReject}>
                <X /> Reject
              </Button>
              <Button size="sm" className="flex-1" disabled={busy} onClick={onApprove}>
                <CheckIcon /> Approve
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={onMoveBack}>
              <RotateCcw /> Move back to review
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
