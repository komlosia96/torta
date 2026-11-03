// Fireworks in the sky above the cake (on a canvas between the bokeh backdrop and the 3D scene, so they never
// cover the cake). A short show of rockets that rise, burst into glittering sparks and fade. The first show after
// the wish is the big one (author request): larger, fuller bursts, more rockets and a finale, with the sky dimmed
// behind them (the canvas' own background, .fireworks.fw-dim) until the last sparks fade.
// Saturated colours (the backdrop is full of soft coral and rose lights, so pastel sparks would vanish into it): [colour, core].
const PALETTES = [
  ["255,70,140", "255,225,240"], // pink
  ["60,190,255", "225,245,255"], // blue
  ["120,230,90", "235,255,225"], // green
  ["255,190,40", "255,248,220"], // gold
  ["175,105,255", "240,228,255"], // violet
  ["255,120,50", "255,236,220"], // orange
];

export function createFireworks(canvas, { lowEnd = false } = {}) {
  const c = canvas.getContext("2d");
  let rockets = [], sparks = [], timers = [], raf = 0, last = 0, W = 0, H = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Scale with the screen: a burst is about a sixth of the width on a phone.
  const unit = () => Math.min(W, H * 0.75) / 400;

  const pick = () => PALETTES[Math.floor(Math.random() * PALETTES.length)];

  // k scales a rocket's burst (1 = the small show, 2 for the big one).
  function launch(k = 1) {
    const u = unit(), x = W * (0.12 + Math.random() * 0.76), top = H * (k > 1 ? 0.2 + Math.random() * 0.16 : 0.07 + Math.random() * 0.22); // big bursts lower, so they are not cut at the top
    rockets.push({ x, y: H * 0.56, tx: x + (Math.random() - 0.5) * 40 * u, ty: top, t: 0, dur: 0.75 + Math.random() * 0.35, trail: [], pal: pick(), k });
    ensure();
  }

  function ring(r, pal, n, speed, round, life, size) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, v = speed * (round ? 0.9 + Math.random() * 0.15 : 0.4 + Math.random() * 0.7);
      sparks.push({ x: r.tx, y: r.ty, px: r.tx, py: r.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: life * (1.2 + Math.random() * 0.7), col: pal[0], core: pal[1], s: size * (1.6 + Math.random() * 1.2), tw: Math.random() * 6 });
    }
  }

  function burst(r) {
    const u = unit(), k = r.k, big = k > 1, n = Math.round((lowEnd ? 34 : 56) * (big ? 1.6 : 1));
    const speed = (95 + Math.random() * 35) * u * k, life = big ? 1.3 : 1, size = u * (big ? 1.35 : 1);
    ring(r, r.pal, n, speed, Math.random() < 0.35, life, size);
    // Big bursts often carry a smaller inner ring in a second colour.
    if (big && Math.random() < 0.6) ring(r, pick(), Math.round(n * 0.45), speed * 0.45, true, life * 0.85, size);
    // A soft flash at the centre
    sparks.push({ x: r.tx, y: r.ty, vx: 0, vy: 0, life: 0, max: big ? 0.55 : 0.4, col: r.pal[0], s: 22 * u * k, flash: true });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    c.clearRect(0, 0, W, H);
    c.lineCap = "round";
    rockets = rockets.filter(r => {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur), e = 1 - (1 - k) * (1 - k), x = r.x + (r.tx - r.x) * e, y = r.y + (r.ty - r.y) * e;
      r.trail.push([x, y]);
      if (r.trail.length > 8) r.trail.shift();
      r.trail.forEach(([tx, ty], i) => {
        c.fillStyle = `rgba(${r.pal[0]},${((i + 1) / r.trail.length) * 0.8})`;
        c.beginPath(); c.arc(tx, ty, 1.6 * unit() * Math.sqrt(r.k), 0, 7); c.fill();
      });
      if (k >= 1) { burst(r); return false; }
      return true;
    });
    sparks = sparks.filter(p => (p.life += dt) < p.max);
    for (const p of sparks) {
      const f = 1 - p.life / p.max;
      if (p.flash) {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
        g.addColorStop(0, `rgba(${p.col},${0.8 * f})`); g.addColorStop(1, `rgba(${p.col},0)`);
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.s, 0, 7); c.fill();
        continue;
      }
      p.vx -= p.vx * 1.8 * dt;
      p.vy -= p.vy * 1.8 * dt;
      p.vy += 38 * unit() * dt; // gentle gravity
      // Short glowing streak behind each spark (from where it was a few frames ago), then a bright core.
      p.px += (p.x - p.px) * 0.35;
      p.py += (p.y - p.py) * 0.35;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.min(1, f * 1.5) * (0.7 + 0.3 * Math.sin(p.tw + p.life * 30)), size = p.s * (0.6 + 0.4 * f);
      c.strokeStyle = `rgba(${p.col},${a * 0.85})`;
      c.lineWidth = size * 1.6;
      c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
      c.fillStyle = `rgba(${p.core},${a})`;
      c.beginPath(); c.arc(p.x, p.y, size * 0.75, 0, 7); c.fill();
    }
    raf = rockets.length || sparks.length ? requestAnimationFrame(frame) : 0;
    if (!raf) c.clearRect(0, 0, W, H);
  }

  function ensure() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
    rockets = [];
    sparks = [];
    canvas.classList.remove("fw-dim");
  }

  addEventListener("resize", resize);
  resize();

  return {
    // A short show: a few rockets in quick succession, then some more, over about six seconds. The big show is
    // longer and fuller (some rockets in pairs, then a finale of four at once) and dims the sky while it lasts.
    show({ big = false } = {}) {
      clear();
      const n = big ? (lowEnd ? 9 : 13) : lowEnd ? 6 : 9, gap = big ? 560 : 650, k = big ? 2 : 1;
      let end = 0;
      for (let i = 0; i < n; i++) {
        const at = i * gap + Math.random() * 300, count = big && (i % 3 === 2 || i === n - 1) ? (i === n - 1 ? 4 : 2) : 1;
        for (let j = 0; j < count; j++) timers.push(setTimeout(() => launch(k), at + j * 90));
        end = at;
      }
      if (big) {
        canvas.classList.add("fw-dim");
        timers.push(setTimeout(() => canvas.classList.remove("fw-dim"), end + 2600)); // the last sparks are fading
      }
    },
    clear,
  };
}
