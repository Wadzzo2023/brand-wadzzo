"use client";

import { keepPreviousData } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  QrCode,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "~/components/shadcn/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/shadcn/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/shadcn/ui/select";
import { Skeleton } from "~/components/shadcn/ui/skeleton";
import { api } from "~/utils/api";

import { buildSheetHtml, downloadBase64, printHtml, qrFilename } from "./print";
import { useDropQRs } from "./use-drop-qrs";

/**
 * ── Pin QR ─────────────────────────────────────────────────────────────────
 *
 * The printed half of a drop. A creator opens a pin on the map and gets a code a
 * fan can scan with the camera already in their pocket — no app install, no
 * account, no location permission — which is the only collection path that works
 * in a basement, on a market stall with no signal, or for someone who has never
 * heard of Wadzzo before today.
 *
 * One pin, one code. It encodes `web.wadzzo.com/scan?pin=<locationId>`, and the
 * consumer side already claims from exactly that (`pins.collectByQr`), so nothing
 * here has to be kept in step with it beyond the payload itself.
 *
 * Deliberately not a settings panel. The code is a function of the pin, not a
 * choice a creator makes, so the only knobs are the two things a print run
 * genuinely needs — file type and paper layout — and they reset on close. The
 * sticker on the wall is the artefact; this dialog is a printing desk, not a
 * page to linger on.
 */

/** What a caller has to hand us to print one pin's code. */
export type PinQRTarget = {
  /** The `Location` id. This is what goes inside the code. */
  locationId: string;
  /** The `LocationGroup` id, for the "every code in this drop" sheet. */
  locationGroupId: string;
  /** Shown in the dialog heading and printed under the code. */
  title: string;
  /**
   * Printed above the code. Optional because list rows know the drop's title but
   * not always its brand — `generatePinQR` returns the real one, so this only
   * matters for the few frames before that lands.
   */
  brandName?: string;
  /** Printed beside `brandName` when the brand has an avatar. */
  brandImageUrl?: string | null;
  /**
   * Live pins in the drop, if the caller already knows it. Only used to decide
   * whether the "all codes" section is worth showing before the first query
   * lands; the server is the authority and this can be null.
   */
  pinCount?: number | null;
};

type Format = "svg" | "png";

/**
 * Deliberately thin. Everything with state on it lives in `Panel`, which Radix
 * only mounts while the dialog is open — so closing it discards the panel and
 * the next pin starts on a clean slate, without an effect resetting state after
 * the fact and re-rendering on the way out.
 */
export function PinQRDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PinQRTarget | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && target && <Panel target={target} />}
    </Dialog>
  );
}

