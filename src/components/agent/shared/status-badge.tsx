"use client";

import { cn } from "~/lib/utils";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-success/15 text-success border-success/25" },
    expired: { label: "Expired", cls: "bg-muted text-muted-foreground border-border" },
    fully_claimed: { label: "Fully Claimed", cls: "bg-warning/15 text-warning border-warning/25" },
    collection_disabled: { label: "Collection Off", cls: "bg-destructive/15 text-destructive border-destructive/25" },
};

interface StatusBadgeProps {
    status: string;
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const { label, cls } = STATUS_MAP[status] ?? {
        label: status,
        cls: "bg-muted text-muted-foreground border-border",
    };
    return (
        <span className={cn(
            "inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0",
            cls, className
        )}>
            {label}
        </span>
    );
}