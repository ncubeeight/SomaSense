// Builds the app's neutral body from MakeHuman's CC0 data (base mesh hm08, macro targets, default rig weights).
// Usage: node build.js <makehuman data dir> <out.json> [arm angle from vertical, degrees]
const fs = require('fs');
const path = require('path');

const DATA = process.argv[2];
const OUT = process.argv[3] || 'body.json';
const ARM_DEG = Number(process.argv[4] || 15);
const TWIST = Number(process.argv[5] || -75);
const LEG_DEG = Number(process.argv[6] || 1);

// ---- Base mesh ----
const obj = fs.readFileSync(path.join(DATA, '3dobjs/base.obj'), 'utf8').split('\n');
const verts = [];
const quads = [];
let group = '';
for (const line of obj) {
  if (line.startsWith('v ')) {
    const p = line.split(/\s+/);
    verts.push([+p[1], +p[2], +p[3]]);
  } else if (line.startsWith('g ')) {
    group = line.slice(2).trim();
  } else if (line.startsWith('f ') && group === 'body') {
    quads.push(line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1));
  }
}

// ---- Macro targets: 50/50 gender, age 25, average muscle and weight, equal mix of the three base populations ----
function applyTarget(rel, w) {
  const text = fs.readFileSync(path.join(DATA, 'targets', rel), 'utf8');
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    const v = verts[+p[0]];
    v[0] += +p[1] * w; v[1] += +p[2] * w; v[2] += +p[3] * w;
  }
}
// Environment settings bake the app's body-shape options; left unset, this builds the default body.
const MALE = Number(process.env.BODY_MALE || 0.5);
const WEIGHT_UP = Number(process.env.BODY_WEIGHT_UP || 0.22); // share of MakeHuman's heavier target, for a population-average build rather than a slim one
const WEIGHT_DOWN = Number(process.env.BODY_WEIGHT_DOWN || 0); // share of MakeHuman's lighter target
const MUSCLE_UP = Number(process.env.BODY_MUSCLE_UP || 0); // share of MakeHuman's max-muscle targets, for a firmer, flatter chest
for (const g of ['female', 'male']) {
  const share = g === 'male' ? MALE : 1 - MALE;
  if (!share) continue;
  const mix = (muscle, s) => {
    applyTarget(`macrodetails/universal-${g}-young-${muscle}-averageweight.target`, s * (1 - WEIGHT_UP - WEIGHT_DOWN));
    applyTarget(`macrodetails/universal-${g}-young-${muscle}-maxweight.target`, s * WEIGHT_UP);
    if (WEIGHT_DOWN) applyTarget(`macrodetails/universal-${g}-young-${muscle}-minweight.target`, s * WEIGHT_DOWN);
  };
  mix('averagemuscle', share * (1 - MUSCLE_UP));
  if (MUSCLE_UP) mix('maxmuscle', share * MUSCLE_UP);
  for (const r of ['african', 'asian', 'caucasian']) applyTarget(`macrodetails/${r}-${g}-young.target`, share / 3);
}

// Smallest chest setting, using MakeHuman's own target, for a shape between typical male and female.
applyTarget(process.env.BODY_CHEST || 'breast/female-young-averagemuscle-averageweight-mincup-averagefirmness.target', Number(process.env.BODY_CHEST_W || 0.5));

// ---- Rig data ----
const skel = JSON.parse(fs.readFileSync(path.join(DATA, 'rigs/default.mhskel'), 'utf8'));
const weights = JSON.parse(fs.readFileSync(path.join(DATA, 'rigs/default_weights.mhw'), 'utf8')).weights;
const jointAt = (name) => {
  const ids = skel.joints[name];
  const c = [0, 0, 0];
  for (const i of ids) { c[0] += verts[i][0]; c[1] += verts[i][1]; c[2] += verts[i][2]; }
  return c.map((v) => v / ids.length);
};

const total = new Float64Array(verts.length);
const domW = new Float64Array(verts.length);
const domBone = new Array(verts.length).fill(null);
for (const bone in weights) {
  for (const [i, w] of weights[bone]) {
    total[i] += w;
    if (w > domW[i]) { domW[i] = w; domBone[i] = bone; }
  }
}

