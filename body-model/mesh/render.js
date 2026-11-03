// Renders one rotation frame of the built body to a transparent PNG.
// Usage: node render.js <body.json> <yawDeg> <out.png> [pixelsPerUnit]
const fs = require('fs');
const zlib = require('zlib');

const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const yaw = Number(process.argv[3] || 0);
const out = process.argv[4] || 'frame.png';
const ppu = Number(process.argv[5] || 2.65);
const SS = 2;
const VW = 240, VH = 440, CY = 220, PITCH = 8 * Math.PI / 180;
const W = Math.round(VW * ppu), H = Math.round(VH * ppu);
const RW = W * SS, RH = H * SS, scale = ppu * SS;
const t = yaw * Math.PI / 180, cy = Math.cos(t), sy = Math.sin(t), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
const cam = (v) => {
  const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1] - CY;
  return [x, y * cp + z * sp + CY, z * cp - y * sp];
};
const camDir = (n) => {
  const x = n[0] * cy + n[2] * sy, z = -n[0] * sy + n[2] * cy;
  return [x, n[1] * cp + z * sp, z * cp - n[1] * sp];
};
const P = body.pos.map((v) => {
  const c = cam(v);
  return [(c[0] + VW / 2) * scale, c[1] * scale, c[2]];
});
const N = body.normals.map(camDir);
const AO = body.ao || null;

const zbuf = new Float32Array(RW * RH).fill(-1e9);
const nx = new Float32Array(RW * RH), ny = new Float32Array(RW * RH), nz = new Float32Array(RW * RH), oc = new Float32Array(RW * RH);
for (const [a, b, c] of body.tris) {
  const A = P[a], B = P[b], C = P[c];
  const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxX = Math.min(RW - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
  const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxY = Math.min(RH - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
  const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
  if (Math.abs(den) < 1e-9) continue;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const u = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / den;
      const v = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / den;
      const w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const z = u * A[2] + v * B[2] + w * C[2];
      const i = y * RW + x;
      if (z <= zbuf[i]) continue;
      zbuf[i] = z;
      nx[i] = u * N[a][0] + v * N[b][0] + w * N[c][0];
      ny[i] = u * N[a][1] + v * N[b][1] + w * N[c][1];
      nz[i] = u * N[a][2] + v * N[b][2] + w * N[c][2];
      oc[i] = AO ? u * AO[a] + v * AO[b] + w * AO[c] : 1;
    }
  }
}

// Soft studio light, kept symmetric left to right so negative angles can reuse mirrored frames.
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((q) => q / l); };
const key = norm([0, -0.55, 0.83]);
const half = norm([key[0], key[1], key[2] + 1]);
const shadePx = (i) => {
  const l = Math.hypot(nx[i], ny[i], nz[i]) || 1;
  const X = nx[i] / l, Y = ny[i] / l, Z = nz[i] / l;
  const diff = Math.max(0, X * key[0] + Y * key[1] + Z * key[2]);
  const hemi = 0.5 - 0.5 * Y;
  const spec = Math.pow(Math.max(0, X * half[0] + Y * half[1] + Z * half[2]), 26) * 0.1;
  const rim = Math.pow(1 - Math.max(0, Z), 3) * 0.18;
  const ao = 0.28 + 0.72 * oc[i];
  return Math.max(0, Math.min(1, ((0.5 * diff + 0.4 * hemi + 0.1) * ao + spec) * (1 - rim)));
};

const buf = Buffer.alloc((W * 4 + 1) * H);
for (let j = 0; j < H; j++) {
  const row = j * (W * 4 + 1);
  for (let i = 0; i < W; i++) {
    let sum = 0, cover = 0;
    for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) {
      const k = (j * SS + b) * RW + i * SS + a;
      if (zbuf[k] > -1e8) { sum += shadePx(k); cover++; }
    }
    if (!cover) continue;
    const shade = sum / cover;
    const o = row + 1 + i * 4;
    // Neutral stone tone, deliberately not a skin color.
    const mix = (d, l) => Math.round((d + (l - d) * shade) / 2) * 2;
    buf[o] = mix(84, 232); buf[o + 1] = mix(102, 239); buf[o + 2] = mix(106, 238);
    buf[o + 3] = Math.round(cover / (SS * SS) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tp = Buffer.from(type);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([tp, data])));
  return Buffer.concat([len, tp, data, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(buf, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
