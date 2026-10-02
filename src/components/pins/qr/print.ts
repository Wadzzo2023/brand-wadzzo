/**
 * ── Sticker print sheets ─────────────────────────────────────────────────────
 *
 * Printing goes through a hidden iframe rather than `window.open`, for two
 * reasons a popup window loses on:
 *
 *  - It isn't subject to popup blocking. `window.open` is frequently killed
 *    silently the moment it is called outside a direct click handler — and
 *    generating a sheet is async, so the print click often *is* outside one.
 *  - The sheet can be laid out in the page's own fonts and then printed without
 *    a second round trip through the browser's chrome.
 *
 * Hand-written HTML rather than an SVG with `<text>`: a vector sticker sounds
 * better until you print it and discover the label is set in whatever fallback
 * the printer driver picks, and the brand name comes out in Times. Real text in
 * a document the browser lays out keeps the same font the designer saw.
 */

/** One sticker on the sheet. */
export type SheetCode = {
  /** Data-URL QR. */
  src: string;
  /** The pin's title, or the "Pin 3 of 12" line on a multi-pin drop. */
  caption: string;
  /** Brand name, printed under the caption. */
  brand: string;
  /** Optional brand avatar, printed above the code. */
  brandImageUrl?: string | null;
};

export type SheetOptions = {
  title: string;
  /** Print codes N-up per page rather than one giant grid. */
  columns?: number;
};

/**
 * Sticker geometry, in millimetres, because that is what paper is measured in.
 * A4 printable width is 194mm once the page margins are off; the gap is the
 * cut line between stickers.
 */
const PAGE_MARGIN_MM = 8;
const GAP_MM = 4;
const MAX_STICKER_MM = 90;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One sticker. Inline styles throughout: print CSS has no cascade to inherit. */
function sticker(code: SheetCode): string {
  const avatar = code.brandImageUrl
    ? `<img src="${escapeHtml(code.brandImageUrl)}" alt="" style="width:22px;height:22px;border-radius:9999px;object-fit:cover" />`
    : `<span style="display:inline-block;width:22px;height:22px;border-radius:9999px;background:#e5e5e5" />`;

  return `
    <div class="sticker">
      <div class="brand">${avatar}<span>${escapeHtml(code.brand)}</span></div>
      <img class="code" src="${code.src}" alt="" />
      <div class="caption">${escapeHtml(code.caption)}</div>
      <div class="hint">Scan to collect</div>
    </div>`;
}

/**
 * The full print document. Kept as one string so the caller can write it into
 * the iframe in a single go — no partial layout between `open` and `print`.
 */
export function buildSheetHtml(codes: SheetCode[], options: SheetOptions): string {
  const columns = Math.max(1, Math.min(options.columns ?? 3, codes.length || 1));

  // Each sticker is sized so `columns` of them fit A4's printable width, with
  // the gap subtracted first so the last one doesn't wrap onto its own page.
  // Capped, because a lone sticker at the full 194mm is a poster, and anyone
  // printing one wants something they can cut up and stick on a wall rather
  // than a sheet filled edge to edge.
  const printableMm = 210 - PAGE_MARGIN_MM * 2;
  const stickerMm = Math.min(
    MAX_STICKER_MM,
    (printableMm - (columns - 1) * GAP_MM) / columns,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)} — QR codes</title>
