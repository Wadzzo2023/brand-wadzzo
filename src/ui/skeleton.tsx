import { cn } from "~/lib/utils";

/**
 * ── Consistent Skeleton Components ──────────────────────────────────────────
 *
 * Placeholders shaped like the content that's arriving, with the shared sweep
 * animation (see `.skeleton` in globals.css).
 *
 * Skeletons occupy the exact dimensions of real UI, preventing layout jumps
 * and giving the user an immediate preview of the interface structure.
 */

/** Shape-matched placeholder with the shared sweep. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} {...props} />;
}

/** A complete table-shaped placeholder with header and animated rows. */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  colWidths,
  className,
}: {
  rows?: number;
  cols?: number;
  colWidths?: string[];
  className?: string;
}) {
  const widths = colWidths ?? ["w-10", "w-44", "w-32", "w-24", "w-20"];
  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden shadow-xs", className)} role="status" aria-label="Loading table">
      <div className="border-b bg-muted/40 px-4 py-3 flex items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-4", widths[i % widths.length] ?? "w-24")} />
        ))}
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn(
                  "h-4",
                  c === 0 ? "h-4 w-6 shrink-0" : widths[c % widths.length] ?? "w-24",
                  r % 2 === 1 && c > 0 ? "opacity-80" : ""
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A page-shaped placeholder: header + a grid of cards. */
export function PageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** A grid of KPI stat cards for dashboard and report views. */
export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading statistics">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Card placeholder for grids (posts, bounties, gifts). */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5 space-y-4 shadow-xs", className)} role="status" aria-label="Loading card">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-36 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/** Form placeholder for edit and creation pages. */
export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn("space-y-6 max-w-2xl", className)} role="status" aria-label="Loading form">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="rounded-xl border bg-card p-6 space-y-6 shadow-xs">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Detail page placeholder for creator, user, or pin detail views. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading details">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4 shadow-xs">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4 shadow-xs">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Map loading placeholder with HUD controls. */
export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative size-full min-h-[500px] overflow-hidden rounded-xl border bg-surface-2", className)} role="status" aria-label="Loading map">
      <div className="absolute inset-0 skeleton" />
      <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-64 rounded-lg bg-card/80 shadow-sm" />
        <Skeleton className="h-10 w-36 rounded-lg bg-card/80 shadow-sm" />
        <Skeleton className="ml-auto h-10 w-32 rounded-lg bg-card/80 shadow-sm" />
      </div>
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
        <Skeleton className="size-9 rounded-lg bg-card/80 shadow-sm" />
        <Skeleton className="size-9 rounded-lg bg-card/80 shadow-sm" />
      </div>
    </div>
  );
}

/** Full report view skeleton with stats and data table. */
export function ReportSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading report">
      <StatCardSkeleton count={4} />
      <TableSkeleton rows={8} cols={6} colWidths={["w-12", "w-40", "w-32", "w-28", "w-24", "w-20"]} />
    </div>
  );
}

/** Standard row/list skeleton. */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
