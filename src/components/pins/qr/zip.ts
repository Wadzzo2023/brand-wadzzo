/**
 * ── Minimal ZIP writer ──────────────────────────────────────────────────────
 *
 * Store-only (no compression), which is the right trade for this payload: a QR
 * SVG is a few KB of path data that a print shop, Figma, or a QR decoder will
 * open and re-save anyway. Deflate would buy a fraction of a millisecond and
 * cost a dependency plus a compressor that can fail on large runs.
 *
 * The alternative was sequential browser downloads for a 40-pin drop, which
 * Chrome gates behind "allow multiple downloads?", silently drops in Safari, and
 * leaves the brand with 40 loose files instead of one thing to send a printer.
 * A zip is one click, one file, and the format every print shop already expects.
 *
 * Spec: PKWARE APPNOTE 6.3.3. Only the two stores and one descriptor are
 * written — no data descriptors, no ZIP64 — so a run stays inside 4GB, which is
 * far past the 100-code ceiling on the server.
 */

export type ZipEntry = {
  /** Filename inside the archive. Must be unique. */
  name: string;
  data: Uint8Array;
};

/** CRC-32, table built once. Reflected polynomial, as the format requires. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32 over the payload.
 *
 * `for…of` rather than an index loop purely because `noUncheckedIndexedAccess`
 * makes `data[i]` `number | undefined`, and the table lookup is already
 * non-null-asserted by range. Iterating the values sidesteps the cast entirely.
 */
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time pair. Two-second resolution and years from 1980, hence the maths. */
function dosStamp(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  bytes(b: Uint8Array): this {
    this.chunks.push(b);
    this.length += b.length;
    return this;
  }

  /** Little-endian, the format's only byte order. */
  u16(v: number): this {
    return this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }

  u32(v: number): this {
    return this.bytes(
      new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]),
    );
  }

  build(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

const utf8 = new TextEncoder();

/**
 * Build a zip archive. Entries are stored in the order given, which is the order
 * they appear on disk — so callers should sort by pin number, not by id.
 */
export function buildZip(entries: ZipEntry[], when = new Date()): Uint8Array {
  const { time, date } = dosStamp(when);
  const out = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = utf8.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = out.length;

    out.u32(0x04034b50); // local file header
    out.u16(20); // version needed to extract: 2.0 — deflate optional
    out.u16(0x0800); // flags: filename is UTF-8
    out.u16(0); // method: store
    out.u16(time).u16(date);
    out.u32(crc).u32(entry.data.length).u32(entry.data.length);
    out.u16(name.length).u16(0); // extra field length
    out.bytes(name).bytes(entry.data);

    central.push({ name, crc, size: entry.data.length, offset });
  }

  // The directory is written after every entry, so its own offset is whatever the
  // local-header block ended on.
  const directoryStart = out.length;
  for (const e of central) {
    out.u32(0x02014b50); // central directory header
    out.u16(20).u16(20); // version made by / needed
    out.u16(0x0800).u16(0);
    out.u16(time).u16(date);
    out.u32(e.crc).u32(e.size).u32(e.size);
    out.u16(e.name.length).u16(0).u16(0); // name, extra, comment
    out.u16(0).u16(0).u32(0); // disk number, attrs, local header offset (high bits)
    out.u32(e.offset);
    out.bytes(e.name);
  }
  const directorySize = out.length - directoryStart;

  out.u32(0x06054b50); // end of central directory
  out.u16(0).u16(0);
  out.u16(central.length).u16(central.length);
  out.u32(directorySize).u32(directoryStart);
  out.u16(0); // comment length

  return out.build();
}