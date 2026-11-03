// Whipped-cream cake with strawberries on top and a piped cream border at the base, built from 8 removable slices (units: cm).
// It stands on the cake stand in world.js, whose plate top is at Y0.
import * as THREE from "./vendor/three.module.min.js";
import { rng } from "./unicorn.js";

export const R = 12.5, H = 15, Y0 = 5.84, TOP = Y0 + H; // a tall, wide layer cake, so it fills more of a phone screen
export const S = R / 11; // the stand and the strawberry layout were designed for R = 11 and scale with the cake
const E = 0.9, SLICES = 8; // E: radius of the softly rounded top edge
const D = Math.PI / 180;
export const sliceStart = k => (22.5 + 45 * k) * D; // slice k covers [start, start + 45 deg]
export const sliceMid = k => (45 + 45 * k) * D;
export const radial = a => new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
const sliceOf = (x, z) => Math.floor((((Math.atan2(z, x) / D - 22.5) % 360) + 360) % 360 / 45) % SLICES;

function geometry(pos, uv, idx, nor) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (nor) g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  else g.computeVertexNormals();
  return g;
}

// Flat top (or bottom) of one slice; UVs are planar so the cream texture runs on across slices.
function topSector(a0, a1, y, up = true, r = R - E) {
  const n = 24, pos = [0, y, 0], uv = [0.5, 0.5], nor = [0, up ? 1 : -1, 0], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, x = r * Math.cos(a), z = r * Math.sin(a);
    pos.push(x, y, z); uv.push(x / (2 * R) + 0.5, z / (2 * R) + 0.5); nor.push(0, up ? 1 : -1, 0);
    if (i) up ? idx.push(0, i + 1, i) : idx.push(0, i, i + 1);
  }
  return geometry(pos, uv, idx, nor);
}
// Side of one slice, rounding over into the top.
function sideSector(a0, a1) {
  const n = 24, m = 6, q = 5, rows = m + q + 1, pos = [], uv = [], nor = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < rows; j++) {
      let r = R, y = Y0 + ((H - E) * j) / m, nr = 1, ny = 0;
      if (j > m) {
        const th = ((j - m) / q) * (Math.PI / 2);
        r = R - E + E * Math.cos(th); y = TOP - E + E * Math.sin(th); nr = Math.cos(th); ny = Math.sin(th);
      }
      pos.push(r * c, y, r * s); nor.push(nr * c, ny, nr * s); uv.push((a * R) / 14, (y - Y0) / 7);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < rows - 1; j++) {
    const v = i * rows + j;
    idx.push(v, v + 1, v + rows, v + rows, v + 1, v + rows + 1);
  }
  return geometry(pos, uv, idx, nor);
}
// Cut face along angle a, following the rounded top edge (u: centre to rim, v: bottom to top).
function cutFace(a) {
  const c = Math.cos(a), s = Math.sin(a), prof = [[0, Y0], [R, Y0], [R, TOP - E]], pos = [], uv = [], idx = [];
  for (let j = 1; j <= 5; j++) { const th = (j / 5) * (Math.PI / 2); prof.push([R - E + E * Math.cos(th), TOP - E + E * Math.sin(th)]); }
  prof.push([0, TOP]);
  prof.forEach(([r, y]) => { pos.push(r * c, y, r * s); uv.push(r / R, (y - Y0) / H); });
  for (let i = 1; i < prof.length - 1; i++) idx.push(0, i, i + 1);
  return geometry(pos, uv, idx);
}

// Piped shell border of cream around the base of the cake, resting on the plate.
const SHELLS = 44, RB = R + 0.3, RHO = 0.95;
function basePoint(phi, v, out) {
  const s = Math.abs(Math.sin((SHELLS * phi) / 2)), shell = 0.68 + 0.32 * Math.pow(s, 0.6);
  const rho = RHO * shell * (1 + 0.08 * Math.cos(9 * v + SHELLS * phi * 2));
  const y = Math.max(Y0 + rho * 0.72 + rho * 0.82 * Math.sin(v), Y0 + 0.02), rr = RB + rho * Math.cos(v);
  return out.set(rr * Math.cos(phi), y, rr * Math.sin(phi));
}
function baseBorder(a0, a1) {
  const n = 96, m = 20, pos = [], uv = [], idx = [], p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    basePoint(a0 + ((a1 - a0) * i) / n, (j / m) * Math.PI * 2, p);
    pos.push(p.x, p.y, p.z); uv.push(i / n, j / m);
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const v = i * (m + 1) + j;
    idx.push(v, v + 1, v + m + 1, v + m + 1, v + 1, v + m + 2);
  }
  return geometry(pos, uv, idx);
}

