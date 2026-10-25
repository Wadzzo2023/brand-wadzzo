"use client";

import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Input } from "~/components/shadcn/ui/input";
import { cn } from "~/lib/utils";

/** The row above a list: search on the left, filters and actions after it. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {children}
    </div>
  );
}

/** Search box with a clear button. `onSearch` fires after typing pauses. */
export function SearchInput({
  value,
  onSearch,
  placeholder = "Search",
  delay = 300,
  className,
}: {
  value?: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => {
    const t = setTimeout(() => onSearch(text.trim()), delay);
    return () => clearTimeout(t);
  }, [text, delay, onSearch]);

  return (
    <div className={cn("relative min-w-0 flex-1 sm:w-72 sm:flex-none", className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        strokeWidth={2.6}
      />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setText("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-9 pl-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText("")}
          aria-label="Clear search"
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** One-of filter as pills (All · Pending · Approved…), with optional counts. */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: LucideIcon; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "font-hud focus-visible:outline-primary inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-base tracking-wide uppercase transition-colors focus-visible:outline-2",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-foreground/12 text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            {o.icon && <o.icon className="size-3.5" />}
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  on ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {o.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
