// Minimal ZIP writer (STORE only, no compression) — enough to hand the user a
// folder structure as one download without adding a dependency. Bodies here
// are markdown and originals that are already compressed (pdf/jpg/…), so
// store-only costs little. Pure module (no imports): unit-tests under
// node:test; deterministic — the caller injects the timestamp.
//
// Layout per the PKWARE APPNOTE: [local header + data]* then the central
// directory, then the end-of-central-directory record.

export interface ZipEntry {
  /** Forward-slash path inside the archive ("acme/inv-1.md"). */
  path: string;
  data: Uint8Array;
}

/* --- CRC-32 (the standard reflected polynomial) --------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* --- DOS date/time (ZIP's native timestamp format) ------------------------ */
function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
  };
}

/* --- The writer ------------------------------------------------------------ */
class ByteSink {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array) { this.chunks.push(b); this.length += b.length; }
  u16(v: number) { this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff])); }
  u32(v: number) { this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])); }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

/**
 * Build a ZIP archive from `entries` (STOREd, UTF-8 names). Deterministic:
 * same entries + same `mtime` → identical bytes.
 */
export function buildZip(entries: ZipEntry[], mtime: Date): Uint8Array {
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(mtime);
  const sink = new ByteSink();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const e of entries) {
    const name = enc.encode(e.path);
    const crc = crc32(e.data);
    central.push({ name, crc, size: e.data.length, offset: sink.length });
    sink.u32(0x04034b50);       // local file header signature
    sink.u16(20);               // version needed
    sink.u16(0x0800);           // flags: UTF-8 names
    sink.u16(0);                // method: store
    sink.u16(time); sink.u16(date);
    sink.u32(crc);
    sink.u32(e.data.length);    // compressed size (== raw, stored)
    sink.u32(e.data.length);    // uncompressed size
    sink.u16(name.length);
    sink.u16(0);                // extra length
    sink.push(name);
    sink.push(e.data);
  }

  const cdStart = sink.length;
  for (const c of central) {
    sink.u32(0x02014b50);       // central directory header signature
    sink.u16(20);               // version made by
    sink.u16(20);               // version needed
    sink.u16(0x0800);
    sink.u16(0);
    sink.u16(time); sink.u16(date);
    sink.u32(c.crc);
    sink.u32(c.size);
    sink.u32(c.size);
    sink.u16(c.name.length);
    sink.u16(0);                // extra
    sink.u16(0);                // comment
    sink.u16(0);                // disk number
    sink.u16(0);                // internal attrs
    sink.u32(0);                // external attrs
    sink.u32(c.offset);
    sink.push(c.name);
  }
  const cdSize = sink.length - cdStart;

  sink.u32(0x06054b50);         // end of central directory
  sink.u16(0); sink.u16(0);
  sink.u16(central.length); sink.u16(central.length);
  sink.u32(cdSize);
  sink.u32(cdStart);
  sink.u16(0);                  // comment length

  return sink.concat();
}
