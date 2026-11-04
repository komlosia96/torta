// Procedural textures painted on 2D canvases: no image files and no tainted canvases.
import * as THREE from "./vendor/three.module.min.js";
import { rng } from "./unicorn.js";

// Tileable value noise. period is in lattice cells; fbm doubles it per octave.
function makeNoise(seed) {
  const r = rng(seed), perm = new Uint8Array(512), val = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) val[i] = r();
  const at = (x, y) => val[perm[perm[x & 255] + (y & 255)]];
  return (x, y, period = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * u, b = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * u;
    return a + (b - a) * v;
  };
}
const N1 = makeNoise(1), N2 = makeNoise(2), N3 = makeNoise(3);
function fbm(n, x, y, oct = 4, period = 256) {
  let a = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { a += amp * n(x * f, y * f, period * f); sum += amp; amp *= 0.5; f *= 2; }
  return a / sum;
}
const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
// Fill every pixel from fn(x, y) -> [r, g, b, a?]
function paint(w, h, fn) {
  const [c, ctx] = canvas(w, h), img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    const p = fn(x, y);
    d[i] = clamp(p[0]); d[i + 1] = clamp(p[1]); d[i + 2] = clamp(p[2]); d[i + 3] = p.length > 3 ? clamp(p[3]) : 255;
  }
  ctx.putImageData(img, 0, 0);
  return [c, ctx];
}
export function toTex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// Height field (Float32Array w*h) to a tangent-space normal map.
function normalMap(hf, w, h, strength) {
  const [c, ctx] = canvas(w, h), img = ctx.createImageData(w, h), d = img.data;
  const H = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { srgb: false, repeat: true });
}
const field = (w, h, fn) => { const f = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = fn(x, y); return f; };

// Warm polished cherry wood with a rosy undertone (sits well with the coral and rose lights): long, softly wavy grain running left to right, no plank joints.
// The tile covers about 120 x 30 cm of the table.
export function darkWood() {
  const W = 1024, H = 256;
  const [c] = paint(W, H, (x, y) => {
    const warp = fbm(N1, x / 256, y / 64, 3, 4);
    const ring = 0.5 + 0.5 * Math.sin(((y + warp * 70) / H) * Math.PI * 2 * 9);
    const fine = fbm(N3, x / 4, y / 1, 2, 256);
    const blot = fbm(N2, x / 128, y / 32, 3, 8);
    const m = 0.8 + 0.09 * ring + 0.07 * (fine - 0.5) + 0.18 * (blot - 0.5);
    return [122 * m, 54 * m, 50 * m];
  });
  return toTex(c, { repeat: true });
}

// Whipped cream surfaces: soft swirls on top, spatula streaks on the side.
export const creamTop = () => normalMap(field(512, 512, (x, y) => fbm(N1, x / 64, y / 64, 4, 8) * 3 + fbm(N2, x / 14, y / 14, 2, 37) * 0.6), 512, 512, 2.4);
export const creamSide = () => normalMap(field(512, 256, (x, y) => fbm(N1, x / 128, y / 32, 3, 4) * 3 + fbm(N3, x / 40, y / 16, 2, 13) * 0.5), 512, 256, 2.2);