// Strawberry profile: rounded tip at t=0, widest near the shoulders, closed at the calyx (t=1).
const prof = t => (t < 0.76 ? Math.pow(Math.sin(((Math.PI / 2) * t) / 0.76), 0.72) : Math.sqrt(Math.max(0, 1 - ((t - 0.76) / 0.24) ** 2)) * 0.88 + 0.12 * (1 - (t - 0.76) / 0.24));
const W = 0.8; // width / length
function berryProfile(tMax = 1, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = tMax * (1 - Math.cos((Math.PI * i) / n)) / 2; pts.push(new THREE.Vector2(Math.max(1e-3, prof(t) * W * 0.5), t)); }
  return pts;
}
function lumpy(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const f = 1 + 0.035 * Math.sin(3 * a + y * 5) + 0.025 * Math.sin(5 * a - y * 7);
    p.setXYZ(i, x * f, y, z * f * 0.94);
  }
  g.computeVertexNormals();
  return g;
}
// Calyx: drooping sepals hugging the shoulders, merged into one geometry.
function calyxGeometry(seed) {
  const r = rng(seed), pos = [], uv = [], idx = [], N = 7, steps = 8;
  for (let k = 0; k < N; k++) {
    const rot = (k / N) * Math.PI * 2 + (r() - 0.5) * 0.4, len = 0.4 + r() * 0.1, wid = 0.1 + r() * 0.03, droop = 0.3 + r() * 0.08;
    const base = pos.length / 3, c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, half = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)), 0.7) * Math.pow(1 - t, 0.25);
      for (const side of [-1, 0, 1]) {
        const lx = 0.03 + t * len, ly = 1.0 + 0.06 * t - droop * t * t + (side ? 0.012 : 0.02), lz = side * half;
        pos.push(lx * c - lz * s, ly, lx * s + lz * c);
        uv.push(0.5 + side * 0.5, t);
      }
    }
    for (let i = 0; i < steps; i++) for (let j = 0; j < 2; j++) {
      const v = base + i * 3 + j;
      idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4);
    }
  }
  return geometry(pos, uv, idx);
}

// Berry parts in berry space: tip at the origin, the calyx end up (+y), length 1.
export function berryParts() {
  const body = lumpy(new THREE.LatheGeometry(berryProfile(), 32));
  const calyx = [calyxGeometry(3), calyxGeometry(7), calyxGeometry(11)];
  const stem = new THREE.CylinderGeometry(0.018, 0.026, 0.16, 6).translate(0, 1.06, 0);
  return { body, calyx, stem };
}

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.42); s.bezierCurveTo(-0.55, -0.05, -0.5, 0.42, 0, 0.2); s.bezierCurveTo(0.5, 0.42, 0.55, -0.05, 0, -0.42);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function makeMaterials(T, tex) {
  // Whipped cream scatters light inside itself, so shaded parts never go grey: a faint warm emissive fakes that.
  const glowOf = new THREE.Color(0x7a6a58);
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xfdfaf3, emissive: glowOf, emissiveIntensity: 0.48, roughness: 0.6, sheen: 0.6, sheenRoughness: 0.75, sheenColor: 0xffffff, normalMap: tex.creamTop, normalScale: new THREE.Vector2(0.14, 0.14) });
  tex.creamTop.repeat.set(2.2, 2.2);
  const creamSide = cream.clone();
  creamSide.normalMap = tex.creamSide;
  creamSide.normalScale = new THREE.Vector2(0.09, 0.09);
  return {
    cream, creamSide,
    piping: new THREE.MeshPhysicalMaterial({ color: 0xfdfaf3, emissive: glowOf, emissiveIntensity: 0.42, roughness: 0.55, sheen: 0.7, sheenRoughness: 0.6, sheenColor: 0xffffff, side: THREE.DoubleSide }),
    inside: new THREE.MeshStandardMaterial({ map: tex.sponge, roughness: 0.88, side: THREE.DoubleSide }),
    berry: new THREE.MeshPhysicalMaterial({ map: tex.skin, normalMap: tex.skinN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.28 }),
    leaf: new THREE.MeshStandardMaterial({ map: tex.leaf, roughness: 0.5, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe2b766, metalness: 0.9, roughness: 0.25 }),
  };
}

