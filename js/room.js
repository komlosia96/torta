// The twilight backdrop beyond the table: a navy to indigo wall with out-of-focus coral and rose lights (bokeh)
// spread evenly over the whole backdrop, plus a "lights on" dimmer.
// The discs are painted once on a canvas (and again on resize); a few of them gently twinkle.
import { rng } from "./unicorn.js";

// Palette: coral #FB5A3E, rose #DC375A, teal #163E50, navy #1C1C54, indigo #342D77 (lights use light tints of the warm two).
const LIGHTS = ["255,128,98", "238,86,118", "255,168,140", "246,120,150"];
const BACKDROP = 0.66; // fraction of the screen height the backdrop can show (the table covers the rest)

export function buildRoom(sky, { reduced = false } = {}) {
  const cv = document.createElement("canvas"), tw = document.createElement("div"), dim = document.createElement("div");
  cv.className = "bokeh";
  tw.className = "twinkle";
  dim.className = "dim";
  sky.append(cv, tw, dim);

  function draw() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2), r = rng(1104);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    // Disc size follows the size of the cake on screen (about 62% of the width on phones, height bound on wide screens).
    const u = Math.min(0.62 * w, 0.57 * h) * 0.15;
    const disc = (x, y, d, c, a, soft = false) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, d / 2);
      if (soft) { g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); }
      else {
        g.addColorStop(0, `rgba(${c},${a * 0.6})`); g.addColorStop(0.7, `rgba(${c},${a * 0.68})`);
        g.addColorStop(0.9, `rgba(${c},${a * 0.9})`); g.addColorStop(0.97, `rgba(${c},${a * 0.35})`); g.addColorStop(1, `rgba(${c},0)`);
      }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, d / 2, 0, 7); ctx.fill();
    };
    // Faint large glows far behind
    for (let i = 0; i < 7; i++) disc(r() * w, r() * h * BACKDROP, u * (3 + r() * 3), LIGHTS[i % 4], 0.08 + r() * 0.08, true);
    // Even coverage: one disc per cell of a staggered grid, jittered inside its cell, a few cells left empty.
    const spots = [], cell = u * 1.3, rows = Math.ceil((h * BACKDROP) / (cell * 0.87)) + 1, cols = Math.ceil(w / cell) + 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (r() < 0.18) continue;
      const x = (i + (j % 2) * 0.5 - 0.25 + r() * 0.5) * cell, y = (j * 0.87 - 0.2 + r() * 0.45) * cell;
      spots.push([x, y, u * (0.6 + r() * 0.7), LIGHTS[Math.floor(r() * 4)], 0.26 + r() * 0.44]);
    }
    spots.forEach(s => disc(...s));
    // A few discs twinkle on top (CSS opacity only).
    tw.innerHTML = reduced ? "" : spots.filter((s, i) => i % 7 === 3).map(([x, y, d, c]) =>
      `<i class="bk" style="left:${(x - d / 2).toFixed(0)}px;top:${(y - d / 2).toFixed(0)}px;width:${d.toFixed(0)}px;height:${d.toFixed(0)}px;--c:${c};--t:${(3 + r() * 4).toFixed(1)}s;--dl:${(-r() * 6).toFixed(1)}s"></i>`).join("");
  }
  let pending = 0;
  addEventListener("resize", () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(draw); });
  draw();
}
