"use client";

import { format, parseISO } from "date-fns";
import { Activity, AlertTriangle, CheckCircle2, Coins, DollarSign, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Avatar } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";
import { StatCard } from "~/ui/stat-card";
import { StatusPill } from "~/ui/status-pill";
import { FilterChips } from "~/ui/toolbar";
import { api, type RouterOutputs } from "~/utils/api";

type Insights = RouterOutputs["admin"]["murals"]["insights"];
type Range = "7" | "30" | "90";

/** Reject codes in plain words (wadzzoAR `REJECT_COPY`, shortened). */
const REASON_LABEL: Record<string, string> = {
  NOT_ART: "Not street art",
  SCREEN: "Screen or photo",
  WEB_COPY: "Copy of a web image",
  GPS_WEAK: "Weak or fake GPS",
  NO_SWEEP: "Didn't turn enough",
  DAILY_LIMIT: "Daily limit",
  MURAL_REJECTED: "Rejected mural",
  UNSAFE: "Unsafe image",
  RATE_LIMIT: "Rate limited",
  SESSION_EXPIRED: "Took too long",
};

/**
 * Admin › Mural review › Insights: is the feature being used, what is it
 * costing, and is anyone farming it. Every number comes from
 * MuralScanSession (one row per attempt) and the coin ledger.
 *
 * Charts are hand-built SVG/HTML (no chart library in the portal). Two
 * categorical series (accepted / rejected) — validated for CVD and contrast
 * against the card surface in both themes (dataviz validator, 2026-10-04).
 */
export function InsightsPanel() {
  const [range, setRange] = useState<Range>("30");
  const q = api.admin.murals.insights.useQuery({ days: Number(range) as 7 | 30 | 90 }, { refetchOnWindowFocus: false });

  return (
    <div className="mural-viz space-y-5">
      <FilterChips
        label="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
        ]}
      />

      {q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : q.data.totals.attempts === 0 ? (
        <EmptyState icon={Activity} title="No scans yet" description="Numbers appear here as soon as people start using the Murals camera." />
      ) : (
        <InsightsView data={q.data} />
      )}
    </div>
  );
}

export function InsightsView({ data }: { data: Insights }) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      <style>{VIZ_CSS}</style>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Scan attempts" value={t.attempts.toLocaleString()} hint={`${t.accepted.toLocaleString()} accepted`} icon={Activity} />
        <StatCard label="Accepted" value={`${Math.round(t.acceptRate * 100)}%`} hint="of finished attempts" icon={CheckCircle2} />
        <StatCard label="Cloud Vision" value={`$${t.estVisionUsd.toFixed(2)}`} hint={`${t.visionUnits.toLocaleString()} units · list-price estimate`} icon={DollarSign} />
        <StatCard
          label="Coins issued"
          value={t.coinsIssued.toLocaleString()}
          hint={t.coinsRevoked > 0 ? `${t.coinsRevoked.toLocaleString()} taken back (fraud)` : "none taken back"}
          icon={Coins}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 lg:col-span-2">
          <DailyChart daily={data.daily} />
        </section>
        <section className="rounded-xl border bg-card p-4">
          <ReasonBars reasons={data.reasons} />
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">Most active accounts</h3>
            <p className="text-xs text-muted-foreground">Top 15 by attempts. Screen, web-copy and GPS rejects are the farming signals.</p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Attempts</th>
                <th className="px-3 py-2 text-right font-medium">Accepted</th>
                <th className="px-3 py-2 text-right font-medium">Spoof-like</th>
                <th className="px-3 py-2 text-right font-medium">Vision units</th>
                <th className="px-4 py-2 text-right font-medium">Coins</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2 hover:underline">
                      <Avatar src={u.image} name={u.name} className="size-7" />
                      <span className="truncate">{u.name ?? "Unnamed"}</span>
                      {u.newAccount && (
                        <StatusPill tone="warning" icon={UserPlus}>
                          New
                        </StatusPill>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.attempts}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.accepted}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.spoofLike > 0 ? (
                      <StatusPill tone="danger" icon={AlertTriangle}>
                        {u.spoofLike}
                      </StatusPill>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.visionUnits}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{u.coins.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Daily attempts: stacked bars, accepted (bottom) + rejected ──────────────

const H = 200;
const PAD = { top: 8, right: 8, bottom: 22, left: 34 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= v)! * pow;
  return step * 4;
}

