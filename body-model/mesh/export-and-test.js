// Writes the compact collision mesh the prototype loads, bakes sample-data points, and prints label maps for review.
const fs = require('fs');
const vm = require('vm');
const body = JSON.parse(fs.readFileSync('body.json', 'utf8'));
const tags = [...new Set(body.tags)];
const mesh = { p: body.pos.flat().map((v) => Math.round(v * 10)), t: body.tris.flat(), g: body.tags.map((t) => tags.indexOf(t)), tags, n: body.normals.flat().map((v) => Math.round(v * 100)), a: body.ao.map((v) => Math.round(v * 100)) };
fs.writeFileSync('body-mesh.json', JSON.stringify(mesh));
console.log('mesh bytes', fs.statSync('body-mesh.json').size);

const ctx = {};
vm.runInNewContext(fs.readFileSync('app-model.js', 'utf8') + ';this.makeBody = makeBody;', ctx);
const B = ctx.makeBody();
B.setMesh(mesh);

const at = (sx, sy, yaw) => {
  const r = B.cast(sx, sy, yaw);
  if (!r.hit) return null;
  return { ...B.classify(r.p, r.n, r.tag), p: r.p, n: r.n, tag: r.tag };
};
function strip(title, yaw, pts) {
  console.log('\n' + title);
  for (const [x, y] of pts) { const c = at(x, y, yaw); console.log(' ', x, y, c ? c.label + ' [' + c.tag + ']' : 'miss'); }
}
const line = (x0, x1, y, step) => { const out = []; for (let x = x0; x <= x1; x += step) out.push([x, y]); return out; };
const col = (x, y0, y1, step) => { const out = []; for (let y = y0; y <= y1; y += step) out.push([x, y]); return out; };

strip('Face front', 0, col(0, 10, 72, 5));
strip('Face offset', 0, col(9, 14, 72, 6));
strip('Head right side', 90, line(-12, 44, 34, 4));
strip('Head right side, ear height', 90, line(-12, 44, 44, 4));
strip('Head right side, above ear', 90, line(-12, 44, 26, 4));
strip('Left hand row', 0, line(62, 100, 232, 3));
strip('Left hand row 2', 0, line(62, 100, 246, 3));
strip('Hand back', 180, line(-100, -62, 232, 6));

// Sample-data locations, baked so saved reports render before the mesh has loaded.
const anchors = {
  'f-forearm-L': [0, 65, 173], 'f-hand-L': [0, 77, 217], 'f-index-L': [0, 85, 232], 'f-little-L': [0, 68, 232],
  'f-knee-R': [0, -28, 318], 'f-lower-R': [0, -28, 370], 'f-chest-L': [0, 24, 118], 'f-upperarm-L': [0, 58, 125], 'f-head': [0, 0, 25],
  'b-abdomen-L': [180, -18, 190], 'b-abdomen-R': [180, 18, 190], 'b-neck': [180, 0, 66], 'b-shoulder-L': [180, -46, 92], 'b-chest-R': [180, 26, 115],
  'r-above-ear': [90, 16, 26]
};
const baked = {};
const round = (v) => Math.round(v * 100) / 100;
for (const id in anchors) {
  const [y, sx, sy] = anchors[id];
  const c = at(sx, sy, y);
  if (!c) { console.log('SEED MISS', id); continue; }
  baked[id] = { p: c.p.map(round), n: c.n.map(round), label: c.label, area: c.area };
  console.log(id, '=>', c.label);
}
fs.writeFileSync('seed-points.json', JSON.stringify(baked));
