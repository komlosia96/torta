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
const BOOK_AT = new THREE.Vector3(-13.5, 0, 17), BOOK_YAW = 0.32, BOOK = [15, 3, 20];
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
    invalidate();
  }

  function placeOverlays() {
    const [sx, sy] = toScreen(PLUSH_AT), [ex] = toScreen(PLUSH_AT.clone().add(new THREE.Vector3(10, 0, 0)));
    const unit = ((ex - sx) / 10) * (PLUSH_H / 124);
    Object.assign(plushHost.style, { left: sx - 100 * unit + "px", top: sy - 136 * unit + "px", width: 200 * unit + "px", height: 150 * unit + "px" });
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
  function render() {
    renderer.shadowMap.needsUpdate = true;
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
    for (const hit of ray.intersectObjects([...cake.slices, C.group, book], true)) {
      const u = hit.object.userData;
      if (u.candle !== undefined) { if (C.candles[u.candle].lit) return o.onCandleTap(u.candle); continue; }
      if (u.k !== undefined) { const i = FRONT.indexOf(u.k); if (i >= 0) o.onSliceTap(i); return; } // the back of the cake ignores taps
      if (book.getObjectById(hit.object.id)) return o.onAlbumTap();
    }
  });

  // ---- slices ----
  let openK = -1, closing = false;
  const clip = new THREE.Plane();
  // The berries on a slice step aside while its message is read, and come back when it is put back.
  function setBerries(s, f) {
    for (const b of s.userData.berries) { b.scale.copy(b.userData.s0).multiplyScalar(Math.max(1e-3, f)); b.visible = f > 0.01; }
  }
  function textMesh(k) {
    const s = cake.slices[k];
    if (s.userData.text) return s.userData.text;
    const r1 = 0.36 * R, r2 = 0.8 * R, hgt = r2 - r1, wid = 2 * r2 * Math.tan(Math.PI / 8) * 0.95;
    const W = 1024, Hp = Math.round((W * hgt) / wid);
    const map = TX.icingText((messages && messages[FRONT.indexOf(k)]) || "", W, Hp, t => (2 * (r2 - t * hgt) * Math.tan(Math.PI / 8) * 0.8) / wid);
    map.anisotropy = aniso;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
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
  function setClip(mesh, p) {
    mesh.updateMatrixWorld();
    const n = new THREE.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld).negate();
    clip.setFromNormalAndCoplanarPoint(n, mesh.localToWorld(new THREE.Vector3(lerp(-0.5, 0.5, p) * mesh.userData.w, 0, 0)));
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
  function openSlice(k) {
    if (openK !== -1) return;
    openK = k;
    const s = cake.slices[k], txt = textMesh(k), lift = liftPose(s), view = viewPose(k), q0 = new THREE.Quaternion();
    s.traverse(m => m.layers.set(1));
    txt.visible = true;
    txt.material.clippingPlanes = reduced ? null : [clip];
    txt.material.needsUpdate = true;
    ov.classList.add("slice-open");
    animate(reduced ? 1 : 1050, t => {
      const e = ease(t);
      s.position.copy(bez(s.userData.pivot, lift.p, view.p, e));
      if (e < 0.3) s.quaternion.slerpQuaternions(q0, lift.q, e / 0.3); else s.quaternion.slerpQuaternions(lift.q, view.q, (e - 0.3) / 0.7);
      setBerries(s, 1 - smooth(0.12, 0.42, t));
      scrimA = 0.58 * Math.min(1, t * 1.5);
      if (!reduced) setClip(txt, 0);
    }, () => {
      if (reduced || openK !== k) return;
      animate(900, t => setClip(txt, t), () => { txt.material.clippingPlanes = null; txt.material.needsUpdate = true; });
    });
  }
  function finish(k) {
    const s = cake.slices[k];
    s.position.copy(s.userData.pivot);
    s.quaternion.identity();
    s.traverse(m => m.layers.set(0));
    if (s.userData.text) s.userData.text.visible = false;
    setBerries(s, 1);
    scrimA = 0;
    openK = -1;
    closing = false;
    ov.classList.remove("slice-open");
  }
  function closeSlice(done) {
    if (openK === -1 || closing) return;
    closing = true;
    const k = openK, s = cake.slices[k], lift = liftPose(s), p0 = s.position.clone(), q0 = s.quaternion.clone(), qe = new THREE.Quaternion();
    if (s.userData.text) { s.userData.text.material.clippingPlanes = null; s.userData.text.material.needsUpdate = true; }
    animate(reduced ? 1 : 750, t => {
      const e = ease(t);
      s.position.copy(bez(p0, lift.p, s.userData.pivot, e));
      if (e < 0.7) s.quaternion.slerpQuaternions(q0, lift.q, e / 0.7); else s.quaternion.slerpQuaternions(lift.q, qe, (e - 0.7) / 0.3);
      if (s.userData.text) s.userData.text.visible = t < 0.55;
      setBerries(s, smooth(0.55, 0.95, t));
      scrimA = 0.58 * (1 - t);
    }, () => {
      finish(k);
      const h = s.userData.heart;
      if (!h.visible) {
        h.visible = true;
        animate(reduced ? 1 : 450, t => h.scale.setScalar(t < 0.7 ? (t / 0.7) * 1.25 : 1.25 - ((t - 0.7) / 0.3) * 0.25));
      }
      if (done) done(k);
    });
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

  addEventListener("resize", fit);
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
    setLights(on) { const from = light, to = on ? 1 : 0; animate(reduced ? 1 : 2200, t => applyLight(lerp(from, to, ease(t)))); },
    shakeSlice(i) {
      const s = cake.slices[FRONT[i]], inner = s.userData.inner, base = inner.position.clone(), t3 = new THREE.Vector3().crossVectors(radial(s.userData.mid), Y);
      animate(reduced ? 1 : 420, t => inner.position.copy(base).addScaledVector(t3, 0.3 * Math.sin(t * Math.PI * 6) * (1 - t)), () => inner.position.copy(base));
    },
    // Slices are addressed by message index here (0), see FRONT.
    openSlice: i => openSlice(FRONT[i]),
    closeSlice: done => closeSlice(done && (k => done(FRONT.indexOf(k)))),
    closeSliceNow() { if (openK !== -1) finish(openK); invalidate(); },
    isSliceOpen: () => openK !== -1,
    resetVisited() { cake.slices.forEach(s => { s.userData.heart.visible = false; }); invalidate(); },
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
