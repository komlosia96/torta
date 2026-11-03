// Wax number candles (one per digit, e.g. "26"): solid digits with an ivory face and a warm orange wax rim,
// real flames, candlelight and smoke. The digit outlines come from the page's rounded font (Quicksand Bold),
// so every digit 0 to 9 works. Call after that font has loaded (a system font is used otherwise).
import * as THREE from "./vendor/three.module.min.js";
import { TOP } from "./cake.js";

// Z: just in front of the cake's centre, so no strawberry stands between the candles and the viewer.
// HEIGHT is the digit height; the glyph is drawn a little narrower than the font so the candles stand tall.
// They stand on the cream (SINK only hides the seam), not pushed into the cake.
const HEIGHT = 8, WIDTH_SCALE = 0.84, DEPTH = 1.0, BEVEL_T = 0.12, BEVEL_S = 0.15, SINK = 0.03, GAP = 0.35, Z = 0.5;

// Outline loops of an alpha mask at the 50% level (marching squares with sub-pixel edge points).
function traceLoops(a, W, H) {
  const pts = new Map(), adj = new Map(), v = (x, y) => a[y * W + x];
  const at = (key, x0, y0, x1, y1) => {
    if (!pts.has(key)) { const t = (0.5 - v(x0, y0)) / (v(x1, y1) - v(x0, y0)); pts.set(key, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
    return key;
  };
  const link = (p, q) => { for (const [s, e] of [[p, q], [q, p]]) { if (!adj.has(s)) adj.set(s, []); adj.get(s).push(e); } };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const c = (v(x, y) >= 0.5) * 8 + (v(x + 1, y) >= 0.5) * 4 + (v(x + 1, y + 1) >= 0.5) * 2 + (v(x, y + 1) >= 0.5);
    if (c === 0 || c === 15) continue;
    const T = () => at((y * W + x) * 2, x, y, x + 1, y), B = () => at(((y + 1) * W + x) * 2, x, y + 1, x + 1, y + 1);
    const L = () => at((y * W + x) * 2 + 1, x, y, x, y + 1), R = () => at((y * W + x + 1) * 2 + 1, x + 1, y, x + 1, y + 1);
    const mid = v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1) >= 2;
    if (c === 1 || c === 14) link(L(), B());
    else if (c === 2 || c === 13) link(B(), R());
    else if (c === 3 || c === 12) link(L(), R());
    else if (c === 4 || c === 11) link(T(), R());
    else if (c === 6 || c === 9) link(T(), B());
    else if (c === 7 || c === 8) link(L(), T());
    else if ((c === 5) === mid) { link(L(), T()); link(B(), R()); }
    else { link(T(), R()); link(L(), B()); }
  }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const n = adj.get(cur);
      [prev, cur] = [cur, n[0] !== prev ? n[0] : n[1]];
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

// Douglas-Peucker on a closed loop.
function simplify(loop, tol) {
  const out = [loop[0]], pts = [...loop, loop[0]];
  const dp = (a, b) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len; if (d > max) { max = d; idx = i; } }
    if (max > tol) { dp(a, idx); out.push(pts[idx]); dp(idx, b); }
  };
  let far = 0, fd = 0;
  loop.forEach((p, i) => { const d = Math.hypot(p[0] - loop[0][0], p[1] - loop[0][1]); if (d > fd) { fd = d; far = i; } });
  dp(0, far); out.push(loop[far]); dp(far, loop.length);
  return out;
}

const inside = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

