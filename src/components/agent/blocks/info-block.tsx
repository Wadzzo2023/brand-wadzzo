"use client";

// ~/components/agent/blocks/InfoBlock.tsx

import { PinListBlock } from "~/components/agent/blocks/pin-list-block";
import { AnalyticsBlock } from "~/components/agent/analytics/analytics-block";
import { ReportBlock } from "~/components/agent/blocks/report-block";
import { CollectorReportBlock } from "~/components/agent/analytics/collector-report-block";
import type {
    PinListResponse,
    HotspotListResponse,
    AnalyticsResponse,
    ReportResponse,
    CollectorReportResponse,
    AgentResponse,
} from "~/lib/agent/types";
import type { PinEditFields, HotspotScope, LocationEditFields } from "~/components/agent/pins/pin-edit-form";
import type { HotspotEditFields } from "~/components/agent/hotspot/hotspot-edit-form";

// ─── Props ────────────────────────────────────────────────────────────────────

interface InfoBlockProps {
    data: AgentResponse;
    onEdit?: (ids: string[], fields: PinEditFields, scope?: HotspotScope, locationEdits?: Record<string, LocationEditFields>) => void;
    onDelete?: (ids: string[]) => void;
    onEditHotspot?: (hotspotId: string, fields: HotspotEditFields) => void;
    onDeleteHotspot?: (hotspotId: string) => void;
    onPauseHotspot?: (hotspotId: string) => void;
    onResumeHotspot?: (hotspotId: string) => void;
    onLoadMore?: (nextOffset: number) => void;
    isLoadingMore?: boolean;
}

// ─── InfoBlock ────────────────────────────────────────────────────────────────

export function InfoBlock({
    data,
    onEdit,
    onDelete,
    onEditHotspot,
    onDeleteHotspot,
    onPauseHotspot,
    onResumeHotspot,
    onLoadMore,
    isLoadingMore,
}: InfoBlockProps) {

    switch (data.type) {

        case "pin_list":
            return (
                <PinListBlock
                    data={(data).data}

                    onEdit={onEdit}
                    onDelete={onDelete}
                    onEditHotspot={onEditHotspot}
                    onDeleteHotspot={onDeleteHotspot}
                    onPauseHotspot={onPauseHotspot}
                    onResumeHotspot={onResumeHotspot}
                    onLoadMore={onLoadMore}
                    isLoadingMore={isLoadingMore}
                />
            );

        case "hotspot_list":
            return (
                <PinListBlock
                    data={{ standalone: [], hotspots: (data).data.hotspots, pagination: (data).data.pagination }}

                    onEdit={onEdit}
                    onDelete={onDelete}
                    onEditHotspot={onEditHotspot}
                    onDeleteHotspot={onDeleteHotspot}
                    onPauseHotspot={onPauseHotspot}
                    onResumeHotspot={onResumeHotspot}
                    onLoadMore={onLoadMore}
                    isLoadingMore={isLoadingMore}
                />
            );

        case "report":
            return (
                <ReportBlock
                    data={(data).data}
                    onLoadMore={onLoadMore}
                    isLoadingMore={isLoadingMore}
                />
            );

        case "collector_report":
            return (
                <CollectorReportBlock
                    data={(data).data}
                    onLoadMore={onLoadMore}
                    isLoadingMore={isLoadingMore}
                />
            );

        case "analytics":
            return (
                <AnalyticsBlock
                    data={(data).data}
                />
            );

        default:
            return null;
    }
}