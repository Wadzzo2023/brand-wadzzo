import QRCode from "qrcode";

import { WADZZO_AR_URL } from "./embed";

/**
 * ── QR generation ────────────────────────────────────────────────────────────
 *
 * One QR encodes one thing: the URL that opens the consumer app's scanner on a
 * specific pin — `https://web.wadzzo.com/scan?pin=<locationId>`. That is the
 * whole contract, and it is the same origin the map embed already points fans
 * at (`WADZZO_AR_URL` in `~/lib/embed`), so a sticker and an embed on the same
 * drop land a visitor in the same place.
 *
 * On the reading side, wadzzoAR's `/scan` takes `pin` straight off the query
 * and claims it — no camera needed on that path at all, because the phone's own
 * camera app did the scanning. `pinIdFromScan` in `src/lib/ar/useQrScanner.ts`
 * accepts the id from the URL query or as a bare cuid-like token, so the same
 * code also works against the in-app scanner.
 *
 * Static by design — the pin id *is* the credential, so anyone who photographs
 * the sticker can claim from anywhere. That is inherent to "print it and let
 * people scan it", and `pins.collectByQr` documents the same trade-off
 * server-side. A drop that needs to resist that wants a per-scan token, which is
 * a different endpoint and a different payload — not a change here.
 */

export type QRCodeOptions = {
  /** Pixel size of the square. Ignored for SVG, which is resolution-independent. */
  size?: number;
  /** Quiet zone in modules. 4 is the spec minimum; less risks scanner failures. */
  margin?: number;
  /**
   * Reed-Solomon redundancy. `M` (~15%) is the right default for a screen or a
   * sticker that will not get scuffed — enough to survive a logo dropped in the
   * centre or a thumb across a corner, which is most real-world damage.
   */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  color?: { dark: string; light: string };
};

/** The deep link a printed code encodes. */
export function buildPinScanUrl(locationId: string): string {
  return `${WADZZO_AR_URL}/scan?pin=${encodeURIComponent(locationId)}`;
}

const DEFAULTS = {
  size: 512,
  margin: 4,
  errorCorrectionLevel: "M" as const,
  // Near-black on white: the highest-contrast pair available, which is what
  // gives a scanner the widest error-correction headroom at small print sizes.
  color: { dark: "#000000", light: "#FFFFFF" },
} satisfies Required<QRCodeOptions>;

/**
 * SVG markup for one pin's code. Vector, so it scales to any print size.
 *
 * `size` becomes the SVG's `width`/`height` rather than being dropped. That
 * costs nothing here — the path data is resolution-independent either way — and
 * it means the file has intrinsic dimensions, which is what stops a print shop's
 * RIP or Figma from opening it at some arbitrary default and guessing wrong.
 * Browsers ignore both attributes in favour of the viewBox when it's styled.
 */
export async function generatePinQRSVG(
  locationId: string,
  options: QRCodeOptions = {},
): Promise<string> {
  const opts = { ...DEFAULTS, ...options };
  return QRCode.toString(buildPinScanUrl(locationId), { ...opts, type: "svg" });
}

/** PNG bytes for one pin's code — for download and for embedding elsewhere. */
export async function generatePinQRBuffer(
  locationId: string,
  options: QRCodeOptions = {},
): Promise<Buffer> {
  return QRCode.toBuffer(buildPinScanUrl(locationId), { ...DEFAULTS, ...options, type: "png" });
}

/** `data:` URL, for an `<img src>` where a blob round-trip isn't worth it. */
export async function generatePinQRDataUrl(
  locationId: string,
  options: QRCodeOptions = {},
): Promise<string> {
  return QRCode.toDataURL(buildPinScanUrl(locationId), { ...DEFAULTS, ...options });
}

/** Rendered bytes plus the metadata a download needs to become a real file. */
export async function renderPinQR(
  locationId: string,
  format: "png" | "svg",
  options: QRCodeOptions = {},
): Promise<{ base64: string; contentType: string; extension: "png" | "svg" }> {
  if (format === "svg") {
    const svg = await generatePinQRSVG(locationId, options);
    return {
      base64: Buffer.from(svg, "utf8").toString("base64"),
      contentType: "image/svg+xml",
      extension: "svg",
    };
  }
  const png = await generatePinQRBuffer(locationId, options);
  return { base64: png.toString("base64"), contentType: "image/png", extension: "png" };
}