// Inside of the cake for the cut faces: u = centre to rim, v = bottom to top.
export function sponge() {
  const W = 512, H = 400, r = rng(17);
  const layers = [[0, 0.27, "s"], [0.27, 0.37, "f"], [0.37, 0.62, "s"], [0.62, 0.71, "c"], [0.71, 0.9, "s"], [0.9, 1, "c"]];
  const berries = Array.from({ length: 9 }, (_, i) => [(i + 0.3 + r() * 0.4) / 9 * 0.9, 0.32 + (r() - 0.5) * 0.02, 0.035 + r() * 0.015]);
  const [c] = paint(W, H, (x, y) => {
    const u = x / W, v = 1 - y / H;
    if (u > 0.955) { const m = 0.97 + 0.03 * fbm(N2, x / 4, y / 4, 2, 128); return [250 * m, 247 * m, 241 * m]; }
    const L = layers.find(l => v >= l[0] && v <= l[1]) || layers[0];
    if (L[2] === "s") {
      const pore = fbm(N1, x / 2.2, y / 2.2, 3, 233), crumb = fbm(N2, x / 9, y / 9, 3, 57);
      let m = 0.9 + 0.14 * crumb - (pore < 0.32 ? 0.22 : 0) - (pore < 0.25 ? 0.12 : 0);
      const edge = Math.min(v - L[0], L[1] - v) * H;
      if (edge < 3) m *= 0.84 + edge * 0.05;
      return [236 * m, 203 * m, 142 * m];
    }
    if (L[2] === "f") {
      for (const [bu, bv, br] of berries) {
        const dx = (u - bu) / br, dy = (v - bv) / (br * 0.6), d = Math.hypot(dx, dy);
        if (d < 1) { const core = Math.max(0, 1 - Math.hypot(dx * 1.8, dy) * 1.6); return [mix(196, 246, core * 0.8), mix(28, 200, core * 0.7), mix(44, 196, core * 0.7)]; }
      }
    }
    const m = 0.96 + 0.04 * fbm(N3, x / 5, y / 5, 2, 102);
    return [250 * m, 246 * m, 238 * m];
  });
  return toTex(c);
}

