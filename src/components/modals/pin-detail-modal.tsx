"use client";

import { format, formatDistanceToNow } from "date-fns";
import { BarChart3, CalendarDays, Copy, CopyPlus, ExternalLink, Link2, Loader2, type MapPin, Navigation, Pencil, Scissors, Trash2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/shadcn/ui/dialog";
import { Switch } from "~/components/shadcn/ui/switch";
import { cn } from "~/lib/utils";
import { useMapInteractionStore } from "~/store/map-stores";
import { ConfirmDialog } from "~/ui/confirm-dialog";
import { Avatar } from "~/ui/person";
import { StatusPill } from "~/ui/status-pill";
import { api } from "~/utils/api";

const TYPE_LABEL: Record<string, string> = { OTHER: "General", LANDMARK: "Landmark", EVENT: "Event", BOUNTY: "Bounty", EXPERIENCE: "Experience", LAUNCH: "Launch" };

/**
 * A pin on the map, opened from its marker, as a profile-style card: the
 * pin's cover on top, the brand's avatar over it, then title and brand,
 * the numbers, details and actions. Same card on the brand's Map and on
 * Admin › All maps.
 */
export default function PinDetailPanel() {
  const { selectedPinForDetail: pin, closePinDetailModal: close, isPinCut, isPinCopied, setPinCopied, setPinCut, setManual, setDuplicate, setPrevData, openPinDetailModal } =
    useMapInteractionStore();
  const router = useRouter();
  const admin = (usePathname() ?? "").startsWith("/admin");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());

  const utils = api.useUtils();
  const refreshPins = () => {
    void utils.maps.pin.getMyPins.invalidate();
    void utils.maps.pin.getCreatorPins.invalidate();
  };

  const duplicate = api.maps.pin.getPinM.useMutation({
    onSuccess: (data) => {
      setPrevData(data);
      close();
      setManual(true);
      setDuplicate(true);
      router.push("/pins/new?duplicate=1"); // the new-pin page pre-fills from prevData
    },
    onError: (e) => toast.error(e.message),
  });
  const autoCollect = api.maps.pin.toggleAutoCollect.useMutation({
    onSuccess: (_d, vars) => {
      if (pin) openPinDetailModal({ ...pin, autoCollect: vars.isAutoCollect });
      refreshPins();
      toast.success(vars.isAutoCollect ? "Auto-collect on — fans collect it by walking in range" : "Auto-collect off — fans tap to collect");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.maps.pin.deletePin.useMutation({
    onSuccess: () => {
      toast.success("Pin deleted");
      setConfirmDelete(false);
      refreshPins();
      close();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!pin) return null;
  const g = pin.locationGroup;
  const open = !isPinCopied && !isPinCut;

  const start = g ? new Date(g.startDate).getTime() : 0;
  const end = g ? new Date(g.endDate).getTime() : 0;
  const status =
    g?.approved === null
      ? { label: "In review", tone: "warning" as const }
      : g?.approved === false
        ? { label: "Rejected", tone: "danger" as const }
        : start > now
          ? { label: "Scheduled", tone: "info" as const }
          : end < now
            ? { label: "Ended", tone: "neutral" as const }
            : { label: "Live", tone: "success" as const };
  const left = g && g.limit > 0 ? g.remaining : null;
  const coords = `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}`;
  const reportHref = `${admin ? "/admin/reports" : "/reports"}/${pin.id}`;

  const copyForPaste = () => {
    void navigator.clipboard.writeText(pin.id);
    setPinCopied(true, pin);
    toast.success("Copied — click the map where the copy should go");
  };
  const cutForMove = () => {
    setPinCut(true, pin);
    toast.success("Click the map where the pin should move");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent
          className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/40 [&>button:last-child]:p-1 [&>button:last-child]:text-white [&>button:last-child]:opacity-100"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Cover: the pin's image (else the brand's cover), its state on top. */}
            <div className="relative h-52 bg-gradient-to-br from-primary/40 via-primary/15 to-muted">
              {(g?.image ?? g?.creator.coverUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g?.image ?? g?.creator.coverUrl ?? ""} alt="" className="size-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" aria-hidden />
              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                <StatusPill tone={status.tone} className="bg-card/95 backdrop-blur">
                  {status.label}
                </StatusPill>
                {pin.autoCollect && (
                  <StatusPill tone="primary" icon={Zap} className="bg-card/95 backdrop-blur">
                    Auto-collect
                  </StatusPill>
                )}
                {pin.hidden && (
                  <StatusPill tone="danger" className="bg-card/95 backdrop-blur">
                    Hidden
                  </StatusPill>
                )}
              </div>
            </div>

            {/* Identity: brand avatar over the cover, then the pin's title and its brand. */}
            <div className="px-5">
              <div className="-mt-10 flex items-end justify-between gap-3">
                <Avatar src={g?.creator.profileUrl} name={g?.creator.name ?? g?.title ?? "Brand"} className="relative size-20 border-4 border-background text-2xl shadow-md" />
                <StatusPill tone="neutral" className="mb-1">
                  {TYPE_LABEL[g?.type ?? "OTHER"] ?? g?.type}
                </StatusPill>
              </div>
              <DialogTitle className="mt-3 font-hud text-xl leading-tight font-bold">{g?.title ?? "Pin"}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {g?.creator.name ? (
                  <>
                    by{" "}
                    {admin ? (
                      <Link href={`/admin/creators/${g.creatorId}`} onClick={close} className="font-medium text-foreground hover:underline">
                        {g.creator.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{g.creator.name}</span>
                    )}
                  </>
                ) : (
                  "Your pin"
                )}
                {g && ` · created ${formatDistanceToNow(new Date(g.createdAt), { addSuffix: true })}`}
              </p>
            </div>

            <div className="space-y-5 p-5 pt-4">
              {/* Numbers first: that's what people open a pin for. */}
              <dl className="grid grid-cols-3 gap-2">
                <Stat label="Collected" value={pin._count.consumers.toLocaleString()} />
                <Stat label="Left" value={left === null ? "∞" : left.toLocaleString()} hint={g && g.limit > 0 ? `of ${g.limit.toLocaleString()}` : "no limit"} />
                <Stat label={start > now ? "Starts in" : end < now ? "Ended" : "Ends in"} value={g ? formatDistanceToNow(start > now ? start : end) : "—"} />
              </dl>

              <DialogDescription asChild>
                <div className="space-y-3 text-sm">
                  {g?.description && <p className="whitespace-pre-line text-foreground">{g.description}</p>}
                  <Row icon={CalendarDays}>{g ? `${format(start, "MMM d, yyyy · p")} → ${format(end, "MMM d, yyyy · p")}` : "—"}</Row>
                  <Row icon={Navigation}>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(coords).then(() => toast.success("Coordinates copied"))}
                      className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
                    >
                      {coords} <Copy className="size-3" />
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Directions <ExternalLink className="size-3" />
                    </a>
                  </Row>
                  {g?.link && (
                    <Row icon={Link2}>
                      <a href={g.link} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                        {g.link}
                      </a>
                    </Row>
                  )}
                </div>
              </DialogDescription>

              {/* How fans collect it — the one setting worth flipping from here. */}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3.5">
                <Zap className={cn("mt-0.5 size-4 shrink-0", pin.autoCollect ? "text-primary" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Auto-collect</span>
                  <span className="block text-xs text-muted-foreground">
                    {pin.autoCollect ? "Fans collect it just by walking into range." : "Fans tap to collect when they're in range."}
                  </span>
                </span>
                {autoCollect.isPending ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Switch checked={pin.autoCollect} onCheckedChange={(on) => autoCollect.mutate({ id: pin.id, isAutoCollect: on })} aria-label="Auto-collect" />
                )}
              </label>
            </div>
          </div>

          {/* Actions, all on view: quick tools on top, the two main ones below. */}
          <div className="space-y-2.5 border-t bg-card px-5 py-3.5">
            <div className="grid grid-cols-4 gap-2">
              <ToolButton icon={CopyPlus} label="Duplicate" hint="New pin from this one" busy={duplicate.isPending} onClick={() => duplicate.mutate(pin.id)} />
              <ToolButton icon={Copy} label="Copy" hint="Paste it somewhere else" onClick={copyForPaste} />
              <ToolButton icon={Scissors} label="Move" hint="Click a new spot" onClick={cutForMove} />
              <ToolButton icon={Trash2} label="Delete" hint="Take it off the map" destructive disabled={pin.hidden} onClick={() => setConfirmDelete(true)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link href={reportHref} onClick={close}>
                  {pin._count.consumers > 0 ? <Users /> : <BarChart3 />} Collectors
                </Link>
              </Button>
              <Button className="flex-1" asChild>
                <Link href={`/pins/${pin.id}/edit`} onClick={close}>
                  <Pencil /> Edit pin
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !remove.isPending && setConfirmDelete(o)}
        title={`Delete “${g?.title ?? "this pin"}”?`}
        description="It comes off the map for fans. Collections already made stay in their history."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ id: pin.id })}
      />
    </>
  );
}

function ToolButton({
  icon: Icon,
  label,
  hint,
  onClick,
  busy,
  disabled,
  destructive,
}: {
  icon: typeof MapPin;
  label: string;
  hint: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabled) || Boolean(busy)}
      title={hint}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        destructive ? "text-destructive hover:border-destructive/40 hover:bg-destructive/10" : "hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <dt className="label-caps">{label}</dt>
      <dd className="mt-0.5 truncate font-hud text-lg font-bold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Row({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-muted-foreground">
      <Icon className="size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}
