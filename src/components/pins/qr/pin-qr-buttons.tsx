"use client";

import { Download, Loader2, Printer, QrCode, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/shadcn/ui/button";

import { PinQRDialog, type PinQRTarget } from "./pin-qr-dialog";
import { useDropQRs } from "./use-drop-qrs";

/**
 * ── Row-level QR controls ───────────────────────────────────────────────────
 *
 * Two controls, deliberately different, because they answer two different
 * questions at two different levels of the tree.
 *
 * `PinQRButton` sits on a **location** row and opens the dialog: this code is
 * for *this* pin, and the dialog is where you look at it, copy its link, or put
 * it on paper. One code deserves the full treatment.
 *
 * `PinQRDownloadAllButton` sits on a **group** row and skips the dialog: the
 * group has no single code, so there is nothing to preview, and the only two
 * things anyone wants with twelve codes are a zip and a print sheet. A dialog
 * that renders one of the twelve and calls itself the group's QR page would be
 * actively misleading.
 */

/** Open the full print/preview/copy dialog for one location. */
export function PinQRButton({ target, className }: { target: PinQRTarget; className?: string }) {
  const [open, setOpen] = useState(false);
  const label = `QR code for ${target.title}`;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={label}
        title="QR code — preview, download, print"
      >
        <QrCode />
      </Button>
      <PinQRDialog open={open} onOpenChange={setOpen} target={target} />
    </>
  );
}

/**
 * Download every code in a drop as one zip, from the group row.
 *
 * No dialog, and no spinner-to-preview in between: at this level the useful
 * artefact is the file. Print is one call away on the row's `⋯` menu, which is
 * where anything with a second option belongs — two buttons for two bulk actions
 * would put the destructive-looking Delete next to Print and make the row
 * unreadable.
 */
export function PinQRDownloadAllButton({
  locationGroupId,
  title,
  count,
  className,
}: {
  locationGroupId: string;
  /** Used to name the zip, so it means something in a Downloads folder. */
  title: string;
  /** Live pins in the drop. Always at least 1 — callers hide the button at 0. */
  count: number;
  className?: string;
}) {
  const { downloadAll, isPending } = useDropQRs({ locationGroupId });

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      disabled={isPending}
      onClick={() => void downloadAll()}
      aria-label={`Download all QRs ${count === 1 ? "code" : "codes"} for ${title}`}
      title={`Download all QRs ${count === 1 ? "code" : "codes"} (zip)`}
    >
      {isPending ? <Loader2 className="animate-spin" /> : <Download />}
    </Button>
  );
}

/**
 * The two bulk outcomes for a group row, as plain menu actions.
 *
 * `RowMenu` renders `RowAction` objects rather than arbitrary children, so the
 * hook lives in the row component instead of in a menu-item component. Every
 * caller here is already one component per row — including the hotspot drop
 * lists — so there is never a hook in a loop, which is the only reason this
 * wouldn't be simpler as a component.
 *
 * Download also appears as a visible button on the row. That overlap is
 * deliberate: the zip is what a print-run brand wants every single time, and
 * hunting for it in a menu on every drop is friction worth removing. The menu
 * keeps it because the menu is where you *discover* the print half of the pair.
 */
export function pinQRBulkActions(
  { downloadAll, printAll, isPending }: Pick<ReturnType<typeof useDropQRs>, "downloadAll" | "printAll" | "isPending">,
  count: number,
): { label: string; icon: LucideIcon; disabled: boolean; onSelect: () => void }[] {
  return [
    {
      // No count in the visible label: the row already says how many pins the
      // drop holds, so "all 12" would just repeat it. Screen-reader and tooltip
      // text below keep the number, where it costs nothing.
      label: "Download all QRs",
      icon: Download,
      disabled: isPending,
      onSelect: () => void downloadAll(),
    },
    ...(count > 1
      ? [{ label: "Print all QRs", icon: Printer, disabled: isPending, onSelect: () => void printAll() }]
      : []),
  ];
}