// Strawberry skin: u around, v from tip (0) to calyx (1). Seeds sit in small pits.
const SEEDS = (() => {
  const r = rng(23), s = [];
  for (let row = 0; row < 15; row++) for (let k = 0; k < 22; k++) {
    const v = (row + 0.5) / 16, u = (k + (row % 2) * 0.5 + (r() - 0.5) * 0.3) / 22;
    if (v < 0.95) s.push([u, v + (r() - 0.5) * 0.02]);
  }
  return s;
})();
export function berrySkin() {
  const W = 512, H = 256;
  const [c, ctx] = paint(W, H, (x, y) => {
    const v = 1 - y / H, n = fbm(N1, x / 40, y / 30, 3, 13), top = Math.max(0, (v - 0.8) / 0.2);
    const m = 0.86 + 0.24 * n;
    return [mix(205, 236, top) * m, mix(22, 120, top * 0.8) * m, mix(36, 80, top * 0.6) * m];
  });
  for (const [u, v] of SEEDS) {
    const px = u * W, py = (1 - v) * H;
    for (const ox of [-W, 0, W]) {
      ctx.fillStyle = "rgba(110,8,20,.55)"; ctx.beginPath(); ctx.ellipse(px + ox, py, 5, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#EFCB6E"; ctx.beginPath(); ctx.ellipse(px + ox, py, 2.1, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,250,220,.8)"; ctx.beginPath(); ctx.arc(px + ox - 0.6, py - 1, 0.8, 0, 7); ctx.fill();
    }
  }
  const hf = new Float32Array(W * H);
  for (const [u, v] of SEEDS) {
    const px = u * W, py = (1 - v) * H;
    for (let y = -6; y <= 6; y++) for (let x = -7; x <= 7; x++) {
      const d = Math.hypot(x / 7, y / 6);
      if (d < 1) { const i = ((Math.round(py + y) + H) % H) * W + ((Math.round(px + x) + W) % W); hf[i] += d < 0.35 ? 0.5 : -(1 - d) * 1.2; }
    }
  }
  return [toTex(c, { repeat: true }), normalMap(hf, W, H, 1.6)];
}
export function leafTex() {
  const [c] = paint(128, 128, (x, y) => {
    const v = y / 128, vein = Math.abs(x - 64) < 2 ? 0.8 : 1, m = (0.85 + 0.25 * fbm(N1, x / 10, y / 10, 2, 13)) * vein;
    return [mix(76, 46, v) * m, mix(142, 104, v) * m, mix(56, 36, v) * m];
  });
  return toTex(c);
}

// Flame (teardrop with a hot core), soft glow and smoke puff for sprites.
export function flameTex() {
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const [c] = paint(128, 256, (x, y) => {
    const u = (x - 63.5) / 64, t = 1 - y / 256;
    const half = 0.62 * Math.pow(Math.sin(Math.PI * 0.5 * Math.min(1, t * 2.2)), 0.6) * Math.pow(Math.max(0, 1 - t), 0.8) + 1e-4;
    const d = Math.abs(u) / half, a = (1 - ss(0.55, 1.15, d)) * ss(0, 0.1, t);
    const core = (1 - ss(0.2, 0.62, d)) * (1 - ss(0.35, 0.75, t)), blue = (1 - ss(0.3, 0.8, d)) * (1 - ss(0.06, 0.22, t));
    return [255, mix(150, 245, Math.max(core, t * 0.4)) - blue * 60, mix(60, 230, core) + blue * 140, a * 255];
  });
  return toTex(c);
}
export function glowTex(color = "255,190,110") {
  const [c, ctx] = canvas(128, 128), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${color},.9)`); g.addColorStop(0.3, `rgba(${color},.35)`); g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return toTex(c);
}
export function smokeTex() {
  const [c] = paint(128, 128, (x, y) => {
    const d = Math.hypot(x - 64, y - 64) / 64, n = fbm(N1, x / 16, y / 16, 3, 8);
    return [235, 232, 228, Math.max(0, 1 - d) ** 1.6 * (0.4 + 0.6 * n) * 255];
  });
  return toTex(c);
}
// Soft round contact shadow; ring=true darkens a ring (for the base of the cake).
export function shadowTex(ring = false) {
  const [c, ctx] = canvas(256, 256), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  if (ring) { g.addColorStop(0, "rgba(40,22,12,0)"); g.addColorStop(0.78, "rgba(40,22,12,0)"); g.addColorStop(0.83, "rgba(40,22,12,.55)"); g.addColorStop(1, "rgba(40,22,12,0)"); }
  else { g.addColorStop(0, "rgba(30,16,8,.6)"); g.addColorStop(0.6, "rgba(30,16,8,.3)"); g.addColorStop(1, "rgba(30,16,8,0)"); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return toTex(c);
}

// Pebbled brown leather for the album; the cover gets light stitching and an optional gold title.
export function leather({ title = "", cover = false } = {}, w = 512, h = 680) {
  const hf = field(w, h, (x, y) => fbm(N1, x / 3, y / 3, 3, 512) + fbm(N2, x / 18, y / 18, 2, 64) * 0.5);
  const [c, ctx] = paint(w, h, (x, y) => {
    const i = y * w + x, l = Math.max(0, Math.min(1, 0.6 + (hf[i] - hf[i - 1 - w > 0 ? i - 1 - w : i]) * 6)), m = 0.7 + 0.5 * l;
    const edge = Math.min(x, y, w - x, h - y) / 40, e = Math.min(1, 0.7 + edge * 0.3);
    return [118 * m * e, 70 * m * e, 46 * m * e];
  });
  if (cover) {
    ctx.setLineDash([12, 9]); ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(30,12,4,.45)"; ctx.strokeRect(29, 31, w - 56, h - 56);
    ctx.strokeStyle = "#E3C9A4"; ctx.strokeRect(27, 28, w - 56, h - 56);
    ctx.setLineDash([]);
  }
  if (title) {
    ctx.font = `700 ${Math.round(w * 0.36)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(30,12,4,.6)"; ctx.fillText(title, w / 2 + 3, h * 0.5 + 4);
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.65);
    g.addColorStop(0, "#FCE9B8"); g.addColorStop(0.55, "#D3A557"); g.addColorStop(1, "#A97A35");
    ctx.fillStyle = g; ctx.fillText(title, w / 2, h * 0.5);
    ctx.fillStyle = "#D3A557"; ctx.fillRect(w * 0.3, h * 0.3, w * 0.4, 3); ctx.fillRect(w * 0.3, h * 0.7, w * 0.4, 3);
  }
  return toTex(c);
}
export function pageEdges() {
  const [c] = paint(256, 64, (x, y) => { const m = (y % 3 === 0 ? 0.88 : 1) * (0.95 + 0.05 * fbm(N1, x / 8, y, 2, 32)); return [246 * m, 238 * m, 222 * m]; });
  return toTex(c, { repeat: true });
}

