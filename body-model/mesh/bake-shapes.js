// Bakes body-shape options as per-vertex offsets from the default body.
// Usage: node bake-shapes.js <makehuman data dir> <scratch dir> [variant render yaw list]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [DATA, TMP] = process.argv.slice(2);
const VARIANTS = {
  f: { BODY_MALE: '0', BODY_CHEST_W: '0', BODY_CHEST_R: '0.8' },
  // Less of the heavier target, more of the muscular one and a wider chest rebuild, for a flat, typical male chest.
  m: { BODY_MALE: '1', BODY_CHEST_W: '0', BODY_WEIGHT_UP: '0.1', BODY_MUSCLE_UP: '0.8', BODY_CHEST_R: '0.65' },
  s: { BODY_WEIGHT_UP: '0', BODY_WEIGHT_DOWN: '1' },
  h: { BODY_WEIGHT_UP: '1' }
};
const base = JSON.parse(fs.readFileSync('body.json', 'utf8')).pos.flat();
const out = {};
for (const id in VARIANTS) {
  const file = path.join(TMP, 'variant-' + id + '.json');
  execFileSync('node', ['build.js', DATA, file], { env: { ...process.env, BODY_NO_AO: '1', ...VARIANTS[id] }, stdio: 'inherit' });
  const pos = JSON.parse(fs.readFileSync(file, 'utf8')).pos.flat();
  if (pos.length !== base.length) throw new Error('vertex count changed');
  out[id] = pos.map((v, i) => Math.round((v - base[i]) * 10));
}
fs.writeFileSync('body-shapes.json', JSON.stringify(out));
console.log('shapes bytes', fs.statSync('body-shapes.json').size);