// ---- Neutral chest: rebuild the surface around each nipple from the skin just outside it, so the figure stays androgynous ----
function solve(A, b) {
  const n = b.length, M = A.map((row, r) => row.concat([b[r]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k2 = c; k2 <= n; k2++) M[r][k2] -= f * M[c][k2];
    }
  }
  return M.map((row, r) => row[n] / row[r]);
}
const bodyVerts = [...new Set(quads.flat())];
for (const side of ['L', 'R']) {
  const tip = jointAt(skel.bones[`breast.${side}`].tail);
  const R = Number(process.env.BODY_CHEST_R || 0.42), RING = R + 0.2;
  const feats = (dx, dy) => [1, dx, dy, dx * dx, dx * dy, dy * dy];
  const ATA = Array.from({ length: 6 }, () => new Array(6).fill(0)), ATb = new Array(6).fill(0);
  for (const i of bodyVerts) {
    const dx = verts[i][0] - tip[0], dy = verts[i][1] - tip[1], d = Math.hypot(dx, dy);
    if (d < R || d > RING || verts[i][2] < tip[2] - 0.9) continue;
    const f = feats(dx, dy);
    for (let a = 0; a < 6; a++) { ATb[a] += f[a] * verts[i][2]; for (let b = 0; b < 6; b++) ATA[a][b] += f[a] * f[b]; }
  }
  const c = solve(ATA, ATb);
  for (const i of bodyVerts) {
    const dx = verts[i][0] - tip[0], dy = verts[i][1] - tip[1], d = Math.hypot(dx, dy);
    if (d >= R || verts[i][2] < tip[2] - 0.9) continue;
    const f = feats(dx, dy);
    const fit = f.reduce((sum, v, a) => sum + v * c[a], 0);
    const t = (R - d) / R;
    const blend = t * t * (3 - 2 * t);
    verts[i][2] += (fit - verts[i][2]) * blend;
  }
}