// Message written on top of a slice in piped icing. Lines get wider toward the rim.
// widthAt(t) gives the usable width (0..1 of the canvas) for a line centred at height t (0 top, 1 bottom).
// Cake topper card: cream paper with rounded corners, a fine green frame, a small leaf and handwritten text.
// Outside the rounded card the texture is transparent (the material uses alphaTest).
export function signTex(text, W = 512, H = 256) {
  const [c, ctx] = canvas(W, H), r = 34;
  const card = (i, rr) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(i, i, W - 2 * i, H - 2 * i, rr); else ctx.rect(i, i, W - 2 * i, H - 2 * i); };
  card(4, r); ctx.fillStyle = "#FFF7EA"; ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(255,255,255,.5)"); g.addColorStop(1, "rgba(200,170,130,.18)");
  card(4, r); ctx.fillStyle = g; ctx.fill();
  card(18, r - 12); ctx.lineWidth = 5; ctx.strokeStyle = "#7DAA6A"; ctx.stroke();
  const fam = '"Caveat","Patrick Hand",cursive';
  let size = 150;
  ctx.font = `700 ${size}px ${fam}`;
  while (size > 40 && ctx.measureText(text).width > W * 0.66) { size -= 6; ctx.font = `700 ${size}px ${fam}`; }
  const tw = ctx.measureText(text).width, lw = size * 0.5, x0 = (W - tw - lw * 0.9) / 2 + lw * 0.9, y = H * 0.54;
  // Leaf left of the text.
  ctx.save();
  ctx.translate(x0 - lw * 0.55, y - size * 0.05);
  ctx.rotate(-0.7);
  ctx.beginPath(); ctx.moveTo(0, -lw * 0.5); ctx.quadraticCurveTo(lw * 0.42, 0, 0, lw * 0.5); ctx.quadraticCurveTo(-lw * 0.42, 0, 0, -lw * 0.5);
  ctx.fillStyle = "#5E9E4E"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -lw * 0.42); ctx.lineTo(0, lw * 0.62); ctx.lineWidth = 3; ctx.strokeStyle = "#3F7535"; ctx.stroke();
  ctx.restore();
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#2F6B33"; ctx.fillText(text, x0, y);
  return toTex(c);
}