<style>
  @page { size: A4 portrait; margin: ${PAGE_MARGIN_MM}mm; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0a0a0a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .head {
    display: none;
    padding-bottom: 6mm;
    margin-bottom: 6mm;
    border-bottom: 1px solid #e5e5e5;
  }
  .head h1 { margin: 0 0 2px; font-size: 14pt; letter-spacing: -0.01em; }
  .head p { margin: 0; font-size: 9pt; color: #666; }

  .grid {
    display: grid;
    grid-template-columns: repeat(${columns}, ${stickerMm.toFixed(2)}mm);
    gap: ${GAP_MM}mm;
    justify-content: center;
  }

  .sticker {
    width: ${stickerMm.toFixed(2)}mm;
    min-height: ${stickerMm.toFixed(2)}mm;
    padding: ${GAP_MM}mm 3mm 3mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2mm;
    border: 0.3mm solid #d4d4d4;
    border-radius: 3mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 1.5mm;
    font-size: 7pt;
    font-weight: 600;
    color: #525252;
    max-width: 100%;
  }
  .brand span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The code fills the sticker's width. Width is set in mm so it scales with
     the sticker rather than with the browser, which is what keeps the printed
     result identical at every column count. */
  .code {
    display: block;
    width: 100%;
    height: auto;
    image-rendering: pixelated;
  }

  .caption {
    font-size: 7.5pt;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    max-width: 100%;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .hint {
    font-size: 6.5pt;
    color: #8a8a8a;
    letter-spacing: 0.02em;
    margin-top: auto;
  }

  /* On screen the sheet is a preview; the print rules drop the chrome and the
     cut guides, which are only useful before it goes on paper. */
  @media print {
    .head { display: block; }
  }
</style>
</head>
<body>
  <div class="head">
    <h1>${escapeHtml(options.title)}</h1>
    <p>${codes.length} code${codes.length === 1 ? "" : "s"} — print at 100% scale, do not "fit to page".</p>
  </div>
  <div class="grid">${codes.map(sticker).join("")}</div>
</body>
</html>`;
}

/**
 * Print a document into a hidden iframe.
 *
 * Waits for every image to decode before calling `print()`, which is the one
 * step that is easy to skip and produces a blank sheet when you do — the codes
 * are `<img src>` data URLs, and a print fired before they paint renders
 * nothing.
 */
export function printHtml(html: string): boolean {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Print preview");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Clean up once the print dialog is gone. Long enough that a slow dialog
  // doesn't yank the frame mid-print, short enough not to leak one per run.
  const cleanup = () => frame.remove();

  const go = () => {
    win.focus();
    win.print();
    // `afterprint` is unreliable in some browsers, so this is the backstop.
    win.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(cleanup, 60_000);
  };

  const images = Array.from(doc.images);
  const pending = images.filter((img) => !img.complete);
  if (pending.length === 0) {
    // Still one frame for layout to settle — a grid with no images measured
    // yet can print with the codes stacked in a single column.
    requestAnimationFrame(() => requestAnimationFrame(go));
    return true;
  }

  let left = pending.length;
  const settle = () => {
    if (--left > 0) return;
    requestAnimationFrame(() => requestAnimationFrame(go));
  };
  for (const img of pending) {
    img.addEventListener("load", settle, { once: true });
    // A failed image must not hang the sheet waiting for a `load` that is
    // never coming.
    img.addEventListener("error", settle, { once: true });
  }
  return true;
}

/** Save a base64 payload as a file. */
export function downloadBase64(
  base64: string,
  filename: string,
  contentType: string,
): void {
  saveBlob(base64ToBytes(base64), filename, contentType);
}

/** base64 → bytes, the one step between an API response and a file on disk. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Hand a file to the browser.
 *
 * An object URL rather than a `data:` URL: a 100-code zip is a megabyte of
 * base64, and some browsers refuse to navigate a `data:` URL that large, while
 * object URLs have no practical ceiling. Revoked on the next tick, once the
 * download has been handed off.
 */
export function saveBlob(bytes: Uint8Array, filename: string, contentType: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Turn a title into something safe to put in a filename. */
export function slugify(value: string, max = 40): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, max) || "wadzzo";
}

/**
 * One QR code's filename, shared by the single download and the zip so a brand
 * who downloads one pin and a brand who downloads the drop end up with matching
 * names. Zero-padded so files sort in pin order inside the archive.
 *
 * Single-pin drops have no meaningful pin number, so they fall back to the tail
 * of the location id — unique, if not readable.
 */
export function qrFilename(
  drop: { title: string },
  item: { locationId: string; pinNumber: number | null },
  extension = "svg",
): string {
  const slug = slugify(drop.title, 32);
  const tail = item.locationId.slice(-6);
  const pin = item.pinNumber == null ? "" : `-pin-${String(item.pinNumber).padStart(2, "0")}`;
  return `wadzzo-qr-${slug}${pin}-${tail}.${extension}`;
}