// One digit as shapes in cm: standing on y = 0, centred on x = 0, HEIGHT tall, WIDTH_SCALE narrower.
function digitShapes(ch) {
  const S = 400, W = 380, Hc = 460, cv = document.createElement("canvas");
  cv.width = W; cv.height = Hc;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.font = `700 ${S}px Quicksand, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = S * 0.03; // a touch bolder, like a real number candle
  ctx.fillText(ch, W / 2, Hc - 80);
  ctx.strokeText(ch, W / 2, Hc - 80);
  const d = ctx.getImageData(0, 0, W, Hc).data, a = new Float32Array(W * Hc);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  const raw = traceLoops(a, W, Hc).map(l => simplify(l, 0.35));
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const l of raw) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = HEIGHT / (y1 - y0), sx = s * WIDTH_SCALE, cx = (x0 + x1) / 2;
  const loops = raw.map(l => l.map(([x, y]) => new THREE.Vector2((x - cx) * sx, (y1 - y) * s)));
  // Even nesting depth: an outline; odd: a hole in the outline around it.
  const depth = loops.map((l, i) => loops.filter((m, j) => j !== i && inside(l[0], m)).length);
  const outer = loops.filter((l, i) => depth[i] % 2 === 0).map(l => ({ l, shape: new THREE.Shape(l) }));
  loops.forEach((l, i) => { if (depth[i] % 2) { const host = outer.find(o => inside(l[0], o.l)); if (host) host.shape.holes.push(new THREE.Path(l)); } });
  // Wick on the top of the digit
  const top = Math.max(...outer.flatMap(o => o.l.map(p => p.y))), crown = outer.flatMap(o => o.l.filter(p => p.y > top - 0.04));
  return { shapes: outer.map(o => o.shape), width: (x1 - x0) * sx, wickX: crown.reduce((t, p) => t + p.x, 0) / crown.length };
}

// Smooth the shading of the rim (sides and bevel) while the faces stay flat.
function smoothRim(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, grp = g.groups.find(x => x.materialIndex === 1);
  if (!grp) return;
  const map = new Map(), n = new THREE.Vector3(), m = new THREE.Vector3(), sum = new THREE.Vector3();
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  const out = new Float32Array(nor.array);
  for (const ids of map.values()) for (const i of ids) {
    n.fromBufferAttribute(nor, i);
    sum.set(0, 0, 0);
    for (const j of ids) { m.fromBufferAttribute(nor, j); if (n.dot(m) > 0.5) sum.add(m); }
    sum.normalize();
    out[i * 3] = sum.x; out[i * 3 + 1] = sum.y; out[i * 3 + 2] = sum.z;
  }
  nor.array.set(out);
  nor.needsUpdate = true;
}

export function buildCandles(number, tex) {
  const digits = String(number).replace(/\D/g, "").split("").slice(0, 3);
  // Wax: the face is ivory, the rim a warm orange; a faint emissive stands in for light glowing through wax.
  const face = new THREE.MeshPhysicalMaterial({ color: 0xf6ebd8, roughness: 0.42, sheen: 0.4, sheenRoughness: 0.6, sheenColor: 0xfff1dc, emissive: 0x4a2c12, emissiveIntensity: 0.18 });
  const rim = new THREE.MeshPhysicalMaterial({ color: 0xdc8540, roughness: 0.4, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0xffd2a0, emissive: 0x4a1f08, emissiveIntensity: 0.15 });
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9 });
  const group = new THREE.Group(), glyphs = digits.map(digitShapes);
  const total = glyphs.reduce((t, g) => t + g.width + 2 * BEVEL_S, 0) + GAP * (glyphs.length - 1);
  let left = -total / 2;
  const candles = glyphs.map((gl, i) => {
    const geo = new THREE.ExtrudeGeometry(gl.shapes, { depth: DEPTH - 2 * BEVEL_T, bevelEnabled: true, bevelThickness: BEVEL_T, bevelSize: BEVEL_S, bevelSegments: 3, curveSegments: 1 });
    geo.translate(0, 0, -DEPTH / 2 + BEVEL_T);
    smoothRim(geo);
    const body = new THREE.Mesh(geo, [face, rim]);
    body.castShadow = body.receiveShadow = true;
    const g = new THREE.Group(), x = left + BEVEL_S + gl.width / 2;
    left += gl.width + 2 * BEVEL_S + GAP;
    g.add(body);
    g.position.set(x, TOP - SINK, Z);
    g.rotation.y = (i % 2 ? -1 : 1) * 0.06;
    group.add(g);
    const wickBase = new THREE.Vector3(gl.wickX, HEIGHT - 0.12, 0);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.75, 8).translate(0, 0.37, 0), wickMat);
    wick.position.copy(wickBase);
    wick.rotation.z = 0.12;
    g.add(wick);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flame, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.32 }));
    const light = new THREE.PointLight(0xffa458, 0, 0, 2);
    g.add(flame, glow, light);
    const base = wickBase.clone().add(new THREE.Vector3(0.05, 0.7, 0));
    flame.position.copy(base).add(new THREE.Vector3(0, 0.95, 0));
    glow.position.copy(base).add(new THREE.Vector3(0, 0.9, 0));
    glow.scale.setScalar(7);
    light.position.copy(base).add(new THREE.Vector3(0, 1.0, 0));
    g.traverse(o => (o.userData.candle = i)); // tap picking
    return { group: g, flame, glow, light, base, lit: true, out: 0, smoke: [], ph: [Math.random() * 9, Math.random() * 9, Math.random() * 9], dir: x < 0 ? -1 : 1 };
  });

  const smokeMat = new THREE.SpriteMaterial({ map: tex.smoke, transparent: true, depthWrite: false, opacity: 0 });
  let level = 0, flameI = 380;

  function puff(c) {
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.position.copy(c.base).add(new THREE.Vector3(0, 0.5, 0));
      c.group.add(s);
      c.smoke.push({ s, t: -i * 0.07, dx: (Math.random() - 0.5) * 1.6, life: 1.4 + Math.random() * 0.6 });
    }
  }

  return {
    group, candles,
    get anyLit() { return candles.some(c => c.lit); },
    get busy() { return candles.some(c => c.smoke.length || (!c.lit && c.out < 1)); },
    setLevel(l) { level = l; },
    setFlameIntensity(v) { flameI = v; },
    extinguish(i) {
      const c = candles[i];
      if (!c || !c.lit) return false;
      c.lit = false;
      c.out = 0;
      puff(c);
      return true;
    },
    relight() {
      for (const c of candles) {
        c.lit = true; c.out = 0;
        c.smoke.forEach(p => c.group.remove(p.s));
        c.smoke = [];
      }
    },
    update(time, dt) {
      for (const c of candles) {
        const [a, b, e] = c.ph, f = 1 + 0.07 * Math.sin(13 * time + a) + 0.05 * Math.sin(23 * time + b) + 0.03 * Math.sin(41 * time + e);
        if (!c.lit) c.out = Math.min(1, c.out + dt / 0.22);
        const k = c.lit ? 1 : 1 - c.out, lean = c.dir * level * 0.7 + 0.04 * Math.sin(7 * time + a);
        c.flame.scale.set(0.9 * (1 + (f - 1) * 0.6) * k, 2.1 * f * (1 - level * 0.35) * k, 1);
        c.flame.material.rotation = -lean;
        c.flame.position.set(c.base.x + Math.sin(lean) * 0.9, c.base.y + 0.95 * Math.cos(lean) * (1 - level * 0.3), c.base.z);
        c.glow.material.opacity = 0.32 * f * k;
        c.light.intensity = flameI * (0.85 + 0.15 * f) * k * (1 - level * 0.4);
        for (let i = c.smoke.length - 1; i >= 0; i--) {
          const p = c.smoke[i];
          p.t += dt;
          const u = p.t / p.life;
          if (u >= 1) { c.group.remove(p.s); c.smoke.splice(i, 1); continue; }
          if (u < 0) continue;
          p.s.position.set(c.base.x + p.dx * u + Math.sin(u * 6 + i) * 0.3, c.base.y + 0.5 + 5.5 * u, c.base.z);
          p.s.scale.setScalar(0.5 + 2.6 * u);
          p.s.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
        }
      }
    },
  };
}
