"use client";

import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "~/components/shadcn/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/shadcn/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { EmptyState } from "~/ui/empty-state";
import { ErrorState } from "~/ui/error-state";
import { Skeleton } from "~/ui/skeleton";

/** What a column's loading placeholder looks like, so skeletons match the real rows. */
export type CellShape = "text" | "short" | "person" | "pill" | "number" | "mono" | "toggle" | "image";

export type Column<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Applied to both the header and the cells (widths, alignment). */
  className?: string;
  align?: "left" | "right" | "center";
  skeleton?: CellShape;
  /** Leave out of the phone card (e.g. a column already shown as the title). */
  hideOnMobile?: boolean;
  /** Label in the phone card; defaults to the header. */
  mobileLabel?: string;
};

export type RowAction = {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separator?: boolean;
};

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/**
 * The one table for the portal. Loading shows the real header with rows of
 * column-shaped placeholders; empty and error states sit inside the same
 * frame; rows can open a page and carry a "…" menu; on phones each row
 * becomes a card (title = first column, then label/value pairs).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  rowHref,
  onRowClick,
  actions,
  footer,
  skeletonRows = 8,
  className,
  label,
  selected,
  onSelectedChange,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode };
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => RowAction[];
  footer?: ReactNode;
  skeletonRows?: number;
  className?: string;
  /** Accessible name for the table. */
  label?: string;
  /** Row selection (checkbox column) — pass both to turn it on. */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
}) {
  const router = useRouter();
  const open = (row: T) => {
    const href = rowHref?.(row);
    if (href) router.push(href);
    else onRowClick?.(row);
  };
  const clickable = Boolean(rowHref ?? onRowClick);
  const [primary, ...rest] = columns;
  const selectable = Boolean(selected && onSelectedChange);
  const ids = rows?.map((r) => String(rowKey(r))) ?? [];
  const allOn = selectable && ids.length > 0 && ids.every((id) => selected!.has(id));
  const someOn = selectable && !allOn && ids.some((id) => selected!.has(id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectedChange?.(next);
  };
  const toggleAll = (on: boolean) => onSelectedChange?.(on ? new Set([...(selected ?? []), ...ids]) : new Set([...(selected ?? [])].filter((id) => !ids.includes(id))));

  if (error) return <ErrorState message={error} onRetry={onRetry} className={className} />;
  if (!loading && rows?.length === 0)
    return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} className={className} />;

  return (
    <div className={className}>
      {/* ── Desktop / tablet: a real table ─────────────────────────────── */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={label} aria-busy={loading ? true : undefined}>
            <thead className="border-b bg-muted/50">
              <tr>
                {selectable && (
                  <th className="w-10 pl-4">
                    <Check checked={allOn} indeterminate={someOn} onChange={toggleAll} label="Select all rows" />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c.id} scope="col" className={cn("label-caps h-10 whitespace-nowrap px-4 font-semibold", ALIGN[c.align ?? "left"], c.className)}>
                    {c.header}
                  </th>
                ))}
                {actions && (
                  <th className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading
                ? Array.from({ length: skeletonRows }).map((_, r) => (
                    <tr key={r}>
                      {selectable && (
                        <td className="pl-4">
                          <Skeleton className="size-4 rounded" />
                        </td>
                      )}
                      {columns.map((c, i) => (
                        <td key={c.id} className={cn("px-4 py-3", c.className)}>
                          <CellSkeleton shape={c.skeleton ?? (i === 0 ? "person" : "text")} align={c.align} seed={r + i} />
                        </td>
                      ))}
                      {actions && (
                        <td className="px-2 py-3">
                          <Skeleton className="mx-auto size-7 rounded-md" />
                        </td>
                      )}
                    </tr>
                  ))
                : rows?.map((row) => (
                    <tr
                      key={rowKey(row)}
                      onClick={clickable ? () => open(row) : undefined}
                      className={cn(
                        "group transition-colors hover:bg-muted/40",
                        clickable && "cursor-pointer",
                        selectable && selected!.has(String(rowKey(row))) && "bg-primary/5 hover:bg-primary/8",
                      )}
                    >
                      {selectable && (
                        <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                          <Check checked={selected!.has(String(rowKey(row)))} onChange={(on) => toggle(String(rowKey(row)), on)} label="Select row" />
                        </td>
                      )}
                      {columns.map((c, i) => (
                        <td key={c.id} className={cn("px-4 py-3 align-middle", ALIGN[c.align ?? "left"], c.className)}>
                          {i === 0 && rowHref?.(row) ? (
                            // A real link in the first cell: keyboard and middle-click work.
                            <Link href={rowHref(row)!} onClick={(e) => e.stopPropagation()} className="block rounded-sm focus-visible:outline-2 focus-visible:outline-primary">
                              {c.cell(row)}
                            </Link>
                          ) : (
                            c.cell(row)
                          )}
                        </td>
                      ))}
                      {actions && (
                        <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <RowMenu items={actions(row)} />
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Phones: one card per row ───────────────────────────────────── */}
      <ul className="space-y-2 md:hidden" aria-label={label} aria-busy={loading ? true : undefined}>
        {loading
          ? Array.from({ length: Math.min(skeletonRows, 5) }).map((_, r) => (
              <li key={r} className="space-y-3 rounded-xl border bg-card p-4">
                <CellSkeleton shape={primary?.skeleton ?? "person"} seed={r} />
                <div className="grid grid-cols-2 gap-3">
                  {rest.slice(0, 4).map((c, i) => (
                    <div key={c.id} className="space-y-1.5">
                      <Skeleton className="h-2.5 w-14" />
                      <CellSkeleton shape={c.skeleton ?? "text"} seed={r + i} />
                    </div>
                  ))}
                </div>
              </li>
            ))
          : rows?.map((row) => (
              <li key={rowKey(row)} className={cn("rounded-xl border bg-card", selectable && selected!.has(String(rowKey(row))) && "border-primary/50 bg-primary/5")}>
                <div className="flex items-start gap-2 p-4 pb-3">
                  {selectable && (
                    <div className="pt-2.5">
                      <Check checked={selected!.has(String(rowKey(row)))} onChange={(on) => toggle(String(rowKey(row)), on)} label="Select row" />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => open(row)}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    {primary?.cell(row)}
                  </button>
                  {actions && <RowMenu items={actions(row)} />}
                </div>
                {rest.some((c) => !c.hideOnMobile) && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t px-4 py-3">
                    {rest
                      .filter((c) => !c.hideOnMobile)
                      .map((c) => (
                        <div key={c.id} className="min-w-0">
                          <dt className="label-caps text-[10px]">{c.mobileLabel ?? c.header}</dt>
                          <dd className="mt-1 min-w-0 truncate text-sm">{c.cell(row)}</dd>
                        </div>
                      ))}
                  </dl>
                )}
              </li>
            ))}
      </ul>

      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

export function RowMenu({ items }: { items: RowAction[] }) {
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Row actions" className="text-muted-foreground">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((a, i) => (
          <div key={a.label}>
            {a.separator && i > 0 && <DropdownMenuSeparator />}
            {a.href ? (
              <DropdownMenuItem asChild disabled={a.disabled} className={cn(a.destructive && "text-destructive focus:text-destructive")}>
                <Link href={a.href}>
                  {a.icon && <a.icon />} {a.label}
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={a.disabled}
                onSelect={() => a.onSelect?.()}
                className={cn(a.destructive && "text-destructive focus:text-destructive")}
              >
                {a.icon && <a.icon />} {a.label}
              </DropdownMenuItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Varied but stable widths so a loading table doesn't look like a barcode. */
const TEXT_WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-16"];

function CellSkeleton({ shape, align, seed }: { shape: CellShape; align?: "left" | "right" | "center"; seed: number }) {
  const w = TEXT_WIDTHS[seed % TEXT_WIDTHS.length];
  const justify = align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : "";
  switch (shape) {
    case "person":
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className={cn("h-3.5", seed % 2 ? "w-32" : "w-24")} />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      );
    case "image":
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <Skeleton className={cn("h-3.5", w)} />
        </div>
      );
    case "pill":
      return <Skeleton className={cn("h-5 w-16 rounded-full", justify)} />;
    case "toggle":
      return <Skeleton className={cn("h-5 w-9 rounded-full", justify)} />;
    case "number":
      return <Skeleton className={cn("h-3.5 w-10", justify)} />;
    case "mono":
      return <Skeleton className={cn("h-3 w-28", justify)} />;
    case "short":
      return <Skeleton className={cn("h-3.5 w-16", justify)} />;
    default:
      return <Skeleton className={cn("h-3.5", w, justify)} />;
  }
}

/** A plain checkbox (supports the "some selected" state for select-all). */
export function Check({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate);
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer rounded accent-primary"
    />
  );
}
