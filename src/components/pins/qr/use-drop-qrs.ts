"use client";

import { useCallback } from "react";
import toast from "react-hot-toast";

import { api } from "~/utils/api";

import {
  base64ToBytes,
  buildSheetHtml,
  printHtml,
  qrFilename,
  saveBlob,
  slugify,
  type SheetCode,
} from "./print";
import { buildZip } from "./zip";

type DropCode = {
  base64: string;
  contentType: string;
  locationId: string;
  pinNumber: number | null;
  pinCount: number | null;
};

type Drop = {
  title: string;
  brandName: string;
  brandImageUrl: string | null;
  truncated: boolean;
  items: DropCode[];
};

/**
 * Bulk actions for one drop: everything as a zip, or everything as a print sheet.
 *
 * Shared by the group row and the dialog so "print all 12" can't mean two
 * slightly different things in two places. Both paths render the whole drop in
 * one request rather than looping per pin — a 40-pin drop is one round trip
 * instead of forty, and one spinner instead of forty.
 */
export function useDropQRs({ locationGroupId, format = "svg" }: { locationGroupId: string; format?: "svg" | "png" }) {
  const bulk = api.maps.pin.generateDropQRs.useMutation({
    onError: (e) => toast.error(e.message),
  });

  /**
   * One zip, one file. Not N sequential downloads: browsers gate that behind a
   * permission prompt, Safari drops it, and the brand ends up with 40 loose
   * files and nothing to hand a print shop.
   */
  const downloadAll = useCallback(async () => {
    const drop: Drop = await bulk.mutateAsync({ locationGroupId, format });
    const extension = format === "png" ? "png" : "svg";

    const zip = buildZip(
      drop.items.map((item) => ({
        name: qrFilename(drop, item, extension),
        data: base64ToBytes(item.base64),
      })),
    );

    saveBlob(zip, `${slugify(drop.title, 40)}-qr-codes.zip`, "application/zip");
    toast.success(`${drop.items.length} QR codes downloaded`);
    if (drop.truncated) toast("That drop has more than 100 pins — the rest weren't included", { icon: "⚠️" });
  }, [bulk, locationGroupId, format]);

  /** The print sheet: one page, N stickers, cut lines included. */
  const printAll = useCallback(async () => {
    const drop: Drop = await bulk.mutateAsync({ locationGroupId, format });

    const codes: SheetCode[] = drop.items.map((item) => ({
      src: `data:${item.contentType};base64,${item.base64}`,
      caption:
        item.pinNumber != null ? `${drop.title} · Pin ${item.pinNumber} of ${item.pinCount}` : drop.title,
      brand: drop.brandName,
      brandImageUrl: drop.brandImageUrl,
    }));

    printHtml(buildSheetHtml(codes, { title: drop.title, columns: 3 }));
    if (drop.truncated) toast("Only the first 100 pins fit on one sheet", { icon: "⚠️" });
  }, [bulk, locationGroupId, format]);

  return { downloadAll, printAll, isPending: bulk.isPending };
}