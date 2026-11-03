function makeBody() {
  // Camera matches the rendered frames: orthographic, looking slightly down.
  const PITCH = 8 * Math.PI / 180, CY = 220;
  const cosP = Math.cos(PITCH), sinP = Math.sin(PITCH);
  let P = null, T = null, G = null, names = null, proj = null, projYaw = null;
  function setMesh(data) {
    P = data.p.map((v) => v / 10);
    T = data.t;
    G = data.g;
    names = data.tags;
    proj = new Float32Array(P.length);
    projYaw = null;
  }
  function toScreen(x, y, z, yaw) {
    const t = yaw * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    const cx = x * c + z * s, cz = -x * s + z * c, v = y - CY;
    return { sx: cx, sy: v * cosP + cz * sinP + CY, depth: cz * cosP - v * sinP };
  }
  function viewDir(yaw) {
    const t = yaw * Math.PI / 180;
    return [-Math.sin(t) * cosP, -sinP, Math.cos(t) * cosP];
  }
  function project(yaw) {
    if (projYaw === yaw) return;
    const t = yaw * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    for (let i = 0; i < P.length; i += 3) {
      const cx = P[i] * c + P[i + 2] * s, cz = -P[i] * s + P[i + 2] * c, v = P[i + 1] - CY;
      proj[i] = cx;
      proj[i + 1] = v * cosP + cz * sinP + CY;
      proj[i + 2] = cz * cosP - v * sinP;
    }
    projYaw = yaw;
  }
  // Finds the surface nearest the viewer under a screen point.
  function cast(sx, sy, yaw) {
    if (!P) return { hit: false };
    project(yaw);
    let best = -Infinity, bt = -1, bu = 0, bv = 0;
    for (let i = 0; i < T.length; i += 3) {
      const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
      const ax = proj[a], ay = proj[a + 1], bx = proj[b], by = proj[b + 1], cx = proj[c], cy = proj[c + 1];
      if ((sx < ax && sx < bx && sx < cx) || (sx > ax && sx > bx && sx > cx) || (sy < ay && sy < by && sy < cy) || (sy > ay && sy > by && sy > cy)) continue;
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-9) continue;
      const u = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den;
      const v = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const w = 1 - u - v;
      const depth = u * proj[a + 2] + v * proj[b + 2] + w * proj[c + 2];
      if (depth > best) { best = depth; bt = i; bu = u; bv = v; }
    }
    if (bt < 0) return { hit: false };
    const ia = T[bt], ib = T[bt + 1], ic = T[bt + 2], bw = 1 - bu - bv;
    const at = (i, k) => P[i * 3 + k];
    const p = [0, 1, 2].map((k) => bu * at(ia, k) + bv * at(ib, k) + bw * at(ic, k));
    const e1 = [0, 1, 2].map((k) => at(ib, k) - at(ia, k)), e2 = [0, 1, 2].map((k) => at(ic, k) - at(ia, k));
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((q) => q / l);
    const d = viewDir(yaw);
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) n = n.map((q) => -q);
    const vertex = bu >= bv && bu >= bw ? ia : bv >= bw ? ib : ic;
    return { hit: true, p, n, depth: best, tag: names[G[vertex]] };
  }
  function classify(p, n, tag) {
    const x = p[0], y = p[1], z = p[2], ax = Math.abs(x);
    const S = x > 0 ? 'Left' : 'Right', s = S.toLowerCase();
    const f = n[2] > 0.55 ? 'front' : n[2] < -0.55 ? 'back' : 'side';
    const outer = n[0] * x > 0;
    const name = (label, area) => ({ label: label, area: area });
    const headTags = ['head', 'ear', 'nose', 'eye', 'mouth', 'chin', 'cheek', 'forehead'];
    if (headTags.includes(tag)) {
      if (ax > 16 && y > 29 && y < 51 && z > 4 && z < 22) return name(S + ' ear', 'head');
      if (n[1] < -0.72 && y < 20) return name('Top of head', 'head');
      if (f === 'back' || z < -1) return name('Back of head', 'head');
      if (f === 'side' || (ax >= 13 && z < 30)) {
        if (y >= 33 && z < 8) return name('Behind ' + s + ' ear', 'head');
        if (y < 33 && z < 24) return name('Above ' + s + ' ear', 'head');
        if (y < 33) return name(S + ' temple', 'head');
        if (y >= 48) return name(S + ' jaw', 'head');
        return name(S + ' cheek', 'head');
      }
      if (y < 30) return name('Forehead', 'head');
      if (y < 38 && ax >= 4) return name(S + ' eye area', 'head');
      if (ax < 5 && y < 48) return name('Nose', 'head');
      if (ax < 8 && y >= 48 && y < 57) return name('Mouth', 'head');
      if (ax < 11 && y >= 57) return name('Chin', 'head');
      return name(S + (y >= 50 ? ' jaw' : ' cheek'), 'head');
    }
    switch (tag) {
      case 'neck':
        return name(f === 'front' ? 'Front of neck' : f === 'back' ? 'Back of neck' : S + ' side of neck', 'head');
      case 'shoulder': return name((f === 'back' ? 'Back of ' + s : S) + ' shoulder', 'arms');
      case 'upperarm':
        if (y < 90) return name((f === 'back' ? 'Back of ' + s : S) + ' shoulder', 'arms');
        return name(f === 'front' ? 'Front of ' + s + ' upper arm' : f === 'back' ? 'Back of ' + s + ' upper arm' : (outer ? 'Outer ' : 'Inner ') + s + ' upper arm', 'arms');
      case 'forearm':
        return name(f === 'front' ? S + ' forearm, palm side' : f === 'back' ? S + ' forearm, back' : (outer ? 'Outer ' : 'Inner ') + s + ' forearm', 'arms');
      case 'palm':
        if (y < 212) return name(S + ' wrist', 'arms');
        return name(n[2] >= 0 ? S + ' palm' : 'Back of ' + s + ' hand', 'arms');
      case 'thumb': return name(S + ' thumb', 'arms');
      case 'index': return name(S + ' index finger', 'arms');
      case 'middle': return name(S + ' middle finger', 'arms');
      case 'ring': return name(S + ' ring finger', 'arms');
      case 'pinky': return name(S + ' little finger', 'arms');
      case 'torso-upper':
        if (y < 76) return name(f === 'front' ? 'Front of neck' : f === 'back' ? 'Back of neck' : S + ' side of neck', 'head');
        if (f === 'front') return name(ax < 6 ? 'Center of chest' : S + ' chest', 'torso');
        if (f === 'back') return name(ax < 6 ? 'Upper spine' : S + ' upper back', 'torso');
        return name(S + ' ribs', 'torso');
      case 'torso-lower':
        if (f === 'front') return name(ax < 6 && y > 165 && y < 190 ? 'Around the navel' : S + ' abdomen', 'torso');
        if (f === 'back') return name(ax < 6 ? 'Lower spine' : S + ' lower back', 'torso');
        return name(S + ' flank', 'torso');
      case 'hip':
        if (f === 'back') return name(S + ' buttock', 'torso');
        if (f === 'front') return name(ax < 14 ? 'Groin' : S + ' hip', 'torso');
        return name('Outer ' + s + ' hip', 'torso');
      case 'thigh':
        if (y < 234) {
          if (f === 'back') return name(S + ' buttock', 'torso');
          if (f === 'front') return name(ax < 14 ? 'Groin' : S + ' hip', 'torso');
          return name('Outer ' + s + ' hip', 'torso');
        }
        if (f === 'back' && y < 252) return name(S + ' buttock', 'torso');
        if (y > 300) return name(f === 'back' ? 'Back of ' + s + ' knee' : f === 'side' ? (outer ? 'Outer ' : 'Inner ') + s + ' knee' : S + ' kneecap', 'legs');
        return name(f === 'front' ? 'Front of ' + s + ' thigh' : f === 'back' ? 'Back of ' + s + ' thigh' : (outer ? 'Outer ' : 'Inner ') + s + ' thigh', 'legs');
      case 'calf':
        if (y < 325) return name(f === 'back' ? 'Back of ' + s + ' knee' : f === 'side' ? (outer ? 'Outer ' : 'Inner ') + s + ' knee' : S + ' kneecap', 'legs');
        if (y > 405) return name(f === 'side' ? (outer ? 'Outer ' : 'Inner ') + s + ' ankle' : f === 'back' ? S + ' Achilles' : 'Front of ' + s + ' ankle', 'legs');
        return name(f === 'front' ? S + ' shin' : f === 'back' ? S + ' calf' : (outer ? 'Outer ' : 'Inner ') + s + ' lower leg', 'legs');
      case 'foot':
        if (n[1] > 0.6) return name('Sole of ' + s + ' foot', 'legs');
        if (z < 0) return name(S + ' heel', 'legs');
        if (y < 412) return name(f === 'side' ? (outer ? 'Outer ' : 'Inner ') + s + ' ankle' : f === 'back' ? S + ' Achilles' : 'Front of ' + s + ' ankle', 'legs');
        return name('Top of ' + s + ' foot', 'legs');
      case 'toe1': return name(S + ' big toe', 'legs');
      case 'toe2': return name(S + ' second toe', 'legs');
      case 'toe3': return name(S + ' third toe', 'legs');
      case 'toe4': return name(S + ' fourth toe', 'legs');
      case 'toe5': return name(S + ' little toe', 'legs');
    }
    return name('Body', 'torso');
  }
  return { setMesh, toScreen, viewDir, cast, classify, ready: () => !!P };
}
