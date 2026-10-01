"use client";

import type { SuccessResponse } from "~/types/agent/types";

// ─── SuccessBlock ─────────────────────────────────────────────────────────────

export function SuccessBlock({ data }: { data: SuccessResponse }) {
    return (
        <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl bg-success/10 border border-success/25">
            <span className="text-2xl shrink-0">🎉</span>
            <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-success text-sm font-bold leading-snug">
                    {data.message}
                </p>
                {data.count > 0 && (
                    <p className="text-success/70 text-xs">
                        {data.count} pin{data.count !== 1 ? "s" : ""} saved
                    </p>
                )}
            </div>
        </div>
    );
}