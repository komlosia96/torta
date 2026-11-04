// The 3D scene: renderer, photographic framing, lighting, the table that ends behind the cake, the cake stand,
// cake, candles, album, plush placement, tap picking and pulling a slice out of the cake to read it (units: cm).
import * as THREE from "./vendor/three.module.min.js";
import * as TX from "./tex.js";
import { buildCake, addTopper, makeMaterials, R, S, Y0, TOP, radial } from "./cake.js";
import { buildCandles } from "./candles.js";
import { createUnicorn } from "./unicorn.js";

const DEG = Math.PI / 180, Y = new THREE.Vector3(0, 1, 0);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
// As in the reference photo: the closed album lies on the table left of the cake stand, the plush sits on the right.
// Both sit in front of the stand, to the left and right, so they overlap the cake's sides on screen: the
// group stays narrow and the camera can come close, making the cake large on a phone. The plush may cover
// a little of the cake's right side (author request); the album's back corner slides under the plate's rim.
const PLUSH_AT = new THREE.Vector3(11, 0, 19.5), PLUSH_H = 18;
const BOOK_AT = new THREE.Vector3(-13.5, 0, 20.5), BOOK_YAW = 0.32, BOOK = [15, 3, 20];
// The table top ends this far behind the cake (turned a little); the warm bokeh backdrop shows beyond its edge.
const TABLE_BACK = 52, TABLE_YAW = -0.04;
const ELEV = 18 * DEG, FOV = 28;
// Only the middle slice facing the viewer can be opened (author request); it carries the message.
// Outside this file a slice is always addressed by its message index (0), never by its cake index.
const FRONT = [1];

// Small room in the scene's palette used only to light reflections (image based lighting).
function envScene() {
  const s = new THREE.Scene(), box = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 12), new THREE.MeshBasicMaterial({ color: 0x3a3470, side: THREE.BackSide }));
  box.position.y = 2.5;
  s.add(box);
  const panel = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 1, 0);
    s.add(m);
  };
  panel(4, 3, 0xfff0dc, 6, [-5.8, 3.2, 3]);
  panel(4, 2, 0xffffff, 3, [0, 5.9, 0]);
  panel(10, 3.2, 0xff8a78, 2.2, [0, 1.9, -5.9]); // the glowing coral backdrop behind the table
  panel(3, 1.5, 0xfff0e0, 2, [0, 2.5, 5.9]);
  return s;
}

function decal(tex, size, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

// White glazed ceramic cake stand: foot, short stem and a plate with a low rim; the cake sits at Y0.
function standGeometry() {
  // Radii were drawn for an 11 cm cake; S widens the stand with the cake (heights stay).
  const p = [[0, 0], [6, 0], [6.3, 0.22], [6.25, 0.6], [5.6, 1.05], [3.6, 1.5], [2.6, 2.2], [2.35, 3], [2.6, 3.7], [3.6, 4.35], [8, 4.85], [13.3, 5.2], [14.05, 5.42], [14.3, 5.72], [14.15, 6.02], [13.7, 6.1], [13.15, 5.92], [12, Y0 - 0.02], [0, Y0 - 0.02]];
  return new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x * S, y)), 128);
}

