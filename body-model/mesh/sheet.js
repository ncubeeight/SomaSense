// Joins same-size frames from render.js side by side on white, for review.
// Usage: node sheet.js <out.png> <a.png> <b.png> ...
const fs = require('fs'), zlib = require('zlib');
const [out, ...files] = process.argv.slice(2);
const read = (f) => {
  const b = fs.readFileSync(f); let o = 8, w, h; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  return { w, h, raw: zlib.inflateSync(Buffer.concat(idat)) };
};
const imgs = files.map(read), W = imgs[0].w, H = imgs[0].h, TW = W * imgs.length;
const buf = Buffer.alloc((TW * 3 + 1) * H, 255);
for (let y = 0; y < H; y++) {
  const r = y * (TW * 3 + 1); buf[r] = 0;
  imgs.forEach((im, n) => {
    const s = y * (W * 4 + 1) + 1;
    for (let x = 0; x < W; x++) {
      const p = s + x * 4, a = im.raw[p + 3] / 255, q = r + 1 + (n * W + x) * 3;
      for (let c = 0; c < 3; c++) buf[q + c] = Math.round(im.raw[p + c] * a + 255 * (1 - a));
    }
  });
}
const tb = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = tb[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const T = Buffer.from(t), c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([T, d]))); return Buffer.concat([l, T, d, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(TW, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(buf, { level: 9 })), ch('IEND', Buffer.alloc(0))]));