function DailyChart({ daily }: { daily: Insights["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = useMemo(() => niceMax(Math.max(...daily.map((d) => d.accepted + d.rejected))), [daily]);
  const W = 640;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / daily.length;
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const labelEvery = Math.ceil(daily.length / 6);
  const hd = hover != null ? daily[hover] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Scan attempts per day</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Legend swatch="var(--viz-s1)" label="Accepted" />
          <Legend swatch="var(--viz-s2)" label="Rejected" />
          <button type="button" onClick={() => setTable((v) => !v)} className="text-primary hover:underline">
            {table ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {table ? (
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Accepted</th>
                <th className="py-1 text-right font-medium">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="py-1">{format(parseISO(d.day), "MMM d")}</td>
                  <td className="py-1 text-right tabular-nums">{d.accepted}</td>
                  <td className="py-1 text-right tabular-nums">{d.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Scan attempts per day, accepted and rejected" onMouseLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="viz-grid" />
                <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="viz-axis">
                  {Number.isInteger(v) ? v : v.toFixed(1)}
                </text>
              </g>
            ))}
            {daily.map((d, i) => {
              const x = PAD.left + i * slot + (slot - barW) / 2;
              const accTop = y(d.accepted);
              const total = d.accepted + d.rejected;
              const rejTop = y(total);
              const gap = d.accepted > 0 && d.rejected > 0 ? 2 : 0; // surface gap between stacked fills
              return (
                <g key={d.day} opacity={hover == null || hover === i ? 1 : 0.45}>
                  {d.accepted > 0 && <Bar x={x} w={barW} top={accTop} bottom={y(0)} fill="var(--viz-s1)" round={d.rejected === 0} />}
                  {d.rejected > 0 && <Bar x={x} w={barW} top={rejTop} bottom={accTop - gap} fill="var(--viz-s2)" round />}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="viz-axis">
                      {format(parseISO(d.day), "MMM d")}
                    </text>
                  )}
                  {/* Hit target: the whole column, bigger than the mark. */}
                  <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="viz-baseline" />
          </svg>
          {hd && hover != null && (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{ left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%`, transform: `translateX(${hover > daily.length / 2 ? "-105%" : "5%"})` }}
            >
              <p className="font-semibold">{format(parseISO(hd.day), "EEE, MMM d")}</p>
              <p className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: "var(--viz-s1)" }} /> Accepted <b className="ml-auto pl-3 tabular-nums">{hd.accepted}</b>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: "var(--viz-s2)" }} /> Rejected <b className="ml-auto pl-3 tabular-nums">{hd.rejected}</b>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A bar segment with 4px rounded top corners (only on the topmost segment). */
function Bar({ x, w, top, bottom, fill, round }: { x: number; w: number; top: number; bottom: number; fill: string; round: boolean }) {
  const h = Math.max(0, bottom - top);
  if (h <= 0) return null;
  const r = round ? Math.min(4, w / 2, h) : 0;
  const d = `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
  return <path d={d} fill={fill} />;
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: swatch }} />
      {label}
    </span>
  );
}

// ── Reject reasons: one series, horizontal bars ────────────────────────────

function ReasonBars({ reasons }: { reasons: Insights["reasons"] }) {
  const max = Math.max(1, ...reasons.map((r) => r.count));
  const total = reasons.reduce((n, r) => n + r.count, 0);
  return (
    <div>
      <h3 className="font-semibold">Why scans were rejected</h3>
      <p className="mb-3 text-xs text-muted-foreground">{total.toLocaleString()} rejected attempts</p>
      {reasons.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing rejected in this range.</p>
      ) : (
        <ul className="space-y-2.5">
          {reasons.map((r) => (
            <li key={r.code} title={`${REASON_LABEL[r.code] ?? r.code}: ${r.count}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate">{REASON_LABEL[r.code] ?? r.code}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.count} · {Math.round((r.count / total) * 100)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className={cn("h-2 rounded-full")} style={{ width: `${(r.count / max) * 100}%`, background: "var(--viz-s2)" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Series colours by role, light and dark (validated: CVD ΔE ≥ 24, contrast
 * ≥ 3:1 on #ffffff and #131b17). Grid and axes stay recessive.
 */
const VIZ_CSS = `
.mural-viz { --viz-s1: #2a78d6; --viz-s2: #eb6834; }
.dark .mural-viz { --viz-s1: #3987e5; --viz-s2: #d95926; }
.mural-viz .viz-grid { stroke: var(--color-border); stroke-width: 1; opacity: .6; }
.mural-viz .viz-baseline { stroke: var(--color-muted-foreground); stroke-width: 1; opacity: .6; }
.mural-viz .viz-axis { fill: var(--color-muted-foreground); font-size: 10px; }
`;
