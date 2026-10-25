import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { PageHeader } from "./page-header";

/**
 * Layout for the create/edit pages (pins, hotspots, bounties, posts, assets).
 * Desktop: form on the left, a sticky side column (map, preview, summary) on
 * the right. Phone: one column with the actions pinned above the tab bar.
 */
export function FormPage({
  title,
  description,
  back,
  aside,
  actions,
  children,
  onSubmit,
}: {
  title: string;
  description?: string;
  back: { href: string; label: string };
  aside?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-6xl px-4 pt-5 pb-40 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
      noValidate
    >
      <PageHeader
        title={title}
        description={description}
        back={back}
        actions={<div className="hidden items-center gap-2 lg:flex">{actions}</div>}
      />
      <div className={cn("mt-6 grid gap-6", aside && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="min-w-0 space-y-5">{children}</div>
        {aside && <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">{aside}</aside>}
      </div>
      {/* Phone: actions stay reachable above the tab bar. */}
      <div className="bg-card fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-30 flex items-center justify-end gap-2 border-t-2 px-4 py-3 lg:hidden">
        {actions}
      </div>
    </form>
  );
}

/** One titled block of a form page. */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("bg-card border-foreground/10 rounded-[1.4rem] border-2 p-5", className)}
    >
      <div className="mb-4">
        <h2 className="display flex items-center gap-2.5 text-2xl">
          {Icon && (
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 -rotate-6 items-center justify-center rounded-lg">
              <Icon className="size-4" strokeWidth={2.4} />
            </span>
          )}
          {title}
        </h2>
        {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Label + control + error, the same everywhere. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Shown at the end of the label row (e.g. the AI button). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
