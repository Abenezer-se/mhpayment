/** Generates the app icon (PNG) with no image library: deep-blue square with a white cross. */
import zlib from "node:zlib";

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

export function makeIcon(size: number): Buffer {
  const bg = [23, 66, 107], fg = [255, 255, 255], gold = [201, 156, 52];
  const rows: Buffer[] = [];
  const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 * size && x < x1 * size && y >= y0 * size && y < y1 * size;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0 + RGBA
    for (let x = 0; x < size; x++) {
      let c = bg;
      if (inRect(x, y, 0.455, 0.2, 0.545, 0.74) || inRect(x, y, 0.32, 0.32, 0.68, 0.41)) c = fg;
      if (inRect(x, y, 0.3, 0.8, 0.7, 0.825)) c = gold;
      const o = 1 + x * 4; row[o] = c[0]; row[o + 1] = c[1]; row[o + 2] = c[2]; row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0)),
  ]);
}