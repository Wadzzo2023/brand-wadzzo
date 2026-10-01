"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "~/components/shadcn/ui/popover";
import type { SelectedCreator } from "~/components/store/creator-selection-store";
import { cn } from "~/lib/utils";
import { Avatar } from "~/ui/person";
import { Skeleton } from "~/ui/skeleton";

/** Searchable brand picker for admin tools (All maps, admin new pin / hotspot). */
export function BrandPicker({
  brands,
  value,
  onChange,
  loading,
  className,
}: {
  brands: SelectedCreator[] | undefined;
  value: SelectedCreator | undefined;
  onChange: (b: SelectedCreator) => void;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (brands ?? []).filter((b) => !s || b.name.toLowerCase().includes(s) || b.id.toLowerCase().includes(s));
  }, [brands, q]);

  if (loading) return <Skeleton className={cn("h-10 rounded-lg", className)} />;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border bg-card/95 px-2.5 text-left text-sm shadow-sm backdrop-blur-sm transition-colors hover:border-line-bright",
            className,
          )}
          aria-label="Choose a brand"
        >
          {value ? <Avatar src={value.profileUrl} name={value.name} className="size-6 text-[10px]" /> : null}
          <span className={cn("min-w-0 flex-1 truncate font-medium", !value && "text-muted-foreground")}>{value?.name ?? "Choose a brand"}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brands"
            className="h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto p-1" role="listbox">
          {list.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No brands match</li>
          ) : (
            list.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={b.id === value?.id}
                  onClick={() => {
                    onChange(b);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <Avatar src={b.profileUrl} name={b.name} className="size-7 text-[11px]" />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {b.id === value?.id && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