export async function createWorld(o) {
  const { stage, ov, ui, messages, reduced, lowEnd } = o;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return null;
  }
  // The candle digits are traced from the page font: wait for it (briefly), and let the page paint first.
  await Promise.race([Promise.all([document.fonts.load('700 100px "Quicksand"', "0123456789"), o.topper && document.fonts.load('700 100px "Caveat"', o.topper)]).catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
  await new Promise(r => setTimeout(r, 0));

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = "gl";
  stage.appendChild(canvas);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 4, 900);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene(), 0.04).texture;
  // A lost WebGL context (memory pressure on phones, a backgrounded tab, a GPU reset) blanks every 3D object
  // while the DOM unicorn stays. three.js reconnects by itself once the browser restores the context, but the
  // reflection map exists only on the GPU, so rebuild it, and draw again (nothing renders on its own here).
  canvas.addEventListener("webglcontextrestored", () => {
    const old = scene.environment, gen = new THREE.PMREMGenerator(renderer);
    scene.environment = gen.fromScene(envScene(), 0.04).texture;
    gen.dispose();
    if (old) old.dispose();
    invalidate();
  });

  const tex = {
    creamTop: TX.creamTop(), creamSide: TX.creamSide(), sponge: TX.sponge(), leaf: TX.leafTex(),
    wood: TX.darkWood(), flame: TX.flameTex(), glow: TX.glowTex(), smoke: TX.smokeTex(), shadow: TX.shadowTex(), ring: TX.shadowTex(true),
    leather: TX.leather(), leatherCover: TX.leather({ title: o.albumTitle, cover: true }), pages: TX.pageEdges(),
  };
  [tex.skin, tex.skinN] = TX.berrySkin();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  Object.values(tex).forEach(t => (t.anisotropy = aniso));

  // Lights: a warm key light from the upper left with soft shadows, warm bounce, a rim, and the flames themselves.
  const hemi = new THREE.HemisphereLight(0xfff1e0, 0x5a3b26, 0.4);
  const key = new THREE.DirectionalLight(0xfff0dc, 2);
  key.position.set(-40, 75, 55);
  key.target.position.set(0, 6, 3);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 30, far: 230 });
  key.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight(0xffd2a0, 0.6);
  rim.position.set(45, 40, -60);
  scene.add(hemi, key, key.target, rim);
  [hemi, key, rim].forEach(l => l.layers.enableAll());

  // Warm cherry wood table. Its back edge (a rounded nosing) runs behind the cake; beyond it is the backdrop.
  const table = new THREE.Group();
  tex.wood.repeat.set(420 / 120, 300 / 30);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(420, 300), new THREE.MeshPhysicalMaterial({ map: tex.wood, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  top.material.userData.env = 0.6; // softer reflections so the indigo room does not grey the wood
  top.rotation.x = -Math.PI / 2;
  top.position.z = -TABLE_BACK + 150;
  top.receiveShadow = true;
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 420, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x5a2418, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  nose.rotation.z = Math.PI / 2;
  nose.position.set(0, -1.6, -TABLE_BACK);
  table.add(top, nose);
  table.rotation.y = TABLE_YAW;
  scene.add(table);

  // Cake stand with soft contact shadows under its foot and around the base of the cake.
  const stand = new THREE.Mesh(standGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xf4f1ec, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  stand.castShadow = stand.receiveShadow = true;
  scene.add(stand, decal(tex.ring, 28 * S, Y0 - 0.01), decal(tex.shadow, 18 * S, 0.03));

  // Cake and number candles
  const M = makeMaterials(THREE, tex), cake = buildCake(THREE, M), C = buildCandles(o.number, tex);
  const topper = o.topper ? addTopper(cake.slices, TX.signTex(o.topper)) : null;
  scene.add(cake.group, C.group);

  // Closed leather photo album lying on the table: stitched cover, rounded spine with raised bands, page block.
  const book = new THREE.Group();
  {
    const [w, h, d] = BOOK, ct = 0.32;
    const lea = new THREE.MeshStandardMaterial({ map: tex.leather, roughness: 0.6 });
    const cover = new THREE.MeshStandardMaterial({ map: tex.leatherCover, roughness: 0.55 });
    tex.pages.repeat.set(5, 1);
    const coverTop = new THREE.Mesh(new THREE.BoxGeometry(w, ct, d), [lea, lea, cover, lea, lea, lea]);
    coverTop.position.y = h - ct / 2;
    const coverBot = new THREE.Mesh(new THREE.BoxGeometry(w, ct, d), lea);
    coverBot.position.y = ct / 2;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.7, h - 2 * ct, d - 0.6), new THREE.MeshStandardMaterial({ map: tex.pages, roughness: 0.85 }));
    pages.position.set(0.2, h / 2, 0);
    const spineGeo = new THREE.CylinderGeometry(h / 2, h / 2, d, 24).rotateX(Math.PI / 2).scale(0.42, 1, 1);
    const spine = new THREE.Mesh(spineGeo, lea);
    spine.position.set(-w / 2 + 0.2, h / 2, 0);
    book.add(coverTop, coverBot, pages, spine);
    for (const f of [-0.33, -0.11, 0.11, 0.33]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(h / 2 + 0.12, h / 2 + 0.12, 0.5, 24).rotateX(Math.PI / 2).scale(0.42, 1, 1), lea);
      band.position.set(-w / 2 + 0.2, h / 2, f * d);
      book.add(band);
    }
    book.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    book.position.copy(BOOK_AT);
    book.rotation.y = BOOK_YAW;
    const shade = decal(tex.shadow, 30, 0.03);
    shade.scale.set(0.66, 0.86, 1);
    shade.position.set(BOOK_AT.x, 0.03, BOOK_AT.z);
    shade.rotation.z = BOOK_YAW;
    scene.add(book, shade);
  }

  // Plush: a DOM layer standing on the table, grounded by a soft contact shadow.
  const plushShadow = decal(tex.shadow, 16, 0.04);
  plushShadow.position.set(PLUSH_AT.x, 0.04, PLUSH_AT.z);
  plushShadow.scale.set(1.2, 0.8, 1);
  scene.add(plushShadow);
  const plushHost = document.createElement("div");
  plushHost.className = "uni-host";
  ov.appendChild(plushHost);
  const unicorn = createUnicorn(plushHost, { label: ui.unicornAria, onTap: o.onUnicornTap, seat: [100, 136], frame: [200, 150], shirt: o.shirt });

  // DOM hit targets over 3D objects (real buttons for screen readers and keyboards)
  const albumBtn = document.createElement("button");
  albumBtn.type = "button";
  albumBtn.className = "ov-btn album-hit";
  albumBtn.setAttribute("aria-label", ui.albumAria);
  ov.appendChild(albumBtn);
  const candleBtns = C.candles.map((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ov-btn candle-hit";
    b.setAttribute("aria-label", ui.candleAria.replace("{n}", i + 1));
    b.innerHTML = `<i class="ring"></i>`;
    b.addEventListener("click", () => o.onCandleTap(i));
    ov.appendChild(b);
    return b;
  });
  const sliceList = document.createElement("div");
  sliceList.className = "sr-only";
  sliceList.innerHTML = FRONT.map((k, i) => `<button type="button">${ui.sliceAria.replace("{n}", i + 1)}</button>`).join("");
  [...sliceList.children].forEach((b, i) => b.addEventListener("click", () => o.onSliceTap(i)));
  ov.appendChild(sliceList);

  // Dark veil drawn inside WebGL while a slice is being read
  const scrimScene = new THREE.Scene(), scrimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scrim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x0c0c28, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  scrimScene.add(scrim);
  let scrimA = 0;

  // ---- framing ----
  const v3 = new THREE.Vector3();
  const toScreen = p => { v3.copy(p).project(camera); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight]; };
  function screenRect(obj, meshesOnly = false) {
    const b = new THREE.Box3(), xs = [], ys = [];
    if (meshesOnly) obj.traverse(m => { if (m.isMesh) b.expandByObject(m); }); else b.setFromObject(obj);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const [sx, sy] = toScreen(new THREE.Vector3(x, y, z)); xs.push(sx); ys.push(sy);
    }
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  scene.updateMatrixWorld(true);
  // The cake (stand rim and foot, flame tips) frames the shot; album and plush may crop at the sides on phones.
  const cakePts = [], sidePts = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    cakePts.push(new THREE.Vector3(14.3 * S * c, 5.9, 14.3 * S * s), new THREE.Vector3(6.3 * S * c, 0, 6.3 * S * s));
  }
  C.candles.forEach(c => cakePts.push(c.group.localToWorld(c.base.clone().add(new THREE.Vector3(0, 2.6, 0)))));
  if (topper) { const b = new THREE.Box3().setFromObject(topper); cakePts.push(b.min.clone(), b.max.clone()); }
  { const b = new THREE.Box3().setFromObject(book); for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) sidePts.push(new THREE.Vector3(x, y, z)); }
  // The plush image is mirrored: from about 0.45 x its height left of the seat to the tail tip about 0.8 x right.
  sidePts.push(PLUSH_AT.clone().add(new THREE.Vector3(-0.45 * PLUSH_H, 0, 0)), PLUSH_AT.clone().add(new THREE.Vector3(0.8 * PLUSH_H, 0, 0)), PLUSH_AT.clone().add(new THREE.Vector3(0, PLUSH_H + 1, 0)));

  function fit() {
    const w = innerWidth, h = innerHeight, portrait = h >= w;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Screen fractions from the top: the lowest point of the group (the album's front corner) rests at `bottom`,
    // nothing rises above `top`.
    const topLim = portrait ? 0.26 : 0.3, bottom = portrait ? 0.8 : 0.83;
    const target = new THREE.Vector3(0, 10, 2), dir = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
    let d = 200, ext = null;
    camera.clearViewOffset();
    const measure = () => {
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      ext = { x0: 9, x1: -9, y0: 9, y1: -9 };
      for (const p of cakePts) { v3.copy(p).project(camera); ext.y0 = Math.min(ext.y0, v3.y); ext.y1 = Math.max(ext.y1, v3.y); ext.x0 = Math.min(ext.x0, v3.x); ext.x1 = Math.max(ext.x1, v3.x); }
      // Album and plush stand in front of the cake, so they also set the lowest point on screen.
      for (const p of sidePts) { v3.copy(p).project(camera); ext.x0 = Math.min(ext.x0, v3.x); ext.x1 = Math.max(ext.x1, v3.x); ext.y0 = Math.min(ext.y0, v3.y); ext.y1 = Math.max(ext.y1, v3.y); }
    };
    // The whole group (album, cake, plush) fits the width with a small margin, in portrait and landscape.
    for (let i = 0; i < 8; i++) {
      measure();
      d *= Math.max((ext.x1 - ext.x0) / (portrait ? 1.94 : 1.84), (ext.y1 - ext.y0) / (2 * (bottom - topLim)));
    }
    measure();
    // Lens shift (no change of perspective): the group is centred across, its lowest point lands on `bottom`.
    camera.setViewOffset(w, h, ((ext.x0 + ext.x1) / 2) * (w / 2), ((1 - 2 * bottom - ext.y0) * h) / 2, w, h);
    camera.updateProjectionMatrix();
    placeOverlays();
    placeNote();
    refitOpen();
    invalidate();
  }

  function placeOverlays() {
    const [sx, sy] = toScreen(PLUSH_AT), [ex] = toScreen(PLUSH_AT.clone().add(new THREE.Vector3(10, 0, 0)));
    const unit = ((ex - sx) / 10) * (PLUSH_H / 124);
    plushX = sx - 100 * unit;
    plushY = sy - 136 * unit;
    Object.assign(plushHost.style, { left: plushX + "px", top: plushY + "px", width: 200 * unit + "px", height: 150 * unit + "px" });
    veil = null; // the cut-out is relative to the plush's box: work it out again
    const place = (el, r, pad = 0) => Object.assign(el.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.right - r.left + 2 * pad + "px", height: r.bottom - r.top + 2 * pad + "px" });
    place(albumBtn, screenRect(book));
    C.candles.forEach((c, i) => {
      const r = screenRect(c.group, true), f = toScreen(c.group.localToWorld(c.base.clone().add(new THREE.Vector3(0, 1, 0))));
      r.top = Math.min(r.top, f[1] - 24);
      place(candleBtns[i], r, 4);
      candleBtns[i].style.setProperty("--fx", f[0] - r.left + 4 + "px");
      candleBtns[i].style.setProperty("--fy", f[1] - r.top + 4 + "px");
    });
  }

  // ---- render loop ----
  const anims = new Set();
  let raf = 0, last = 0, time = 0;
  function animate(ms, step, done) {
    const t0 = performance.now();
    const fn = now => {
      const t = ms > 1 ? Math.min(1, (now - t0) / ms) : 1;
      step(t);
      if (t >= 1 && done) done();
      return t >= 1;
    };
    anims.add(fn);
    invalidate();
    // If frames are paused or throttled, still land on the final state on time.
    setTimeout(() => { if (anims.delete(fn)) { fn(t0 + ms + 1); render(); } }, ms + 150);
  }
  let shadowsKept = false;
  function render() {
    // While a slice is out, nothing in the room moves (the slice and what is held up are drawn above it and cast
    // no shadow there), so the room's shadows are drawn once and kept: redrawn every frame, they cost much of
    // each frame while the message is written. The note being put down on the table moves them again.
    const still = openK !== -1 && !noteFly;
    if (!still || !shadowsKept) renderer.shadowMap.needsUpdate = true;
    shadowsKept = still;
    syncBites();
    veilPlush();
    if (openK === -1 && scrimA <= 0.001) { renderer.autoClear = true; renderer.render(scene, camera); return; }
    renderer.autoClear = false;
    renderer.clear();
    camera.layers.set(0);
    renderer.render(scene, camera);
    scrim.material.opacity = scrimA;
    renderer.render(scrimScene, scrimCam);
    renderer.clearDepth();
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0);
  }
  // The plush is a DOM layer above the canvas, so while a slice is read he stays (author rule: he never goes away)
  // but is dimmed with the room by the scrim's own amount, and whatever is drawn above the dark (layer 1: the
  // slice, the note held up and carried down) has its outline cut out of him, so it stays in front of him.
  let plushX = 0, plushY = 0, veil = "", veilPrev = [];
  const veilV = new THREE.Vector3();
  function hull(p) {
    p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.slice().reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // A slice's real extent in cake coordinates, from its own meshes (the cream, the sponge faces, the piping; not
  // the heart): its bottom and top, and how far out it reaches low down (the piping) and higher up.
  function sliceExt(s) {
    if (s.userData.ext) return s.userData.ext;
    const e = { y0: Infinity, y1: -Infinity, rLo: 0, rHi: 0 };
    s.userData.inner.children.slice(0, 6).forEach(mesh => {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
        e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y);
        if (y < Y0 + 1.2) e.rLo = Math.max(e.rLo, r); else e.rHi = Math.max(e.rHi, r);
      }
    });
    e.y1 += 0.08; // the icing text lies just above the cream
    e.rLo = Math.max(e.rLo, e.rHi);
    return (s.userData.ext = e);
  }
  function veilPlush() {
    let pts = [];
    const add = (m, x, y, z) => pts.push(toScreen(veilV.set(x, y, z).applyMatrix4(m)));
    if (openK !== -1 && cake.slices[openK].visible) {
      // The slice is an upright prism (its outline seen from above, from its bottom to its top), so its outline on
      // screen is the hull of that outline at both heights: worked out in cake coordinates (the inner group) from
      // the slice's real size, minus the bites already taken, so no gap shows around it.
      const sl = cake.slices[openK], e = sliceExt(sl), m = sl.userData.inner.matrixWorld, ax = radial(sl.userData.mid);
      const n = eatK === openK ? bitesTaken : 0, B = biteU.uBites.value;
      const outside = (x, z, skip) => { for (let i = 0; i < n; i++) { if (i === skip) continue; const dx = x - B[i].x, dz = z - B[i].y; if (Math.hypot(dx, dz) < ragged(B[i].z, i, Math.atan2(dz, dx)) - 1e-3) return false; } return true; };
      sl.updateWorldMatrix(true, true);
      // Each edge of what is left (the two cut sides, the rim, the edge of each bite) is walked finely, and where
      // it goes in or out of a bite (or out of the slice) the exact corner is found by halving: sampled every half
      // centimetre, those corners were cut off and up to 8 px of a bite's sponge wall showed with him over it.
      const walk = (f, N, ok) => {
        let pt = f(0), was = ok(pt), t0 = 0;
        if (was) add(m, pt[0], pt[1], pt[2]);
        for (let j = 1; j <= N; j++) {
          const t1 = j / N, p1 = f(t1), is = ok(p1);
          if (is !== was) { let a = t0, b = t1; for (let s = 0; s < 14; s++) { const c = (a + b) / 2; if (ok(f(c)) === was) a = c; else b = c; } const q = f(is ? b : a); add(m, q[0], q[1], q[2]); }
          if (is) add(m, p1[0], p1[1], p1[2]);
          was = is; t0 = t1;
        }
      };
      // the bite walls run from the very bottom of the cake to its top
      for (const [y, rr] of [[Math.min(e.y0, Y0), e.rLo], [e.y1, e.rHi]]) {
        const inSector = (x, z) => { const d = Math.hypot(x, z); return d <= rr + 1e-3 && (d < 1e-3 || (x * ax.x + z * ax.z) / d >= HALF - 1e-4); };
        const left = p => outside(p[0], p[2], -1);
        for (const a of [sl.userData.mid - Math.PI / 8, sl.userData.mid + Math.PI / 8]) walk(t => [Math.cos(a) * t * rr, y, Math.sin(a) * t * rr], 64, left);
        walk(t => { const a = sl.userData.mid + (t - 0.5) * (Math.PI / 4); return [Math.cos(a) * rr, y, Math.sin(a) * rr]; }, 32, left);
        for (let i = 0; i < n; i++) {
          walk(t => { const th = t * Math.PI * 2, q = ragged(B[i].z, i, th); return [B[i].x + q * Math.cos(th), y, B[i].y + q * Math.sin(th)]; }, 96, p => inSector(p[0], p[2]) && outside(p[0], p[2], i));
        }
      }
    }
    if (note && note.visible && noteFly) {
      note.updateMatrixWorld();
      for (const [x, y] of [[-4.8, -3], [4.8, -3], [4.8, 3], [-4.8, 3]]) add(note.matrixWorld, x, y, 0);
    }
    // The cut also covers where it all was a frame ago: a phone may show the new frame of the 3D view and the new
    // cut a frame apart, and a moving slice must not slip behind him for that frame (author rule: he is always
    // behind it). At rest the two are the same.
    const now = pts, moved = veilPrev.length !== now.length || now.some((p, i) => Math.abs(p[0] - veilPrev[i][0]) + Math.abs(p[1] - veilPrev[i][1]) > 0.3);
    pts = pts.length ? pts.concat(veilPrev) : pts;
    veilPrev = now;
    if (moved && now.length) setTimeout(invalidate); // once it comes to rest, one more frame trims the cut to it
    pts = pts.map(([x, y]) => [x - plushX, y - plushY]);
    let clip = "";
    if (pts.length > 2) {
      // A frame round the screen with the outline as a hole: the hole runs the other way round, so it is a hole
      // under either fill rule (no keyword needed, which Safari may not honour everywhere).
      let h = hull(pts);
      if (h.length > 2) {
        // a pixel and a half wider all round, so the slice's smoothed edge never has him showing along it
        const cx = h.reduce((a, p) => a + p[0], 0) / h.length, cy = h.reduce((a, p) => a + p[1], 0) / h.length;
        h = h.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / d) * 1.5, y + ((y - cy) / d) * 1.5]; });
        const area = h.reduce((a, p, i) => { const q = h[(i + 1) % h.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
        if (area > 0) h = h.reverse(); // the frame below runs clockwise on screen (positive area): the hole the other way
        const F = 4000, hs = h.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`);
        clip = `polygon(${-F}px ${-F}px, ${F}px ${-F}px, ${F}px ${F}px, ${-F}px ${F}px, ${-F}px ${-F}px, ${hs.join(", ")}, ${hs[0]})`;
      }
    }
    const f = scrimA > 0.001 ? `brightness(${(1 - scrimA).toFixed(3)})` : "", key = f + clip;
    if (key === veil) return;
    veil = key;
    plushHost.style.filter = f;
    plushHost.style.clipPath = plushHost.style.webkitClipPath = clip;
    plushHost.classList.toggle("veiled", !!key); // he holds still meanwhile, painted as one, so all of him is dimmed and cut (css)
  }
  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    for (const a of [...anims]) if (a(now)) anims.delete(a);
    C.update(time, dt);
    render();
    if (anims.size || C.anyLit || C.busy) raf = requestAnimationFrame(loop);
  }
  function invalidate() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }

  // ---- room light: dim and candle-lit before the wish, bright party light after ----
  let light = 0;
  function applyLight(v) {
    light = v;
    hemi.intensity = lerp(0.45, 0.85, v);
    key.intensity = lerp(1.8, 2.7, v);
    rim.intensity = lerp(0.35, 0.75, v);
    renderer.toneMappingExposure = lerp(1.12, 1.24, v);
    scene.traverse(m => { if (m.material) [].concat(m.material).forEach(mt => { if ("envMapIntensity" in mt) mt.envMapIntensity = lerp(0.7, 1, v) * (mt.userData.env ?? 1); }); });
  }
  applyLight(0);

  // ---- picking: candles (while lit), slices, album ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
    down = null;
    if (moved > 10 || openK !== -1) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects([...cake.slices, C.group, book, ...(note && note.visible ? [note] : [])], true)) {
      const u = hit.object.userData;
      if (u.note) return o.onNoteTap();
      if (u.candle !== undefined) { if (C.candles[u.candle].lit) return o.onCandleTap(u.candle); continue; }
      if (u.k !== undefined) { if (eaten.has(u.k)) continue; const i = FRONT.indexOf(u.k); if (i >= 0) o.onSliceTap(i); return; } // the back of the cake, and an eaten slice's empty place, ignore taps
      if (book.getObjectById(hit.object.id)) return o.onAlbumTap();
    }
  });

  // ---- slices ----
  let openK = -1, closing = false, sliceView = null, arriving = false, openSeq = 0;
  // The berries on a slice step aside while its message is read, and come back when it is put back.
  function setBerries(s, f) {
    for (const b of s.userData.berries) { b.scale.copy(b.userData.s0).multiplyScalar(Math.max(1e-3, f)); b.visible = f > 0.01 && !b.userData.eaten; }
  }
  function textMesh(k) {
    const s = cake.slices[k];
    if (s.userData.text) return s.userData.text;
    const r1 = 0.36 * R, r2 = 0.8 * R, hgt = r2 - r1, wid = 2 * r2 * Math.tan(Math.PI / 8) * 0.95;
    const W = 1024, Hp = Math.round((W * hgt) / wid);
    const map = TX.icingText((messages && messages[FRONT.indexOf(k)]) || "", W, Hp, t => (2 * (r2 - t * hgt) * Math.tan(Math.PI / 8) * 0.8) / wid);
    map.anisotropy = aniso;
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    // Piped like cream: each pixel shows once the pen has reached it (tex.js revealMap: one round tip moving along
    // the middle of each stroke, letter after letter), with a front two pixels soft. uReveal runs 0 to 1, 2 is all done.
    const rv = map.userData.reveal, revealU = { uReveal: { value: 2 }, uSoft: { value: rv.soft }, uRevealMap: { value: rv } };
    mat.customProgramCacheKey = () => "icing";
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, revealU);
      // highp: by default a texture is read at low precision, half floats on a phone, too coarse for the time in
      // it, so the cream's front jumped and the end of one letter ran into the next.
      sh.fragmentShader = "uniform highp float uReveal;\nuniform highp float uSoft;\nuniform highp sampler2D uRevealMap;\n" + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
  highp vec4 rvm = texture2D(uRevealMap, vMapUv);
  diffuseColor.a *= smoothstep(0.0, uSoft, uReveal - (rvm.r + rvm.g / 255.0));`);
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), mat);
    mesh.userData.reveal = revealU.uReveal;
    // The map of how it is piped is made in steps in the background (tex.js revealStep); ready() finishes it at
    // once if the slice is opened first, and sets the pace and the soft edge from it.
    mesh.userData.ready = () => { TX.revealStep(rv); revealU.uSoft.value = rv.soft; mesh.userData.letters = rv.letters; mesh.userData.soft = rv.soft; };
    mesh.userData.rv = rv;
    const rr = radial(s.userData.mid), t = new THREE.Vector3().crossVectors(rr, Y);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, rr, Y));
    mesh.position.copy(rr).multiplyScalar((r1 + r2) / 2).setY(TOP + 0.05);
    mesh.visible = false;
    mesh.userData.k = k;
    mesh.userData.w = wid;
    s.userData.inner.add(mesh);
    s.userData.text = mesh;
    return mesh;
  }
  function viewPose(k) {
    const rr = radial(cake.slices[k].userData.mid), t = new THREE.Vector3().crossVectors(rr, Y);
    const cr = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), cu = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), cb = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    const Mt = new THREE.Matrix4().makeBasis(cr, cu, cb), Ml = new THREE.Matrix4().makeBasis(t, rr, Y).transpose();
    const q = new THREE.Quaternion().setFromRotationMatrix(Mt.multiply(Ml));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(cu, 0.3)).premultiply(new THREE.Quaternion().setFromAxisAngle(cr, -0.25));
    const tanH = Math.tan((camera.fov * DEG) / 2), dist = Math.max((R * 1.3) / (0.58 * 2 * tanH), 12 / (0.8 * 2 * tanH * camera.aspect));
    const p = new THREE.Vector3(0, -0.04, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
    return { p, q };
  }
  const bez = (a, b, c, t) => new THREE.Vector3().copy(a).multiplyScalar((1 - t) ** 2).addScaledVector(b, 2 * (1 - t) * t).addScaledVector(c, t * t);
  function liftPose(s) {
    const rr = radial(s.userData.mid);
    return { p: s.userData.pivot.clone().addScaledVector(rr, 6).add(new THREE.Vector3(0, 3.5, 0)), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(rr, Y), 0.2) };
  }
  // written() runs once the message is on the slice: after it is written out the first time, or as soon as the
  // slice has arrived when it was read before (main.js only then shows the bite hint, author rule).
  function openSlice(k, written) {
    if (openK !== -1) return;
    openK = k;
    const s = cake.slices[k], txt = textMesh(k), lift = liftPose(s), q0 = new THREE.Quaternion(), seq = ++openSeq;
    sliceView = viewPose(k); // worked out again by fit() if the screen changes size meanwhile
    arriving = true;
    s.traverse(m => m.layers.set(1));
    txt.visible = true;
    const again = !!txt.userData.read; // read before: the text is already written on it
    txt.userData.ready();
    txt.userData.reveal.value = reduced || again ? 2 : 0;
    ov.classList.add("slice-open");
    animate(reduced ? 1 : 1050, t => {
      if (seq !== openSeq) return;
      const e = ease(t);
      s.position.copy(bez(s.userData.pivot, lift.p, sliceView.p, e));
      if (e < 0.3) s.quaternion.slerpQuaternions(q0, lift.q, e / 0.3); else s.quaternion.slerpQuaternions(lift.q, sliceView.q, (e - 0.3) / 0.7);
      setBerries(s, 1 - smooth(0.12, 0.42, t));
      scrimA = 0.58 * Math.min(1, t * 1.5);
    }, () => {
      if (seq !== openSeq) return;
      arriving = false;
      if (reduced || again) { if (written) written(); return; }
      // Piped letter by letter through the sentence, the pen at one steady speed all the way.
      const ms = Math.min(5000, Math.max(2000, txt.userData.letters * 170)), end = 1 + 2 * txt.userData.soft;
      animate(ms, t => { if (seq === openSeq) txt.userData.reveal.value = t * end; }, () => { if (seq !== openSeq) return; txt.userData.reveal.value = 2; if (written) written(); });
    });
  }
  // A new size of screen while a slice is read: it moves to its place in the new view (fit() calls this).
  function refitOpen() {
    if (openK === -1 || closing) return;
    sliceView = viewPose(openK);
    if (!arriving) { const s = cake.slices[openK]; s.position.copy(sliceView.p); s.quaternion.copy(sliceView.q); }
    if (note && noteHeld) { const { p, q } = notePresentPose(); note.position.copy(p); note.quaternion.copy(q); }
  }
  function finish(k) {
    const s = cake.slices[k];
    s.position.copy(s.userData.pivot);
    s.quaternion.identity();
    s.visible = !eaten.has(k);
    if (eaten.has(k)) { s.scale.setScalar(1); showNote(true); } // gone: its empty place ignores taps (author rule), the note on the table answers them
    s.traverse(m => m.layers.set(0));
    // the message stays written on the slice once it is back in the cake (author rule)
    setBerries(s, 1);
    scrimA = 0;
    openK = -1;
    closing = false;
    arriving = false;
    openSeq++;
    ov.classList.remove("slice-open");
  }
  // done(k) runs once the slice is back; settled(k) once everything has come to rest, the note included.
  function closeSlice(done, settled) {
    if (openK === -1 || closing) return;
    closing = true;
    const k = openK, s = cake.slices[k], lift = liftPose(s), p0 = s.position.clone(), q0 = s.quaternion.clone(), qe = new THREE.Quaternion();
    openSeq++; // the slice stops arriving, and the text stops being written: it is all there now
    if (s.userData.text) { s.userData.text.userData.reveal.value = 2; s.userData.text.userData.read = true; }
    // An eaten slice has nothing left to fly back: the dark lifts quicker and the note starts drifting down at
    // once, in one move with it, instead of after an empty wait.
    const gone = eaten.has(k);
    if (gone) { if (note && noteFly) placeNoteDown(); else showNote(true); }
    animate(reduced ? 1 : gone ? 500 : 750, t => {
      const e = ease(t);
      s.position.copy(bez(p0, lift.p, s.userData.pivot, e));
      if (e < 0.7) s.quaternion.slerpQuaternions(q0, lift.q, e / 0.7); else s.quaternion.slerpQuaternions(lift.q, qe, (e - 0.7) / 0.3);
      setBerries(s, smooth(0.55, 0.95, t));
      scrimA = 0.58 * (1 - t);
    }, () => {
      finish(k);
      // no heart on it (author rule): the message itself stays written on the slice
      if (done) done(k);
      if (settled) setTimeout(() => settled(k), gone ? Math.max(0, noteEnd - performance.now()) : 0);
    });
  }

  // ---- eating the slice (author request) ----
  // While it is read, each tap on the slice takes a bite out of it, from the pointy end towards the rim. A bite is
  // a vertical cylinder with a ragged edge like teeth marks, worked out in cake coordinates: the slice's own cloned
  // materials discard what is inside any bite, and each bite gets a wall (`biteWall`), the cylinder itself in the
  // sponge material, kept only where it is inside the slice and outside the other bites, so the cake reads solid,
  // never hollow. The last bite eats what is left; the slice then stays gone from the cake until a reset, and a
  // little paper note lies on the table in front instead (tap it to read it again).
  // [radius along the slice, sideways, size]. Each bite reaches past both sides of the slice wherever it overlaps
  // the one before, so what is left is always one piece (no crumbs left standing alone at the sides), and the
  // fourth stops short of the rim, leaving the rim as the last piece; the fifth eats that.
  const BITES = [[1.2, 0, 3.0], [3.4, 0, 3.45], [5.2, 0, 3.9], [6.5, 0, 4.2], [12.4, 0, 6]];
  const HALF = Math.cos(Math.PI / 8);
  const biteU = {
    uBites: { value: BITES.map(() => new THREE.Vector4()) }, uBiteN: { value: 0 }, uToCake: { value: new THREE.Matrix4() },
    uSlice: { value: new THREE.Vector4() }, uYr: { value: new THREE.Vector2(Y0, TOP) }, uCrumb: { value: new THREE.Color(0xe9cf98) },
  };
  const ragged = (r, i, th) => r * (1 + 0.05 * Math.sin(5 * th + i * 1.7) + 0.03 * Math.sin(9 * th + i * 2.9));
  const eaten = new Set(), biteRay = new THREE.Raycaster(), walls = [];
  biteRay.layers.set(1);
  let eatK = -1, bitesTaken = 0;
  // wall: -1 for the slice's own materials, else the index of the bite this wall belongs to.
  function biteMaterial(m, wall = -1) {
    // Materials already drawn on both sides (the sponge cut faces, the piping) keep their own look; only the
    // cream shell shows the sponge colour on its inside, wherever a gap might let it be seen.
    const c = m.clone(), inside = wall < 0 && !c.transparent && c.side !== THREE.DoubleSide;
    if (inside) c.side = THREE.DoubleSide;
    if (wall >= 0) { c.side = THREE.FrontSide; c.emissive = new THREE.Color(0xffffff); c.emissiveMap = c.map; c.emissiveIntensity = 0.28; } // inside the bite it is in shade; lifted to match the cut faces
    // A material that already changes its shader (the icing text's reveal) keeps doing so under the bites.
    const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey.call(m);
    c.customProgramCacheKey = () => baseKey + "bite" + (inside ? "i" : "") + (wall >= 0 ? "w" : "");
    c.onBeforeCompile = (sh, r) => {
      base.call(c, sh, r);
      Object.assign(sh.uniforms, biteU, { uWall: { value: wall } });
      sh.vertexShader = "varying vec3 vBiteW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vBiteW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "varying vec3 vBiteW;\nuniform vec4 uBites[5];\nuniform int uBiteN;\nuniform int uWall;\nuniform mat4 uToCake;\nuniform vec4 uSlice;\nuniform vec2 uYr;\nuniform vec3 uCrumb;\n" + sh.fragmentShader
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  vec3 pc = (uToCake * vec4(vBiteW, 1.0)).xyz;
  for (int i = 0; i < 5; i++) {
    if (i >= uBiteN) break;
    if (i == uWall) continue;
    vec2 q = pc.xz - uBites[i].xy;
    float th = atan(q.y, q.x), fi = float(i);
    if (length(q) < uBites[i].z * (1.0 + 0.05 * sin(5.0 * th + fi * 1.7) + 0.03 * sin(9.0 * th + fi * 2.9))) discard;
  }
  if (uWall >= 0) {
    float rr = length(pc.xz);
    if (rr > uSlice.w || dot(pc.xz / max(rr, 1e-4), uSlice.xy) < uSlice.z || pc.y < uYr.x || pc.y > uYr.y) discard;
  }`)
        .replace("#include <map_fragment>", inside ? "#include <map_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = uCrumb;" : "#include <map_fragment>");
    };
    return c;
  }
  const biteCentre = (k, i) => {
    const rr = radial(cake.slices[k].userData.mid), t = new THREE.Vector3().crossVectors(rr, Y), [d, side] = BITES[i];
    return rr.multiplyScalar(d).addScaledVector(t, side);
  };
  // The wall of bite i: the ragged cylinder from the bottom of the cake to the top, its sponge layers lined up
  // with the cut faces (v runs bottom to top over the cake's height, u is the distance from the cake's centre).
  // Made ahead, a moment after the page has loaded (prepEat): the slice's bite materials, a bite wall's, and the
  // note, with their shaders built in the background. Made at the first bite, building them held up that frame,
  // so the first bite showed late (author: laggy).
  // Builds the shaders of obj's materials now, in the background where the browser can: once as drawn among the
  // room's lights (layer 0) and once as drawn above the dark (layer 1, which leaves the candles' lights out). A
  // shader is made for the lights it is lit by, so building only one of the two left the other to the first bite.
  function buildShaders(obj) {
    for (const l of [0, 1]) {
      camera.layers.set(l);
      try { renderer.compileAsync(obj, camera, scene).catch(() => {}); } catch (e) { /* then built when first drawn */ }
    }
    camera.layers.set(0);
  }
  function prepEat(k) {
    const s = cake.slices[k], pre = new THREE.Scene(), txt = s.userData.text;
    // The icing text as it is first written, too: its shader and both its pictures, so opening the slice does not
    // wait for them.
    if (txt && !txt.userData.prepped) {
      txt.userData.prepped = true;
      renderer.initTexture(txt.material.map);
      renderer.initTexture(txt.userData.rv);
      pre.add(new THREE.Mesh(txt.geometry, txt.material));
    }
    s.traverse(m => {
      if (!m.isMesh || m.userData.biteNext || m.userData.biteMat) return;
      // its own materials as drawn above the dark (layer 1) the first time it is opened: built then, they made
      // the slice's way out stutter
      const own = new THREE.Mesh(m.geometry, m.material);
      own.castShadow = m.castShadow; own.receiveShadow = m.receiveShadow;
      pre.add(own);
      m.userData.biteNext = biteMaterial(m.material);
      const d = new THREE.Mesh(m.geometry, m.userData.biteNext);
      d.castShadow = m.castShadow; d.receiveShadow = m.receiveShadow;
      pre.add(d);
    });
    if (!s.userData.wallMat) {
      const sponge = s.userData.inner.children[2];
      s.userData.wallMat = biteMaterial(sponge.userData.mat0 || sponge.material, 0); // kept, so the walls' shader stays built
      const d = new THREE.Mesh(sponge.geometry, s.userData.wallMat);
      d.receiveShadow = true;
      pre.add(d);
    }
    if (pre.children.length) buildShaders(pre);
    try { renderer.compileAsync(scrimScene, scrimCam).catch(() => {}); } catch (e) { /* the dark behind the slice: then built when first drawn */ }
    setTimeout(makeNote, 400);
  }
  function biteWall(k, i, mat) {
    const c = biteCentre(k, i), r = BITES[i][2], n = 96, pos = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) {
      const th = (j / n) * Math.PI * 2, rad = ragged(r, i, th), x = c.x + rad * Math.cos(th), z = c.z + rad * Math.sin(th);
      pos.push(x, Y0, z, x, TOP, z);
      const u = Math.hypot(x, z) / R; // as on the cut faces: sponge inside, the outer cream only right at the rim
      uv.push(u, 0, u, 1);
      if (j) { const v = j * 2; idx.push(v - 2, v, v - 1, v, v + 1, v - 1); } // facing into the bite, where it is seen
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const w = new THREE.Mesh(g, biteMaterial(mat, i));
    w.userData.k = k;
    w.userData.bite = i;
    w.layers.set(1);
    cake.slices[k].userData.inner.add(w);
    walls.push(w);
  }
  function syncBites() {
    if (eatK === -1) return;
    const s = cake.slices[eatK], inner = s.userData.inner, rr = radial(s.userData.mid);
    // From the slice itself down: this frame's move and turn, not last frame's. With last frame's, the bites
    // trailed behind the moving slice, so it seemed to warp and wobble as it was carried (author: glitchy).
    inner.updateWorldMatrix(true, false);
    biteU.uToCake.value.copy(inner.matrixWorld).invert();
    biteU.uSlice.value.set(rr.x, rr.z, HALF, R);
    biteU.uBiteN.value = bitesTaken;
  }
  // A tap at (x, y) while a slice is read: null if it missed the slice, otherwise { n, done } after taking
  // bite n (done: the slice is all eaten). Every tap on it bites, even while it is still arriving.
  // Whether a ray hit lands on what is left of the slice (author rule: a tap where the slice used to be, but no
  // longer is, is not a tap on it). The hit test sees whole meshes, so it is held to the same rules as their
  // drawing: nothing inside a bite taken, a bite's wall only where it lies inside the slice and outside the other
  // bites, nothing hidden (the heart, eaten berries), and not the clear corners of the message's plane.
  const hitP = new THREE.Vector3(), toCake = new THREE.Matrix4();
  function solidHit(s, h) {
    for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
    if (h.object === s.userData.text) return false;
    const n = eatK === s.userData.k ? bitesTaken : 0, B = biteU.uBites.value, wall = h.object.userData.bite ?? -1;
    s.userData.inner.updateWorldMatrix(true, false);
    hitP.copy(h.point).applyMatrix4(toCake.copy(s.userData.inner.matrixWorld).invert());
    for (let i = 0; i < n; i++) {
      if (i === wall) continue;
      const dx = hitP.x - B[i].x, dz = hitP.z - B[i].y;
      if (Math.hypot(dx, dz) < ragged(B[i].z, i, Math.atan2(dz, dx))) return false;
    }
    if (wall >= 0) {
      const ax = radial(s.userData.mid), r = Math.hypot(hitP.x, hitP.z);
      if (r > R || (r > 1e-4 && (hitP.x * ax.x + hitP.z * ax.z) / r < HALF) || hitP.y < Y0 || hitP.y > TOP) return false;
    }
    return true;
  }
  function biteSlice(x, y) {
    if (openK === -1 || closing || eaten.has(openK)) return null;
    const k = openK, s = cake.slices[k];
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    biteRay.setFromCamera(ndc, camera);
    if (!biteRay.intersectObject(s, true).some(h => solidHit(s, h))) return null;
    // Not before the whole message is on it (author rule): a tap on the slice meanwhile does nothing at all.
    const txt = s.userData.text;
    if (txt && txt.userData.reveal.value < 2) return { wait: true };
    if (eatK !== k) {
      eatK = k;
      bitesTaken = 0;
      BITES.forEach((b, i) => { const c = biteCentre(k, i); biteU.uBites.value[i].set(c.x, c.z, b[2], 0); });
      s.traverse(m => { if (m.isMesh && !m.userData.biteMat) { m.userData.mat0 = m.material; m.material = m.userData.biteNext || biteMaterial(m.material); m.userData.biteMat = true; } });
      setTimeout(makeNote, 300); // made ahead already (prepEat); only if it was not
    }
    const i = bitesTaken;
    bitesTaken = Math.min(BITES.length, bitesTaken + 1);
    // A strawberry the bite reaches is eaten with it: cut in half it looked hollow as it grew back onto the slice.
    {
      const c = biteCentre(k, i), reach = BITES[i][2] * 1.08, box = new THREE.Box3(), mid = new THREE.Vector3(), size = new THREE.Vector3();
      s.updateWorldMatrix(true, true);
      for (const b of s.userData.berries) {
        if (b.userData.eaten) continue;
        const sc = b.scale.clone();
        b.scale.copy(b.userData.s0); b.updateMatrixWorld(true); // its full size, even while it has stepped aside
        box.setFromObject(b).getCenter(mid); box.getSize(size);
        b.scale.copy(sc); b.updateMatrixWorld(true);
        s.userData.inner.worldToLocal(mid);
        if (Math.hypot(mid.x - c.x, mid.z - c.z) < reach + 0.45 * Math.max(size.x, size.z) / s.scale.x) { b.userData.eaten = true; b.visible = false; }
      }
    }
    const n = bitesTaken, done = n >= BITES.length;
    if (done) {
      eaten.add(k);
      animate(reduced ? 1 : 380, t => s.scale.setScalar(Math.max(1e-3, 1 - ease(t))), () => { if (eaten.has(k)) s.visible = false; });
      presentNote(); // the note comes up where the slice was, and is later put down on the table from there
    } else {
      biteWall(k, i, s.userData.inner.children[2].userData.mat0); // the slice's sponge (a cut face)
      animate(reduced ? 1 : 220, t => { const q = Math.sin(t * Math.PI) * 0.05; s.scale.set(1 + q, 1 - q, 1 + q); });
    }
    invalidate();
    return { n, done };
  }

  // The note left on the table, in front of everything in the middle, once the slice is eaten and put away.
  // It lies where main.js asks (o.noteSpot(): screen x, y, the middle of the screen halfway between the album and
  // the text at the bottom), found on the table by a ray from the camera, and is placed again on resize.
  let note = null;
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.09), spotRay = new THREE.Raycaster(), spotP = new THREE.Vector3();
  function tableSpot(out) {
    const p = o.noteSpot ? o.noteSpot() : { x: innerWidth / 2, y: innerHeight * 0.8 };
    ndc.set((p.x / innerWidth) * 2 - 1, -(p.y / innerHeight) * 2 + 1);
    spotRay.setFromCamera(ndc, camera);
    return spotRay.ray.intersectPlane(tablePlane, out) ? out.setY(0.09) : out.set(0, 0.09, 28);
  }
  function placeNote() {
    if (!note || !note.visible || noteFly) return;
    tableSpot(spotP);
    note.position.set(spotP.x, note.position.y, spotP.z);
  }
  // The note is made ahead, at the first bite (makeNote), with its texture uploaded and its shader built then:
  // making them in the frame it first showed stalled the drop on a phone (author: laggy). Its emissive map (the
  // paper itself, off on the table) lets it read as bright paper while it is held up in front of the dark.
  const NOTE_MS = 1100, NOTE_FLY = 1250, NOTE_RX = -Math.PI / 2 + 0.03, NOTE_GLOW = 0.45;
  let noteEnd = 0, noteSeq = 0, noteFly = false, noteHeld = false; // held: shown up where the slice was, not yet put down
  function makeNote() {
    if (note) return;
    const map = TX.noteTex(o.plateNote || "");
    note = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 6), new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0, roughness: 0.85, transparent: true }));
    note.rotation.set(NOTE_RX, 0, 0.06);
    note.castShadow = note.receiveShadow = true;
    note.userData.note = true;
    scene.add(note);
    renderer.initTexture(map);
    buildShaders(note);
    note.visible = false;
  }
  // Where the note is first shown, once the last bite is taken: facing the camera where the slice was, as wide
  // as the big note view (main.js .plate: 80% of the width, at most 330 px), its centre 42% down the screen.
  function notePresentPose(roll = -2) {
    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const dir = new THREE.Vector3(0, 0.16, 0.5).unproject(camera).sub(camera.position).normalize();
    const at = d => camera.position.clone().addScaledVector(dir, d / dir.dot(fwd));
    const sx = v => v.project(camera).x * 0.5 * innerWidth;
    const c = at(40), w = sx(c.clone().addScaledVector(right, 4.8)) - sx(c.clone().addScaledVector(right, -4.8));
    const p = at((40 * w) / Math.min(innerWidth * 0.8, 330));
    const q = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll * DEG));
    return { p, q };
  }
  // The note as it is first held up, drawn by the 3D view itself into a picture, for the big note view later on
  // (author rule: it is the same note every time, so it must look exactly the same, not a copy toned to match).
  // It is drawn level (the page tilts the picture as the 3D note was tilted), alone and over nothing, in the same
  // light and at the same size and place on screen; then the frame on screen is drawn again, before the page shows.
  function noteShot() {
    makeNote();
    const gl = renderer.getContext();
    if (gl.isContextLost()) return note.material.map.image;
    const keep = { v: note.visible, p: note.position.clone(), q: note.quaternion.clone(), s: note.scale.clone(), a: note.material.opacity, g: note.material.emissiveIntensity, l: note.layers.mask, c: note.castShadow };
    const { p, q } = notePresentPose(0);
    Object.assign(note, { visible: true, castShadow: false });
    note.position.copy(p); note.quaternion.copy(q); note.scale.setScalar(1);
    note.material.opacity = 1; note.material.emissiveIntensity = NOTE_GLOW;
    note.layers.set(1);
    note.updateMatrixWorld();
    const xs = [], ys = [];
    for (const [x, y] of [[-4.8, -3], [4.8, -3], [4.8, 3], [-4.8, 3]]) { const [sx, sy] = toScreen(note.localToWorld(new THREE.Vector3(x, y, 0))); xs.push(sx); ys.push(sy); }
    const k = renderer.domElement.width / innerWidth, x0 = Math.min(...xs) * k, y0 = Math.min(...ys) * k, w = (Math.max(...xs) - Math.min(...xs)) * k, h = (Math.max(...ys) - Math.min(...ys)) * k;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w)); out.height = Math.max(1, Math.round(h));
    renderer.autoClear = false;
    renderer.clear();
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0);
    out.getContext("2d").drawImage(renderer.domElement, x0, y0, w, h, 0, 0, out.width, out.height);
    note.visible = keep.v; note.position.copy(keep.p); note.quaternion.copy(keep.q); note.scale.copy(keep.s);
    note.material.opacity = keep.a; note.material.emissiveIntensity = keep.g; note.layers.mask = keep.l; note.castShadow = keep.c;
    render();
    return out;
  }
  // The last bite: the note comes up where the slice was (drawn on layer 1, above the dark, like the slice).
  function presentNote() {
    makeNote();
    const seq = ++noteSeq, { p, q } = notePresentPose();
    noteFly = noteHeld = true;
    note.visible = true;
    note.layers.enable(1);
    note.castShadow = false;
    note.position.copy(p);
    note.quaternion.copy(q);
    note.material.opacity = 0;
    note.material.emissiveIntensity = NOTE_GLOW;
    animate(reduced ? 1 : 700, t => {
      if (seq !== noteSeq) return;
      const e = smooth(0.25, 1, t); // as the slice shrinks away
      note.material.opacity = e;
      note.scale.setScalar(0.85 + 0.15 * e + 0.05 * Math.sin(e * Math.PI));
    });
    invalidate();
  }
  // Putting it down (the first time only): from where it was held it is carried down to its spot on the table,
  // turning to lie flat on the way and coming down onto it from just above, slowing to rest; as the dark lifts it
  // stops glowing and casts its shadow, so it ends exactly as the note that then lies there.
  function placeNoteDown() {
    noteHeld = false;
    const seq = ++noteSeq, p0 = note.position.clone(), q0 = note.quaternion.clone(), s0 = note.scale.x, a0 = note.material.opacity, g0 = note.material.emissiveIntensity;
    const p1 = tableSpot(new THREE.Vector3()), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(NOTE_RX, 0, 0.06));
    const c = p1.clone().setY(p1.y + 9); // straight above its spot, so it never overshoots it
    noteEnd = performance.now() + (reduced ? 0 : NOTE_FLY);
    animate(reduced ? 1 : NOTE_FLY, t => {
      if (seq !== noteSeq) return;
      const e = ease(t);
      note.position.copy(bez(p0, c, p1, e));
      note.quaternion.slerpQuaternions(q0, q1, ease(Math.min(1, t / 0.85)));
      note.scale.setScalar(lerp(s0, 1, e));
      note.material.opacity = lerp(a0, 1, Math.min(1, t / 0.3));
      note.material.emissiveIntensity = g0 * (1 - smooth(0, 0.8, t));
      note.castShadow = t > 0.45;
    }, () => {
      if (seq !== noteSeq) return;
      note.layers.disable(1);
      noteFly = false;
      placeNote(); // in case the screen changed size on the way
      invalidate();
    });
  }
  function showNote(on) {
    if (on) makeNote();
    if (!note) return;
    if (on && note.visible) return; // already lying there, or on its way down
    noteSeq++;
    noteFly = noteHeld = false;
    note.visible = on;
    note.layers.disable(1);
    note.scale.setScalar(1);
    note.material.emissiveIntensity = 0;
    if (on) {
      note.position.set(0, 0.09, 28);
      note.material.opacity = reduced ? 1 : 0;
      placeNote();
      noteEnd = performance.now() + (reduced ? 0 : NOTE_MS);
      // Only when it was not held up first (a reset mid-way): it fades in a few centimetres above the table and
      // drifts down, turning a little and rocking like paper, slowing all the way to rest.
      const seq = noteSeq;
      animate(reduced ? 1 : NOTE_MS, t => {
        if (seq !== noteSeq) return;
        const e = 1 - Math.pow(1 - t, 3), a = 1 - e;
        note.position.y = 0.09 + 5 * a;
        note.rotation.set(NOTE_RX + 0.16 * Math.sin(t * Math.PI * 2.2) * a, 0, 0.06 + 0.45 * a);
        note.material.opacity = Math.min(1, t / 0.3);
        note.castShadow = t > 0.2;
      });
    }
    invalidate();
  }

  // Reset: the slice comes back whole, with its own materials, and the note goes.
  function uneat() {
    eaten.clear();
    eatK = -1;
    bitesTaken = 0;
    walls.splice(0).forEach(w => { w.parent.remove(w); w.geometry.dispose(); w.material.dispose(); });
    cake.slices.forEach(s => {
      s.visible = true;
      s.scale.setScalar(1);
      s.userData.berries.forEach(b => { b.userData.eaten = false; b.visible = true; });
      s.traverse(m => { if (m.userData.biteMat) { if (m.material !== m.userData.biteNext) m.material.dispose(); m.material = m.userData.mat0; m.userData.biteMat = false; } }); // the ones made ahead are kept, shaders and all
    });
    showNote(false);
  }

  // After the wish the front slice is "cut": it eases about a centimetre out of the cake, so the cut lines
  // (a gap showing the sponge) make it obvious that it can be tapped. The rest of the cake stays whole.
  let cut = 0;
  function setCut(on) {
    const from = cut, to = on ? 1 : 0;
    animate(reduced ? 1 : 900, t => {
      cut = lerp(from, to, ease(t));
      FRONT.forEach(k => {
        const s = cake.slices[k];
        s.userData.pivot.copy(s.userData.pivot0).addScaledVector(radial(s.userData.mid), 1.1 * cut);
        if (k !== openK) s.position.copy(s.userData.pivot);
      });
    });
  }

  // The album's covers as the book on the table shows them, for the album opened up (album.js): the very same
  // pictures as the 3D book's (tex.leatherCover with its stitching and title, tex.leather for the rest), toned by
  // how the room's light shows them on the table, measured from a frame of the 3D view. The page's own leather and
  // title looked like another book, plainly so as it was put back on the table (author). Measured again once the
  // lights have changed (setLights); the pictures are JPEG data URLs, so they can be used at once.
  let coverLook = null;
  const lightKey = () => light.toFixed(2);
  function makeCoverLook() {
    if (renderer.getContext().isContextLost() || !book.visible) return null;
    const [w, h, d] = BOOK, R0 = screenRect(book), k = renderer.domElement.width / innerWidth;
    const x0 = Math.max(0, Math.floor(R0.left)), y0 = Math.max(0, Math.floor(R0.top)), cw = Math.ceil(R0.right) - x0, ch = Math.ceil(R0.bottom) - y0;
    if (cw < 4 || ch < 4) return null;
    const shot = document.createElement("canvas");
    shot.width = Math.ceil(cw * k); shot.height = Math.ceil(ch * k);
    const sx = shot.getContext("2d", { willReadFrequently: true });
    render();
    sx.drawImage(renderer.domElement, x0 * k, y0 * k, shot.width, shot.height, 0, 0, shot.width, shot.height); // read in the same task as the frame
    const px = sx.getImageData(0, 0, shot.width, shot.height).data;
    // Plain leather on the cover, clear of the stitching, the title and the darker rim: the same places in both.
    const us = [0.14, 0.18, 0.22, 0.78, 0.82, 0.86], vs = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const img = tex.leatherCover.image, ti = (() => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; })();
    const got = [0, 0, 0], was = [0, 0, 0], v3p = new THREE.Vector3();
    let nGot = 0, nWas = 0;
    book.updateWorldMatrix(true, true);
    for (const u of us) for (const v of vs) {
      const [qx, qy] = toScreen(book.localToWorld(v3p.set((u - 0.5) * w, h, (v - 0.5) * d)));
      const X = Math.round((qx - x0) * k), Y = Math.round((qy - y0) * k);
      if (X >= 0 && Y >= 0 && X < shot.width && Y < shot.height) { const i = (Y * shot.width + X) * 4; if (px[i + 3] > 200) { for (let c = 0; c < 3; c++) got[c] += px[i + c]; nGot++; } }
      const j = (Math.round(v * (img.height - 1)) * img.width + Math.round(u * (img.width - 1))) * 4;
      for (let c = 0; c < 3; c++) was[c] += ti[j + c];
      nWas++;
    }
    render(); // the frame on screen again, before the page shows
    if (nGot < 8) return null;
    const gain = got.map((g, c) => (g / nGot) / Math.max(1, was[c] / nWas));
    const toned = src => {
      const c = document.createElement("canvas");
      c.width = src.width; c.height = src.height;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(src, 0, 0);
      const im = x.getImageData(0, 0, c.width, c.height), a = im.data;
      for (let i = 0; i < a.length; i += 4) { a[i] = Math.min(255, a[i] * gain[0]); a[i + 1] = Math.min(255, a[i + 1] * gain[1]); a[i + 2] = Math.min(255, a[i + 2] * gain[2]); }
      x.putImageData(im, 0, 0);
      return c.toDataURL("image/jpeg", 0.9);
    };
    return { key: lightKey(), cover: toned(img), plain: toned(tex.leather.image) };
  }
  function prepCover() { try { const l = makeCoverLook(); if (l) coverLook = l; } catch (e) { /* the album keeps its own leather */ } }
  setTimeout(prepCover, 2500);

  addEventListener("resize", fit);
  // The message on the slice (and the map of how it is drawn, tex.js revealMap) is made ahead, a moment after
  // the page has settled and once its font is in: made when the slice opened, it stalled the slice on its way.
  const msgs = FRONT.map(k => (messages && messages[FRONT.indexOf(k)]) || "").join(" ");
  Promise.race([document.fonts.load('700 100px "Caveat"', msgs || "a").catch(() => {}), new Promise(r => setTimeout(r, 3000))])
    .then(() => setTimeout(() => FRONT.forEach(k => {
      const rv = (cake.slices[k].userData.text || textMesh(k)).userData.rv;
      const step = () => { if (!TX.revealStep(rv, 6)) setTimeout(step, 30); else setTimeout(() => prepEat(k), 300); }; // a few ms at a time, between frames
      step();
    }), 1200));
  fit();
  canvas.classList.add("ready");

  return {
    unicorn,
    albumAnchor: {
      el: albumBtn,
      rect: () => { const r = screenRect(book); return { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }; },
      // Screen angle (degrees) of the album's front edge, so the opening book starts out turned the same way.
      angle: () => {
        const a = toScreen(book.localToWorld(new THREE.Vector3(-BOOK[0] / 2, 0, BOOK[2] / 2))), b = toScreen(book.localToWorld(new THREE.Vector3(BOOK[0] / 2, 0, BOOK[2] / 2)));
        return Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
      },
      setVisible: v => { book.visible = v; albumBtn.style.visibility = v ? "" : "hidden"; invalidate(); },
      // How the book lies on screen, for the album to land on it as the same book (album.js landing()): how far
      // the camera looks down on it (tilt, degrees from straight above), its front edge's screen angle, how tall
      // its front side shows (px), its thickness to its width, and its middle on screen.
      view: () => {
        book.updateWorldMatrix(true, false);
        const [w, h, d] = BOOK, V = THREE.Vector3;
        const c = book.localToWorld(new V(0, h / 2, 0)), a = toScreen(book.localToWorld(new V(0, h, d / 2))), b = toScreen(book.localToWorld(new V(0, 0, d / 2)));
        const l = toScreen(book.localToWorld(new V(-w / 2, h, d / 2))), r = toScreen(book.localToWorld(new V(w / 2, h, d / 2))), m = toScreen(c);
        const elev = Math.atan2(camera.position.y - c.y, Math.hypot(camera.position.x - c.x, camera.position.z - c.z));
        return { tilt: 90 - elev / DEG, angle: Math.atan2(r[1] - l[1], r[0] - l[0]) / DEG, edge: Math.hypot(b[0] - a[0], b[1] - a[1]), ratio: h / w, cx: m[0], cy: m[1] };
      },
      // The covers' pictures as the table shows them now (see makeCoverLook), or null.
      look: () => { if (!coverLook || coverLook.key !== lightKey()) prepCover(); return coverLook && coverLook.key === lightKey() ? coverLook : null; },
    },
    albumBtn,
    setBlowLevel(l) { C.setLevel(l); invalidate(); },
    extinguish(i) { const ok = C.extinguish(i); if (ok) { candleBtns[i].hidden = true; invalidate(); } return ok; },
    extinguishAll() {
      let t = 0;
      C.candles.forEach((c, i) => { if (c.lit) { setTimeout(() => { if (C.extinguish(i)) { candleBtns[i].hidden = true; invalidate(); } }, t); t += 140; } });
      return t ? t + 120 : 0;
    },
    relightAll() { C.relight(); candleBtns.forEach(b => (b.hidden = false)); invalidate(); },
    litCount: () => C.candles.filter(c => c.lit).length,
    setCandlesTappable: on => ov.classList.toggle("can-tap", on),
    setTapHint: on => ov.classList.toggle("tap-hint", on),
    setCut,
    setLocked() {},
    shimmer() {},
    setLights(on) { const from = light, to = on ? 1 : 0; animate(reduced ? 1 : 2200, t => applyLight(lerp(from, to, ease(t))), () => setTimeout(prepCover, 600)); },
    shakeSlice(i) {
      const s = cake.slices[FRONT[i]], inner = s.userData.inner, base = inner.position.clone(), t3 = new THREE.Vector3().crossVectors(radial(s.userData.mid), Y);
      animate(reduced ? 1 : 420, t => inner.position.copy(base).addScaledVector(t3, 0.3 * Math.sin(t * Math.PI * 6) * (1 - t)), () => inner.position.copy(base));
    },
    // Slices are addressed by message index here (0), see FRONT.
    openSlice: (i, written) => openSlice(FRONT[i], written),
    closeSlice: (done, settled) => closeSlice(done && (k => done(FRONT.indexOf(k))), settled && (k => settled(FRONT.indexOf(k)))),
    closeSliceNow() { if (openK !== -1) finish(openK); invalidate(); },
    isSliceOpen: () => openK !== -1,
    resetVisited() { cake.slices.forEach(s => { s.userData.heart.visible = false; const t = s.userData.text; if (t) { t.visible = false; t.userData.read = false; } }); uneat(); },
    // Eating the slice that is being read (see biteSlice); slices addressed by message index outside world.js.
    biteSlice,
    isEaten: i => eaten.has(FRONT[i]),
    // The note's own paper (its canvas), so the big note view shows exactly the note that lies on the table.
    noteImage: noteShot,
    // Screen position of the plush's head (for its speech bubble): centre, radius and horn tip.
    unicornHead() {
      const [sx, sy] = toScreen(PLUSH_AT), [ex] = toScreen(PLUSH_AT.clone().add(new THREE.Vector3(10, 0, 0)));
      const unit = ((ex - sx) / 10) * (PLUSH_H / 124);
      return { x: sx, y: sy - 78 * unit, r: 24.5 * unit, top: sy - 124 * unit };
    },
    // Screen box around the candles including their flames.
    candlesRect() {
      const b = { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 };
      C.candles.forEach(c => {
        const r = screenRect(c.group, true), f = toScreen(c.group.localToWorld(c.base.clone().add(new THREE.Vector3(0, 2.6, 0))));
        b.left = Math.min(b.left, r.left); b.right = Math.max(b.right, r.right); b.top = Math.min(b.top, r.top, f[1]); b.bottom = Math.max(b.bottom, r.bottom);
      });
      return b;
    },
    cakeScreen() {
      const [cx, cy] = toScreen(new THREE.Vector3(0, TOP, 0)), [ex] = toScreen(new THREE.Vector3(R, TOP, 0));
      return { cx, cy, r: ex - cx };
    },
    invalidate,
    // Dev only (used with ?dev=1): magnify the camera to inspect detail.
    debugZoom(z) { camera.zoom = z; camera.updateProjectionMatrix(); invalidate(); },
  };
}
