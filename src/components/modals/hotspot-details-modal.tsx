import React, { useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "~/components/shadcn/ui/dialog";
import { api } from "~/utils/api";

type Props = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    hotspotId: string | null;
};

const HotspotDetailModal: React.FC<Props> = ({ isOpen, setIsOpen, hotspotId }) => {
    const hotspotQuery = api.maps.pin.getHotspot.useQuery(
        { hotspotId: hotspotId ?? "" },
        { enabled: !!hotspotId && isOpen },
    );
    console.log("Hotspot query:", hotspotId);
    const pauseSchedule = api.maps.pin.pauseHotspotSchedule.useMutation();
    const resumeSchedule = api.maps.pin.resumeHotspotSchedule.useMutation();
    const deleteCascade = api.maps.pin.deleteHotspotCascade.useMutation();

    const h = hotspotQuery.data;

    useEffect(() => {
        if (!isOpen) hotspotQuery.remove();
    }, [isOpen, hotspotQuery]);

    const handlePause = () => {
        if (!hotspotId) return;
        pauseSchedule.mutate({ hotspotId });
    };
    const handleResume = () => {
        if (!hotspotId) return;
        resumeSchedule.mutate({ hotspotId });
    };
    const handleDelete = () => {
        if (!hotspotId) return;
        if (window.confirm("This will hide the hotspot and all of its location groups. Continue?")) {
            deleteCascade.mutate({ hotspotId });
            setIsOpen(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-card border border-border shadow-xl rounded-xl">

                <div className="px-6 pt-5 pb-6">
                    <DialogHeader>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <DialogTitle className="text-card-foreground text-base font-semibold tracking-tight">
                                    {h?.title || "Hotspot"}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground text-[0.7rem] uppercase tracking-widest mt-0.5">
                                    {h ? "Schedule details" : null}
                                </DialogDescription>
                            </div>

                            {h && (
                                <span
                                    className={[
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.65rem] font-medium uppercase tracking-widest border shrink-0",
                                        h.isActive
                                            ? "bg-primary/10 text-primary border-primary/25"
                                            : "bg-muted text-muted-foreground border-border",
                                    ].join(" ")}
                                >
                                    <span
                                        className={[
                                            "w-1.5 h-1.5 rounded-full",
                                            h.isActive ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]" : "bg-muted-foreground",
                                        ].join(" ")}
                                    />
                                    {h.isActive ? "Active" : "Stopped"}
                                </span>
                            )}
                        </div>
                    </DialogHeader>

                    {hotspotQuery.isLoading && (
                        <div className="flex items-center gap-2 mt-6 text-muted-foreground text-xs tracking-wide">
                            <svg
                                className="animate-spin w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Loading…
                        </div>
                    )}

                    {h && (
                        <>
                            {/* Data grid */}
                            <div className="mt-5 rounded-lg overflow-hidden border border-border divide-y divide-border">
                                {/* Row 1: two cols */}
                                <div className="grid grid-cols-2 divide-x divide-border">
                                    <DataCell label="Start" value={h.hotspotStartDate.toLocaleString()} />
                                    <DataCell label="End" value={h.hotspotEndDate.toLocaleString()} />
                                </div>
                                {/* Row 2: two cols */}
                                <div className="grid grid-cols-2 divide-x divide-border">
                                    <DataCell label="Drop every" value={`${h.dropEveryDays} days`} />
                                    <DataCell label="Pin duration" value={`${h.pinDurationDays} days`} />
                                </div>
                                {/* Row 3: full width */}
                                <DataCell label="Next run" value={h.qstash?.nextScheduleTime ? new Date(h.qstash.nextScheduleTime).toLocaleString() : "—"} />
                                {/* Row 4: full width */}
                                <DataCell
                                    label="Scheduled"
                                    value={h.qstashScheduleId ? "Yes" : "No"}
                                    valueClassName={h.qstashScheduleId ? "text-primary" : "text-muted-foreground"}
                                />
                            </div>

                            <DialogFooter className="mt-5 flex gap-2">
                                {/* <button
                                    onClick={handlePause}
                                    disabled={pauseSchedule.isLoading || !h.isActive}
                                    className={[
                                        "flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors duration-150",
                                        h.isActive
                                            ? "bg-secondary/60 hover:bg-secondary text-secondary-foreground border-border cursor-pointer"
                                            : "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50",
                                    ].join(" ")}
                                >
                                    {pauseSchedule.isLoading ? "Pausing…" : h.isActive ? "Pause schedule" : "Paused"}
                                </button>
                                <button
                                    onClick={handleResume}
                                    disabled={resumeSchedule.isLoading || h.isActive}
                                    className={[
                                        "flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors duration-150",
                                        !h.isActive
                                            ? "bg-secondary/60 hover:bg-secondary text-secondary-foreground border-border cursor-pointer"
                                            : "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50",
                                    ].join(" ")}
                                >
                                    {resumeSchedule.isLoading ? "Resuming…" : !h.isActive ? "Resume schedule" : "Resumed"}
                                </button> */}

                                <button
                                    onClick={handleDelete}
                                    disabled={deleteCascade.isLoading}
                                    className="flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors duration-150 bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deleteCascade.isLoading ? "Deleting…" : "Delete hotspot"}
                                </button>
                            </DialogFooter>
                        </>
                    )}
                </div>

                <DialogClose className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors" />
            </DialogContent>
        </Dialog>
    );
};

// Small helper so the grid cells stay DRY
const DataCell: React.FC<{
    label: string;
    value: string;
    valueClassName?: string;
}> = ({ label, value, valueClassName }) => (
    <div className="px-4 py-3 bg-card">
        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-widest mb-0.5">
            {label}
        </p>
        <p className={`text-sm tabular-nums text-card-foreground ${valueClassName ?? ""}`}>
            {value}
        </p>
    </div>
);

export default HotspotDetailModal;