// One slice: everything in cake coordinates inside `inner`, the outer group pivots on the slice centre.
function buildSlice(k, M) {
  const a0 = sliceStart(k), a1 = a0 + Math.PI / 4, mid = sliceMid(k), inner = new THREE.Group();
  const add = (g, m) => { const o = new THREE.Mesh(g, m); inner.add(o); return o; };
  add(topSector(a0, a1, TOP), M.cream);
  add(sideSector(a0, a1), M.creamSide);
  add(cutFace(a0), M.inside);
  add(cutFace(a1), M.inside);
  add(topSector(a0, a1, Y0 + 0.01, false, R), M.inside);
  add(baseBorder(a0, a1), M.piping);
  // Small gold heart on the bare cream near the rim, shown once the slice was read.
  const heart = add(heartGeometry(), M.gold);
  heart.position.copy(radial(mid).multiplyScalar(R - 1.7)).setY(TOP + 0.02);
  heart.rotation.y = -mid - Math.PI / 2;
  heart.visible = false;
  const pivot = radial(mid).multiplyScalar(R * 0.6).setY((Y0 + TOP) / 2);
  const group = new THREE.Group();
  group.position.copy(pivot);
  inner.position.copy(pivot).negate();
  group.add(inner);
  // pivot: where the slice rests (moves out a little once the cake is "cut", see world.setCut); pivot0: whole cake.
  group.userData = { k, pivot, pivot0: pivot.clone(), heart, inner, mid, berries: [] };
  group.traverse(o => { o.userData.k = k; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// Whole strawberries (calyx up, leaning back or outward) heaped behind and beside the number candles,
// which stand just in front of the centre (candles.js). Nothing stands in front of the candles, so they
// are seen whole; the front of the top stays bare cream.
// [x, z, length, lean toward x, z, lean degrees, lift]  (x, z: where the tip touches down)
const MOUND = [
  [-5.8, -4.6, 4.3, -0.35, -1, 42, 0],
  [-2.2, -6.0, 4.5, -0.1, -1, 38, 0],
  [1.6, -6.2, 4.4, 0.15, -1, 40, 0],
  [5.4, -5.0, 4.2, 0.4, -1, 44, 0],
  [-3.6, -2.6, 4.1, -0.2, -1, 30, 0],
  [0.2, -3.0, 4.2, 0.05, -1, 26, 0],
  [3.8, -2.6, 4.1, 0.25, -1, 30, 0],
  [-4.9, -4.3, 3.9, -0.3, -1, 24, 1.1],
  [4.6, -4.4, 3.9, 0.3, -1, 26, 1.1],
  [-5.6, 0.1, 4.1, -1, -0.3, 38, 0],
  [5.7, 0.3, 4.2, 1, -0.25, 40, 0],
  [-5.0, 3.3, 4.0, -1, 0, 45, 0],
  [5.1, 3.5, 4.0, 1, 0.05, 45, 0],
];
function buildMound(M, parts) {
  const r = rng(77), up = new THREE.Vector3(0, 1, 0), box = new THREE.Box3(), c = new THREE.Vector3();
  return MOUND.map(([x0, z0, L, dx, dz, lean, lift], i) => {
    const x = x0 * S, z = z0 * S;
    const b = new THREE.Group(), dir = new THREE.Vector3(dx, 0, dz).normalize(), tilt = lean * D;
    b.add(new THREE.Mesh(parts.body, M.berry), new THREE.Mesh(parts.calyx[i % 3], M.leaf), new THREE.Mesh(parts.stem, M.leaf));
    b.scale.set(L * (0.95 + r() * 0.1), L, L * (0.95 + r() * 0.1));
    const axis = up.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(dir, Math.sin(tilt));
    b.quaternion.setFromUnitVectors(up, axis).multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI * 2));
    // Rest the lowest point slightly sunk into the cream (or on the berries below when lifted).
    b.updateMatrixWorld(true);
    box.setFromObject(b, true);
    b.position.set(x, TOP - 0.3 + lift - box.min.y, z);
    box.getCenter(c);
    b.userData.s0 = b.scale.clone();
    return { b, k: sliceOf(x + c.x, z + c.z) };
  });
}

// Cake topper: a small card on a wooden pick stuck in the cream left of the candles, slightly turned and tilted.
// It belongs to the slice it stands on and steps aside with that slice's berries while its message is read.
const TOPPER_AT = [-8.6, 4.2], CARD_W = 6.6, CARD_H = 3.3, PICK = 4.6;
export function addTopper(slices, map) {
  const [x, z] = TOPPER_AT, k = sliceOf(x, z), t = new THREE.Group();
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, PICK + CARD_H * 0.6 + 0.8, 10), new THREE.MeshStandardMaterial({ color: 0xd8b385, roughness: 0.75 }));
  pick.position.set(0, (PICK + CARD_H * 0.6 - 0.8) / 2, -0.06);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x3a3026, emissiveMap: map, emissiveIntensity: 0.35 }));
  card.position.set(0, PICK + CARD_H / 2, 0);
  card.rotation.z = 0.07;
  t.add(pick, card);
  t.position.set(x, TOP - 0.05, z);
  t.rotation.y = 0.18;
  t.userData.s0 = t.scale.clone();
  t.traverse(o => { o.userData.k = k; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  slices[k].userData.inner.add(t);
  slices[k].userData.berries.push(t);
  return card;
}

export function buildCake(T, M) {
  const parts = berryParts();
  const slices = Array.from({ length: SLICES }, (_, k) => buildSlice(k, M));
  // Each berry belongs to the slice it sits on and comes out with it.
  for (const { b, k } of buildMound(M, parts)) {
    slices[k].userData.inner.add(b);
    slices[k].userData.berries.push(b);
    b.traverse(o => { o.userData.k = k; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  const group = new THREE.Group();
  slices.forEach(s => group.add(s));
  return { group, slices };
}