// The little paper note left after the slice is eaten (it lies on the table): warm paper with faint lines and a
// fold, the text handwritten in up to two lines. Drawn at k times the size (laid out in W x H units), because it
// is first shown close up, as big as the screen allows, before it is put down on the table.
export function noteTex(text, W = 512, H = 320, k = 2) {
  const [c, ctx] = canvas(W * k, H * k);
  ctx.scale(k, k);
  ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(190,160,120,.22)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(120,150,200,.22)"; ctx.lineWidth = 2;
  for (let y = H * 0.3; y < H * 0.95; y += H * 0.17) { ctx.beginPath(); ctx.moveTo(W * 0.06, y); ctx.lineTo(W * 0.94, y); ctx.stroke(); }
  const fold = ctx.createLinearGradient(W * 0.5 - 14, 0, W * 0.5 + 14, 0);
  fold.addColorStop(0, "rgba(150,120,90,0)"); fold.addColorStop(0.5, "rgba(150,120,90,.16)"); fold.addColorStop(1, "rgba(150,120,90,0)");
  ctx.fillStyle = fold; ctx.fillRect(W * 0.5 - 14, 0, 28, H);
  const fam = '"Caveat","Patrick Hand",cursive', words = String(text).split(/\s+/).filter(Boolean);
  let size = 120, lines = [String(text)];
  const fit = () => {
    ctx.font = `700 ${size}px ${fam}`;
    if (ctx.measureText(String(text)).width <= W * 0.84) return [String(text)];
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      if (Math.max(ctx.measureText(a).width, ctx.measureText(b).width) <= W * 0.84) return [a, b];
    }
    return null;
  };
  while (size > 30 && !(lines = fit())) size -= 4;
  if (!lines) lines = [String(text)];
  ctx.font = `700 ${size}px ${fam}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#4A3A45";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
  return toTex(c);
}

export function icingText(text, W, H, widthAt) {
  const [c, ctx] = canvas(W, H);
  const fam = '"Caveat","Patrick Hand",cursive';
  const layout = (size, y0 = 0) => {
    ctx.font = `700 ${size}px ${fam}`;
    const words = String(text).split(/\s+/).filter(Boolean), lh = size * 1.05, lines = [];
    let y = y0 + lh / 2, cur = "";
    for (let i = 0; i <= words.length; i++) {
      const w = words[i], test = cur ? cur + " " + (w || "") : w || "";
      const max = widthAt(y / H) * W;
      if (w && ctx.measureText(test).width <= max) { cur = test; continue; }
      if (cur) { lines.push([cur, y]); y += lh; }
      if (!w) break;
      cur = w;
      if (ctx.measureText(w).width > widthAt(y / H) * W) return null;
    }
    return y - lh / 2 <= H ? { lines, height: y - lh / 2 - y0, lh } : null;
  };
  let size = Math.round(H * 0.32), L = null;
  while (size > 18 && !(L = layout(size))) size -= 2;
  if (!L) L = layout(size) || { lines: [[text, H / 2]], height: H, lh: size };
  // Nudge the block toward the middle when it still fits there (lines are re-measured at their real height).
  const centred = layout(size, (H - L.height) * 0.35);
  if (centred) L = centred;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  for (const [line, y] of L.lines) {
    ctx.fillStyle = "rgba(90,20,35,.35)"; ctx.fillText(line, W / 2 + 2, y + 4);
    ctx.lineWidth = size * 0.07; ctx.strokeStyle = "#9E2F48"; ctx.strokeText(line, W / 2, y);
    ctx.fillStyle = "#C8455F"; ctx.fillText(line, W / 2, y);
    ctx.fillStyle = "rgba(255,225,230,.55)"; ctx.fillText(line, W / 2 - 1.5, y - 2);
    ctx.fillStyle = "#C8455F"; ctx.fillText(line, W / 2 + 0.5, y + 0.5);
  }
  // The letters' plain shapes, for finding the middle of each stroke (revealMap).
  const mc = document.createElement("canvas");
  mc.width = W; mc.height = H;
  const m = mc.getContext("2d", { willReadFrequently: true }); // read back below: kept in memory, not on the GPU (a slow read on a phone)
  m.font = ctx.font; m.textAlign = "center"; m.textBaseline = "middle"; m.lineJoin = "round"; m.lineWidth = size * 0.07;
  for (const [line, y] of L.lines) { m.fillText(line, W / 2, y); m.strokeText(line, W / 2, y); }
  const tex = toTex(c);
  tex.userData.reveal = revealMap(m, L.lines, W, H, size);
  return tex;
}

// When each pixel of the icing text gets piped (world.js reveals it against a moving pen time): one round nozzle
// moving at a steady speed along the middle of each stroke, letter after letter through the sentence, line by line.
// The middle lines come from thinning the letters' shapes down to one pixel (Zhang-Suen); each letter's line is
// then walked like a pen: set down at its leftmost free end, it follows the line, going straight on at a fork, and
// when the line runs out it lifts and sets down again at the leftmost end not drawn yet (a crossbar, the rest of a
// loop, an accent). Every pixel of the icing then shows once the pen has passed the nearest point of that line and
// gone on by as far as the pixel lies from it, so the front of the cream is round like a piping tip. (Before, the
// letter flooded from its leftmost point through all its ink at once: a wide front that split at every fork and
// went round both sides of a loop, which read as filling in, not drawing.) The time (0..1) is stored in two
// channels, red the coarse part and green the fine part; it is linear in them, so texture filtering keeps it right.
const NB8 = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];
function* thin(img, list, W) {
  let passes = 0;
  for (let changed = true; changed; passes++) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del = [];
      let n = 0;
      for (const i of list) {
        if (++n % 25000 === 0) yield;
        if (!img[i]) continue;
        const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1], p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) + (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
        if (A !== 1) continue;
        if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(i);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
      yield;
    }
    list = list.filter(i => img[i]);
  }
  list.passes = passes; // about half the stroke's width
  return list;
}
// Making the map is slow (a phone may take a second), so it is done in small steps between frames: revealMap
// returns the texture at once with the work attached, revealStep(tex, ms) does up to ms of it (all of it when no
// time is given) and says whether it is done; the texture is filled in at the end.
export function revealStep(tex, ms = Infinity) {
  const w = tex.userData.work;
  if (!w) return true;
  const end = performance.now() + ms;
  do { if (w.next().done) { tex.userData.work = null; return true; } } while (performance.now() < end);
  return false;
}
function revealMap(mctx, lines, W, H, size) {
  const [c, ctx] = canvas(W, H), tex = new THREE.CanvasTexture(c); // plain data, no colour space
  // No mipmaps: averaging times of neighbouring letters would let an edge of one show early.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.letters = 1;
  tex.soft = 0.001;
  tex.userData.work = revealWork(c, ctx, tex, mctx, lines, W, H, size);
  return tex;
}
function* revealWork(c, ctx, tex, mctx, lines, W, H, size) {
  const N = W * H, cols = [];
  // Which letter each column belongs to (by the font's own advances), line by line.
  lines.forEach(([line, y], li) => {
    const top = li ? (lines[li - 1][1] + y) / 2 : 0, bot = li < lines.length - 1 ? (y + lines[li + 1][1]) / 2 : H;
    const chars = [...line], x0 = W / 2 - mctx.measureText(line).width / 2;
    // A space has no column of its own: it goes to the next letter (an accent leaning over it is that letter's),
    // which waits a moment first.
    let pre = "", from = 0, space = false;
    chars.forEach((ch, i) => {
      pre += ch;
      if (/\s/.test(ch)) { space = true; return; }
      const b = x0 + mctx.measureText(pre).width;
      cols.push({ ch, space, x0: Math.max(0, Math.floor(from)), x1: Math.min(W, Math.ceil(i === chars.length - 1 ? W : b)), y0: Math.max(1, Math.floor(top)), y1: Math.min(H - 1, Math.ceil(bot)), last: i === chars.length - 1 });
      from = b;
      space = false;
    });
  });
  const lab = new Int16Array(N).fill(-1);
  cols.forEach((L, li) => { for (let y = L.y0; y < L.y1; y++) lab.fill(li, y * W + L.x0, y * W + L.x1); });
  yield;
  // The middle lines of the strokes.
  const mk = mctx.getImageData(0, 0, W, H).data, sk = new Uint8Array(N);
  let fg = [];
  yield;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (mk[i * 4 + 3] > 110) { sk[i] = 1; fg.push(i); } }
  yield;
  fg = yield* thin(sk, fg, W);
  const half = fg.passes;
  const nbs = (i, f) => { for (let k = 0; k < 16; k += 2) { const n = i + NB8[k] + NB8[k + 1] * W; if (sk[n]) f(n, NB8[k], NB8[k + 1]); } };
  const deg = i => { let d = 0; nbs(i, () => d++); return d; };
  // Little side twigs that thinning leaves at corners are cut off, so the pen does not lift to draw them.
  const twig = Math.max(3, Math.round(size * 0.09));
  for (const e of fg) {
    if (!sk[e] || deg(e) !== 1) continue;
    const path = [e];
    let cur = e, fork = false;
    for (;;) {
      const next = [];
      nbs(cur, n => { if (!path.includes(n)) next.push(n); });
      if (next.length !== 1) { fork = next.length > 1; break; }
      cur = next[0];
      path.push(cur);
      if (path.length > twig) break;
    }
    if (fork && path.length <= twig) path.slice(0, -1).forEach(i => (sk[i] = 0));
  }
  fg = fg.filter(i => sk[i]);
  yield;
  // The pen: its time is the distance it has travelled, in pixels.
  const time = new Float32Array(N), seen = new Uint8Array(N), per = cols.map(() => []);
  for (const i of fg) if (lab[i] >= 0) per[lab[i]].push(i);
  const LIFT = size * 0.12, SPACE = size * 0.45, LINE = size * 0.6;
  let T = 0, letters = 0;
  const lend = new Float32Array(cols.length);
  for (let li = 0; li < cols.length; li++) {
    const L = cols[li];
    if (per[li].length) letters++;
    let first = true;
    for (;;) {
      const rest = per[li].filter(i => !seen[i]);
      if (!rest.length) break;
      // set down at the leftmost free end not drawn yet (a loop with no end: its leftmost point)
      let start = -1, sx = Infinity;
      for (const i of rest) {
        let d = 0;
        nbs(i, n => { if (lab[n] === li && !seen[n]) d++; });
        const x = i % W;
        if (d <= 1 && x < sx) { sx = x; start = i; }
      }
      if (start < 0) for (const i of rest) { const x = i % W; if (x < sx) { sx = x; start = i; } }
      if (!first) T += rest.length < 4 ? 0 : LIFT;
      first = false;
      let p = start, dx = 1, dy = 0;
      const trail = [p];
      seen[p] = 1; time[p] = T;
      for (;;) {
        let best = -1, bs = -Infinity;
        const cand = [];
        nbs(p, (n, ox, oy) => {
          if (seen[n] || lab[n] !== li) return;
          cand.push(n);
          const s = (ox * dx + oy * dy) / Math.hypot(ox, oy);
          if (s > bs) { bs = s; best = n; }
        });
        if (best < 0) break;
        // pixels of a two-pixel-thick step beside the chosen one are the same line, not a branch
        const bx = best % W, by = (best / W) | 0;
        for (const n of cand) if (n !== best && Math.abs((n % W) - bx) <= 1 && Math.abs(((n / W) | 0) - by) <= 1) { seen[n] = 1; time[n] = T; }
        T += bx !== p % W && by !== ((p / W) | 0) ? Math.SQRT2 : 1;
        seen[best] = 1; time[best] = T;
        trail.push(best);
        const back = trail[Math.max(0, trail.length - 6)];
        const vx = bx - (back % W), vy = by - ((back / W) | 0), vl = Math.hypot(vx, vy) || 1;
        dx = vx / vl; dy = vy / vl;
        p = best;
      }
    }
    lend[li] = T;
    yield;
  }
  for (const i of fg) if (!seen[i]) time[i] = lend[lab[i]]; // anything the pen missed ends its own letter
  // Every pixel: the time of the nearest point of a middle line, plus how far it is from it (the round tip).
  // The tip is a round nozzle as wide as the stroke: a pixel shows as soon as the tip, at any point it has passed,
  // covers it, the soonest over all such points (time there plus the distance to it). Worked out outwards from
  // the lines in order of time (a bucket queue), each pixel keeping the line point that reaches it first. With
  // only its nearest line point, a pixel where two strokes meet waited for the later one, and bits of a letter
  // came in out of order. The reach is the stroke's half width plus its shadow, so it never leaks into a stroke
  // close by.
  const R = half * 1.3 + 6, seed = new Int32Array(N).fill(-1), cost = new Float32Array(N).fill(Infinity), buckets = [];
  const push = (i, c) => { const b = c | 0; (buckets[b] || (buckets[b] = [])).push(i); };
  for (const i of fg) { seed[i] = i; cost[i] = time[i]; push(i, time[i]); }
  let work = 0;
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b];
    if (!list) continue;
    for (let j = 0; j < list.length; j++) {
      if (++work % 8000 === 0) yield;
      const q = list[j], s0 = seed[q], sx = s0 % W, sy = (s0 / W) | 0, qx = q % W, qy = (q / W) | 0, t0 = time[s0], ls = lab[s0];
      for (let k = 0; k < 16; k += 2) {
        const nx = qx + NB8[k], ny = qy + NB8[k + 1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ex = nx - sx, ey = ny - sy, d = Math.sqrt(ex * ex + ey * ey), n = ny * W + nx, c = t0 + d;
        if (d > R || c >= cost[n] - 1e-3 || lab[n] !== ls) continue; // each letter's pixels are its own
        cost[n] = c; seed[n] = s0; push(n, c);
      }
    }
    buckets[b] = null;
  }
  // Ink beyond the tip's reach (the far edge of a shadow, a thick join) shows just after its nearest shown pixel.
  {
    const queue = new Int32Array(N);
    let head = 0, tail = 0;
    for (let i = 0; i < N; i++) if (seed[i] >= 0) queue[tail++] = i;
    while (head < tail) {
      if (++work % 40000 === 0) yield;
      const q = queue[head++], qx = q % W, qy = (q / W) | 0;
      if (cost[q] - time[seed[q]] > 3 * R) continue;
      for (let k = 0; k < 16; k += 2) {
        const nx = qx + NB8[k], ny = qy + NB8[k + 1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (seed[n] >= 0 || lab[n] !== lab[seed[q]]) continue;
        seed[n] = seed[q]; cost[n] = cost[q] + (k === 2 || k === 6 || k === 8 || k === 12 ? 1 : Math.SQRT2); queue[tail++] = n;
      }
    }
  }
  yield;
  // Strictly one letter after another (author rule: no part of a letter before the one before it is finished):
  // each letter's times are moved so it starts only once every pixel of the letter before has shown (its soft
  // round edges included), with a pause for a space or a new line.
  const ink = i => mk[i * 4 + 3] > 0 || (i >= 2 + 4 * W && mk[(i - 2 - 4 * W) * 4 + 3] > 0) || (i + 2 + 2 * W < N && mk[(i + 2 + 2 * W) * 4 + 3] > 0); // the shape, its shadow, its highlight
  const lo = new Float32Array(cols.length).fill(Infinity), hi = new Float32Array(cols.length).fill(-Infinity), base = new Float32Array(cols.length);
  for (let i = 0; i < N; i++) {
    if (seed[i] < 0) continue;
    const li = lab[seed[i]];
    if (cost[i] < lo[li]) lo[li] = cost[i];
    if (cost[i] > hi[li] && ink(i)) hi[li] = cost[i];
  }
  yield;
  let off = 0;
  for (let li = 0; li < cols.length; li++) {
    if (lo[li] === Infinity) continue;
    if (hi[li] < lo[li]) hi[li] = lo[li];
    off += li === 0 ? 0 : cols[li].space ? SPACE : cols[li - 1].last ? LINE : 4;
    base[li] = off - lo[li];
    off += hi[li] - lo[li];
  }
  const total = off + 1;
  const img = ctx.createImageData(W, H), dd = img.data;
  for (let i = 0; i < N; i++) {
    if (i % (W * 24) === 0) yield;
    let v = 0.9999;
    if (seed[i] >= 0) { const li = lab[seed[i]]; v = Math.min(0.9999, (Math.min(cost[i], hi[li]) + base[li]) / total); }
    const r = Math.floor(v * 255);
    dd[i * 4] = r; dd[i * 4 + 1] = Math.floor((v * 255 - r) * 255); dd[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.letters = Math.max(1, letters);
  tex.soft = 2 / total; // the edge of the cream's front: two pixels
  tex.needsUpdate = true;
}