// ---- Pose: MakeHuman rests with arms out and legs apart; bring both to a relaxed standing pose ----
function rotateChain(bones, pivot, axis, angle, partial) {
  const amount = new Float64Array(verts.length);
  for (const b of bones) for (const [i, wt] of weights[b] || []) amount[i] += wt;
  for (const b in partial || {}) for (const [i, wt] of weights[b] || []) amount[i] += wt * partial[b];
  const l = Math.hypot(axis[0], axis[1], axis[2]);
  const u = axis.map((q) => q / l);
  for (let i = 0; i < verts.length; i++) {
    if (!amount[i]) continue;
    const a = Math.min(1, amount[i] / (total[i] || 1)) * angle;
    const c = Math.cos(a), n = Math.sin(a);
    const d = [verts[i][0] - pivot[0], verts[i][1] - pivot[1], verts[i][2] - pivot[2]];
    const dot = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const cr = [u[1] * d[2] - u[2] * d[1], u[2] * d[0] - u[0] * d[2], u[0] * d[1] - u[1] * d[0]];
    for (let k2 = 0; k2 < 3; k2++) verts[i][k2] = pivot[k2] + d[k2] * c + cr[k2] * n + u[k2] * dot * (1 - c);
  }
}
const handBones = (side) => ['wrist', 'metacarpal1', 'metacarpal2', 'metacarpal3', 'metacarpal4', ...[1, 2, 3, 4, 5].flatMap((f) => [1, 2, 3].map((n) => `finger${f}-${n}`))].map((b) => `${b}.${side}`);
const armChain = (side) => ['upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02'].map((b) => `${b}.${side}`).concat(handBones(side));
const footBones = (side) => ['foot', ...[1, 2, 3, 4, 5].flatMap((t) => [1, 2, 3].map((n) => `toe${t}-${n}`))].map((b) => `${b}.${side}`);
const legChain = (side) => ['upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02'].map((b) => `${b}.${side}`).concat(footBones(side));
for (const side of ['L', 'R']) {
  const sign = side === 'L' ? 1 : -1;
  const shoulderPartial = { [`shoulder01.${side}`]: 0.45 };
  // Arm down to ARM_DEG from vertical (rotation about the front-back axis).
  let s = jointAt(skel.bones[`upperarm01.${side}`].head);
  let w = jointAt(skel.bones[`wrist.${side}`].head);
  const out = Math.atan2((w[0] - s[0]) * sign, s[1] - w[1]);
  rotateChain(armChain(side), s, [0, 0, 1], -(out - ARM_DEG * Math.PI / 180) * sign, shoulderPartial);
  // Arm back so the wrist hangs under the shoulder rather than reaching forward.
  w = jointAt(skel.bones[`wrist.${side}`].head);
  const fwd = Math.atan2(w[2] - s[2], s[1] - w[1]);
  rotateChain(armChain(side), s, [1, 0, 0], fwd - 3 * Math.PI / 180, shoulderPartial);
  // Turn the forearm so palms face forward and fingers read clearly from the front.
  const e = jointAt(skel.bones[`lowerarm01.${side}`].head);
  w = jointAt(skel.bones[`wrist.${side}`].head);
  rotateChain(handBones(side), w, [w[0] - e[0], w[1] - e[1], w[2] - e[2]], TWIST * Math.PI / 180 * sign, { [`lowerarm02.${side}`]: 0.75, [`lowerarm01.${side}`]: 0.3 });
  // Legs in to a natural stance, then level the feet again.
  const hip = jointAt(skel.bones[`upperleg01.${side}`].head);
  const ankle = jointAt(skel.bones[`foot.${side}`].head);
  const legOut = Math.atan2((ankle[0] - hip[0]) * sign, hip[1] - ankle[1]);
  const legDelta = -(legOut - LEG_DEG * Math.PI / 180) * sign;
  rotateChain(legChain(side), hip, [0, 0, 1], legDelta, { [`pelvis.${side}`]: 0.25 });
  const ankle2 = jointAt(skel.bones[`foot.${side}`].head);
  rotateChain(footBones(side), ankle2, [0, 0, 1], -legDelta, { [`lowerleg02.${side}`]: 0.15 });
}

// ---- Normalize to the app's units: y down, about 430 tall, x centered, z centered on the torso ----
const used = new Set(quads.flat());
let top = Infinity, bottom = -Infinity;
for (const i of used) { top = Math.min(top, -verts[i][1]); bottom = Math.max(bottom, -verts[i][1]); }
const k = 428 / (bottom - top);
const spine = jointAt(skel.bones['spine03'].head);
const tx = (v) => [(v[0] - 0) * k, (-v[1] - top) * k + 6, (v[2] - spine[2]) * k];

// ---- Regions: dominant rig bone, refined with the vertex sets of MakeHuman's face targets ----
const fromBone = (b) => {
  if (!b) return 'torso-upper';
  const n = b.replace(/\.(L|R)$/, '');
  const f = /^finger(\d)/.exec(n);
  if (f) return ['thumb', 'index', 'middle', 'ring', 'pinky'][+f[1] - 1];
  const t = /^toe(\d)/.exec(n);
  if (t) return 'toe' + t[1];
  if (n.startsWith('metacarpal') || n === 'wrist') return 'palm';
  if (n.startsWith('lowerarm')) return 'forearm';
  if (n.startsWith('upperarm')) return 'upperarm';
  if (n === 'shoulder01' || n === 'clavicle') return 'shoulder';
  if (n.startsWith('neck')) return 'neck';
  if (n === 'spine01' || n === 'spine02' || n === 'breast') return 'torso-upper';
  if (n === 'spine03' || n === 'spine04' || n === 'spine05') return 'torso-lower';
  if (n === 'pelvis' || n === 'root') return 'hip';
  if (n.startsWith('upperleg')) return 'thigh';
  if (n.startsWith('lowerleg')) return 'calf';
  if (n === 'foot') return 'foot';
  return 'head';
};
const tags = verts.map((_, i) => fromBone(domBone[i]));
function markFromTargets(dir, tag, filter) {
  const root = path.join(DATA, 'targets', dir);
  for (const f of fs.readdirSync(root)) {
    if (!f.endsWith('.target') || (filter && !filter.test(f))) continue;
    for (const line of fs.readFileSync(path.join(root, f), 'utf8').split('\n')) {
      if (!line || line[0] === '#') continue;
      const p = line.trim().split(/\s+/);
      if (p.length >= 4 && tags[+p[0]] === 'head') tags[+p[0]] = tag;
    }
  }
}
markFromTargets('ears', 'ear');
markFromTargets('nose', 'nose');
markFromTargets('eyes', 'eye');
markFromTargets('mouth', 'mouth');
markFromTargets('chin', 'chin');
markFromTargets('cheek', 'cheek');
markFromTargets('forehead', 'forehead');