function Panel({ target }: { target: PinQRTarget }) {
  const [format, setFormat] = useState<Format>("svg");
  const [copied, setCopied] = useState(false);

  const single = api.maps.pin.generatePinQR.useQuery(
    { locationId: target.locationId, format },
    {
      // Switching format shouldn't blank the code — the previous one stays up
      // until the next renders, which is a fraction of a second either way.
      placeholderData: keepPreviousData,
    },
  );

  const { downloadAll, printAll, isPending: bulkPending } = useDropQRs({
    locationGroupId: target.locationGroupId,
    format,
  });

  // base64 in, data URL out — the same bytes the download writes to disk.
  const previewSrc = useMemo(() => {
    if (!single.data) return null;
    return `data:${single.data.contentType};base64,${single.data.base64}`;
  }, [single.data]);

  const download = useCallback(() => {
    if (!single.data) return;
    downloadBase64(
      single.data.base64,
      qrFilename(single.data, single.data, single.data.extension),
      single.data.contentType,
    );
    toast.success(`Downloaded ${single.data.extension.toUpperCase()}`);
  }, [single.data]);

  const copyUrl = useCallback(async () => {
    if (!single.data) return;
    try {
      await navigator.clipboard.writeText(single.data.scanUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't reach the clipboard");
    }
  }, [single.data]);

  const printThis = useCallback(() => {
    if (!single.data || !previewSrc) return;
    printHtml(
      buildSheetHtml(
        [
          {
            src: previewSrc,
            caption: single.data.pinNumber
              ? `${single.data.title} · Pin ${single.data.pinNumber} of ${single.data.pinCount}`
              : single.data.title,
            brand: single.data.brandName,
            brandImageUrl: single.data.brandImageUrl,
          },
        ],
        { title: single.data.title, columns: 1 },
      ),
    );
  }, [previewSrc, single.data]);

  // Whichever is further along: the caller's snapshot if it has one, otherwise
  // the server's answer to the single query.
  const pinCount = single.data?.pinCount ?? target.pinCount ?? 0;

  return (
    <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="gap-1 px-5 pt-5 pb-0">
        <DialogTitle className="font-hud flex items-center gap-2">
          <QrCode className="size-4 text-primary" />
          Print QR code
        </DialogTitle>
        <DialogDescription className="text-xs">
          Fans scan this with their phone camera and collect the drop. No app, no account, no
          location permission.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        {/* ── The code ──────────────────────────────────────────────────── */}
        <div className="flex justify-center rounded-xl border bg-muted/30 p-5">
          {single.isError ? (
            <div className="flex size-[184px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center">
              <QrCode className="size-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{single.error.message}</p>
            </div>
          ) : !previewSrc ? (
            <Skeleton className="size-[184px] rounded-lg" />
          ) : (
            // A white plate, because the code is black-on-white and this dialog
            // is not. Without it the quiet zone picks up the card colour and
            // some scanners refuse the outermost modules.
            <div className="rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={`QR code that opens ${target.title}`}
                width={184}
                height={184}
                className="size-[184px]"
              />
            </div>
          )}
        </div>

        {single.data?.isMultiPin && single.data.pinNumber && (
          <p className="mt-2.5 text-center text-xs tabular-nums text-muted-foreground">
            Pin {single.data.pinNumber} of {single.data.pinCount} in this drop
          </p>
        )}

        {/* Above the preview rather than below it: printing a run is the
            expensive mistake here, so the state that would waste one should be
            read before the code, not after. */}
        {single.data?.collectableReason && (
          <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <span>
              {single.data.collectableReason} You can still print now — the code starts working the
              moment the drop goes live.
            </span>
          </p>
        )}

        {/* ── The link ────────────────────────────────────────────────────
            Shown as well as printable, because some of these end up pasted into
            a listing or a DM rather than stuck on a wall. */}
        {single.data && (
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
          >
            <ScanLine className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
              {single.data.scanUrl}
            </span>
            {copied ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : (
              <Copy className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="sr-only">Copy link</span>
          </button>
        )}

        {/* ── This code ────────────────────────────────────────────────── */}
        <div className="mt-4 space-y-2">
          <label htmlFor="pin-qr-format" className="label-caps block">
            File type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
              <SelectTrigger id="pin-qr-format" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="svg">SVG — any size</SelectItem>
                <SelectItem value="png">PNG — 512px</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!single.data} onClick={download}>
              <Download />
              Download
            </Button>
          </div>
          <Button className="w-full" disabled={!previewSrc} onClick={printThis}>
            <Printer />
            Print this code
          </Button>
        </div>

        {/* ── The whole drop ───────────────────────────────────────────────
            Only once there is genuinely more than one code. On a single-pin drop
            these would be two more buttons producing the one sticker already on
            screen. Two actions, side by side, because both are one click from
            here and the difference (a zip vs. a sheet) is not obvious from an
            icon alone. */}
        {pinCount > 1 && (
          <div className="mt-5 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              All {pinCount} pins in this drop — {format === "svg" ? "vector" : "raster"} codes,{" "}
              three to a printed page.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={bulkPending} onClick={() => void downloadAll()}>
                {bulkPending ? <Loader2 className="animate-spin" /> : <Download />}
                All as zip
              </Button>
              <Button variant="outline" disabled={bulkPending} onClick={() => void printAll()}>
                {bulkPending ? <Loader2 className="animate-spin" /> : <Printer />}
                Print sheet
              </Button>
            </div>
          </div>
        )}

        {single.data && (
          <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" asChild>
            <a href={single.data.scanUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open it in a browser — check the link before you print 500
            </a>
          </Button>
        )}
      </div>
    </DialogContent>
  );
}