import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

/** A single number with its label, as a sticker: label in caps, the number in display type. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  active,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "bg-card border-foreground/10 flex flex-col gap-1 rounded-[1.4rem] border-2 p-4 text-left transition-[transform,border-color] duration-200",
        onClick && "hover:border-foreground hover:-translate-y-0.5",
        active && "border-primary bg-primary/10",
        className,
      )}
    >
      <span className="label-caps text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
      <span className="display text-foreground text-4xl tabular-nums">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </Comp>
  );
}