// ---- Output mesh: body plus a simple closed eye form in the sockets so the figure has no holes ----
const remap = new Map();
const pos = [], tagOut = [], tris = [];
const addV = (v, tag) => { pos.push(v); tagOut.push(tag); return pos.length - 1; };
for (const q of quads) {
  const id = q.map((i) => {
    if (!remap.has(i)) remap.set(i, addV(tx(verts[i]), tags[i]));
    return remap.get(i);
  });
  tris.push([id[0], id[1], id[2]]);
  if (id.length === 4) tris.push([id[0], id[2], id[3]]);
}
for (const side of ['L', 'R']) {
  const c = tx(jointAt(skel.bones[`eye.${side}`].head));
  const r = 2.9, base = pos.length, N = 12, M = 16;
  for (let a = 0; a <= N; a++) for (let b = 0; b < M; b++) {
    const th = a / N * Math.PI, ph = b / M * 2 * Math.PI;
    addV([c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.cos(th), c[2] + r * Math.sin(th) * Math.sin(ph)], 'eye');
  }
  for (let a = 0; a < N; a++) for (let b = 0; b < M; b++) {
    const p = base + a * M + b, q = base + a * M + (b + 1) % M, u = p + M, w = q + M;
    tris.push([p, q, w]); tris.push([p, w, u]);
  }
}

// Consistent outward faces are not guaranteed for the eye forms, so normals are built from the body orientation.
const normals = pos.map(() => [0, 0, 0]);
for (const [a, b, c] of tris) {
  const A = pos[a], B = pos[b], C = pos[c];
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const i of [a, b, c]) { normals[i][0] += n[0]; normals[i][1] += n[1]; normals[i][2] += n[2]; }
}
for (const n of normals) { const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l; }
// y was flipped, which flips winding; check the nose tip points forward and flip all normals if not.
let probe = 0, best = -1e9;
for (let i = 0; i < pos.length; i++) if (tagOut[i] === 'nose' && pos[i][2] > best) { best = pos[i][2]; probe = i; }
if (normals[probe][2] < 0) for (const n of normals) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }

// Light normal smoothing evens out small topology marks on the skin.
{
  const nb = pos.map(() => new Set());
  for (const [a, b, c] of tris) { nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b); }
  for (let pass = 0; pass < 3; pass++) {
    const prev = normals.map((n) => n.slice());
    for (let i = 0; i < pos.length; i++) {
      const v = [prev[i][0] * 2, prev[i][1] * 2, prev[i][2] * 2];
      for (const n of nb[i]) { v[0] += prev[n][0]; v[1] += prev[n][1]; v[2] += prev[n][2]; }
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      normals[i] = [v[0] / l, v[1] / l, v[2] / l];
    }
  }
}

