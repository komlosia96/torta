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
  const tex = toTex(c);
  tex.userData.reveal = revealMap(ctx, L.lines, W, H);
  return tex;
}

// When each pixel of the icing text gets written (world.js reveals it as if piped with cream): letter after letter
// through the sentence, line by line, each letter drawn from its left to its right. The time (0..1) is stored in
// two channels, red the coarse part and green the fine part, so it stays smooth for a long message; it is linear
// in the channels, so the texture's own filtering keeps it right. Spaces take a short pause, not a letter's time.
function revealMap(tctx, lines, W, H) {
  const [c, ctx] = canvas(W, H), cols = [];
  const weight = ch => (/\s/.test(ch) ? 0.45 : /[.,:;!?()]/.test(ch) ? 0.7 : 1);
  let total = 0;
  for (const [line] of lines) total += [...line].reduce((a, ch) => a + weight(ch), 0) + 0.6; // a breath between lines
  let t = 0;
  lines.forEach(([line, y], li) => {
    const top = li ? (lines[li - 1][1] + y) / 2 : 0, bot = li < lines.length - 1 ? (y + lines[li + 1][1]) / 2 : H;
    const chars = [...line], x0 = W / 2 - tctx.measureText(line).width / 2;
    let pre = "", from = 0; // columns left of the line's first letter belong to it
    chars.forEach((ch, i) => {
      const a = x0 + tctx.measureText(pre).width;
      pre += ch;
      const b = x0 + tctx.measureText(pre).width, w = weight(ch);
      cols.push([from, i === chars.length - 1 ? W : b, a, b, t / total, (t + w) / total, top, bot]); // and the last one the columns right of it
      from = b;
      t += w;
    });
    t += 0.6;
  });
  for (const [from, to, a, b, t0, t1, top, bot] of cols) {
    for (let x = Math.floor(from); x < Math.ceil(to); x++) {
      const v = Math.min(0.9999, t0 + (t1 - t0) * Math.min(1, Math.max(0, (x + 0.5 - a) / Math.max(1, b - a))));
      const r = Math.floor(v * 255), g = Math.floor((v * 255 - r) * 255);
      ctx.fillStyle = `rgb(${r},${g},0)`;
      ctx.fillRect(x, top, 1, bot - top);
    }
  }
  const tex = new THREE.CanvasTexture(c); // plain data, no colour space
  tex.letters = total;
  return tex;
}
