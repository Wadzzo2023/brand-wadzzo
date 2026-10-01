"use client";

import { ShieldAlert } from "lucide-react";
import { cn } from "~/lib/utils";
import { Skeleton } from "~/ui/skeleton";

interface LoadingProps {
  className?: string;
  text?: string;
}

export default function Loading({ className, text }: LoadingProps) {
  if (text?.toLowerCase() === "empty") {
    return (
      <div className={cn("flex min-h-[40vh] w-full flex-col items-center justify-center py-12", className)}>
        <ShieldAlert className="size-12 text-muted-foreground/60" />
        <p className="mt-3 text-sm text-muted-foreground">Nothing found</p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 py-12", className)} role="status" aria-label={text ?? "Loading"}>
      <div className="flex items-center gap-2">
        <Skeleton className="size-3 rounded-full" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="size-3 rounded-full" />
      </div>
      <Skeleton className="h-4 w-32 rounded-md" />
      {text && <p className="font-hud text-xs font-medium uppercase tracking-wider text-muted-foreground">{text}</p>}
    </div>
  );
}