// ---- Baked ambient occlusion, so creases and limb overlaps read as real volume ----
const triBox = tris.map(([a, b, c]) => {
  const A = pos[a], B = pos[b], C = pos[c];
  return { t: [a, b, c], lo: [0, 1, 2].map((k3) => Math.min(A[k3], B[k3], C[k3])), hi: [0, 1, 2].map((k3) => Math.max(A[k3], B[k3], C[k3])) };
});
function buildBvh(items) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const it of items) for (let k3 = 0; k3 < 3; k3++) { lo[k3] = Math.min(lo[k3], it.lo[k3]); hi[k3] = Math.max(hi[k3], it.hi[k3]); }
  if (items.length <= 6) return { lo, hi, items };
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const axis = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : (ext[1] > ext[2] ? 1 : 2);
  items.sort((p, q) => (p.lo[axis] + p.hi[axis]) - (q.lo[axis] + q.hi[axis]));
  const m = items.length >> 1;
  return { lo, hi, l: buildBvh(items.slice(0, m)), r: buildBvh(items.slice(m)) };
}
const bvh = buildBvh(triBox);
function hitsAnything(node, o, d, maxT) {
  let t0 = 0, t1 = maxT;
  for (let a = 0; a < 3; a++) {
    const inv = 1 / d[a];
    let n = (node.lo[a] - o[a]) * inv, f = (node.hi[a] - o[a]) * inv;
    if (n > f) { const tmp = n; n = f; f = tmp; }
    if (n > t0) t0 = n;
    if (f < t1) t1 = f;
    if (t0 > t1) return false;
  }
  if (node.items) {
    for (const it of node.items) {
      const A = pos[it.t[0]], B = pos[it.t[1]], C = pos[it.t[2]];
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(det) < 1e-9) continue;
      const f = 1 / det, sv = [o[0] - A[0], o[1] - A[1], o[2] - A[2]];
      const u = f * (sv[0] * h[0] + sv[1] * h[1] + sv[2] * h[2]);
      if (u < 0 || u > 1) continue;
      const q = [sv[1] * e1[2] - sv[2] * e1[1], sv[2] * e1[0] - sv[0] * e1[2], sv[0] * e1[1] - sv[1] * e1[0]];
      const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
      if (v < 0 || u + v > 1) continue;
      const tt = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
      if (tt > 0.02 && tt < maxT) return true;
    }
    return false;
  }
  return hitsAnything(node.l, o, d, maxT) || hitsAnything(node.r, o, d, maxT);
}
const SAMPLES = process.env.BODY_NO_AO ? 0 : 48;
let ao = pos.map((p, i) => {
  const n = normals[i];
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tl = Math.hypot(up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]);
  const T = [(up[1] * n[2] - up[2] * n[1]) / tl, (up[2] * n[0] - up[0] * n[2]) / tl, (up[0] * n[1] - up[1] * n[0]) / tl];
  const B = [n[1] * T[2] - n[2] * T[1], n[2] * T[0] - n[0] * T[2], n[0] * T[1] - n[1] * T[0]];
  const o = [p[0] + n[0] * 0.25, p[1] + n[1] * 0.25, p[2] + n[2] * 0.25];
  let open = 0;
  for (let s2 = 0; s2 < SAMPLES; s2++) {
    const r = Math.sqrt((s2 + 0.5) / SAMPLES), phi = s2 * 2.399963;
    const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(1 - r * r);
    const d = [T[0] * lx + B[0] * ly + n[0] * lz, T[1] * lx + B[1] * ly + n[1] * lz, T[2] * lx + B[2] * ly + n[2] * lz];
    if (!hitsAnything(bvh, o, d, 70)) open++;
  }
  return SAMPLES ? open / SAMPLES : 1;
});
const adj = pos.map(() => new Set());
for (const [a, b, c] of tris) { adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b); }
for (let pass = 0; pass < 2; pass++) {
  ao = ao.map((v, i) => {
    let sum = v * 2, cnt = 2;
    for (const n of adj[i]) { sum += ao[n]; cnt++; }
    return sum / cnt;
  });
}

// ---- Report ----
const ys = pos.map((p) => p[1]), xs = pos.map((p) => Math.abs(p[0])), zs = pos.map((p) => p[2]);
console.log('verts', pos.length, 'tris', tris.length, 'yRange', Math.min(...ys).toFixed(1), Math.max(...ys).toFixed(1), 'maxX', Math.max(...xs).toFixed(1), 'zRange', Math.min(...zs).toFixed(1), Math.max(...zs).toFixed(1));
const counts = {};
tagOut.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
console.log(counts);

fs.writeFileSync(OUT, JSON.stringify({ pos, normals, tris, tags: tagOut, ao }));
