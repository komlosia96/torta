// Lightweight canvas confetti: pastel rectangles, circles, hearts and stars.
const COLORS = ["#F7C9D2", "#FBE3C8", "#F4D58D", "#E9B44C", "#FFFFFF", "#D9C9F0", "#BFE3D3", "#F6A9A0", "#FFE0CC", "#F4B6C2"];

export function createConfetti(canvas) {
  const c = canvas.getContext("2d");
  let parts = [], raf = 0, last = 0, W = 0, H = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(x, y, rain) {
    const a = rain ? Math.PI / 2 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const v = rain ? 40 + Math.random() * 90 : 280 + Math.random() * 460;
    return {
      x: rain ? Math.random() * W : x, y: rain ? -20 - Math.random() * H * 0.35 : y,
      vx: Math.cos(a) * v + (rain ? (Math.random() - 0.5) * 60 : 0), vy: Math.sin(a) * v,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10, spin: Math.random() * 6.28, vs: 3 + Math.random() * 6,
      s: 6 + Math.random() * 6, shape: Math.floor(Math.random() * 4), color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 0, max: 3.2 + Math.random() * 0.6,
    };
  }

  function draw(p) {
    const s = p.s;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.scale(1, Math.cos(p.spin));
    c.globalAlpha = Math.max(0, 1 - (p.life / p.max) ** 3);
    c.fillStyle = p.color;
    c.beginPath();
    if (p.shape === 0) c.rect(-s / 2, -s / 4, s, s / 2);
    else if (p.shape === 1) c.arc(0, 0, s / 2.6, 0, 6.283);
    else if (p.shape === 2) {
      const h = s / 2;
      c.moveTo(0, h * 0.9);
      c.bezierCurveTo(-h * 1.25, h * 0.1, -h * 1.1, -h * 0.95, 0, -h * 0.35);
      c.bezierCurveTo(h * 1.1, -h * 0.95, h * 1.25, h * 0.1, 0, h * 0.9);
    } else {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.22 : s * 0.55, a = (i * Math.PI) / 5 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    c.fill();
    c.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    c.clearRect(0, 0, W, H);
    parts = parts.filter(p => (p.life += dt) < p.max && p.y < H + 40);
    for (const p of parts) {
      p.vy += 520 * dt;
      p.vx -= p.vx * 1.6 * dt;
      p.vy -= p.vy * 1.1 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.spin += p.vs * dt;
      draw(p);
    }
    raf = parts.length ? requestAnimationFrame(frame) : 0;
  }

  function add(list) {
    parts.push(...list);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  addEventListener("resize", resize);
  resize();

  return {
    // Two bursts: from (x, y), then a rain from the top.
    fire(x, y, scale = 1) {
      const n1 = Math.round(95 * scale), n2 = Math.round(65 * scale);
      add(Array.from({ length: n1 }, () => spawn(x, y, false)));
      setTimeout(() => add(Array.from({ length: n2 }, () => spawn(0, 0, true))), 380);
    },
    clear() { parts = []; },
  };
}
