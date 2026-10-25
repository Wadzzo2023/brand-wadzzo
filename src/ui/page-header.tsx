import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

/**
 * Every page's top: optional back link, eyebrow, title, one-line description,
 * and actions on the right (stacking under the title on phones).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs font-bold tracking-wider uppercase"
          >
            <ChevronLeft className="size-3.5" />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p className="marker text-muted-foreground mb-2 -rotate-2 text-base">
            *{eyebrow.toLowerCase()}*
          </p>
        )}
        <h1 className="display text-foreground text-[2.75rem] break-words sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {description && (
          <p className="marker text-primary mt-3 max-w-2xl -rotate-1 text-base leading-snug sm:text-lg">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard page body: max width, padding, and room above the phone tab bar. */
export function PageBody({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10",
        wide ? "max-w-[1400px]" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
