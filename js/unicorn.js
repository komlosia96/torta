// Plush unicorn, a boy: white minky with cool pastel tints, gold horn, blue-green-gold rainbow mane and tail,
// short brows (no blush, no lashes). A little sad before the wish, smiling after it.
// Each part is a pre-rendered SVG image (fabric filters render once), stacked and animated with CSS transforms.
// Art is drawn around the seat point (0,0).
const RAD = Math.PI / 180;
const f1 = n => Math.round(n * 10) / 10;

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const star4 = (x, y, s) => {
  const q = s * 0.25;
  return `M${f1(x)} ${f1(y - s)}L${f1(x + q)} ${f1(y - q)}L${f1(x + s)} ${f1(y)}L${f1(x + q)} ${f1(y + q)}L${f1(x)} ${f1(y + s)}L${f1(x - q)} ${f1(y + q)}L${f1(x - s)} ${f1(y)}L${f1(x - q)} ${f1(y - q)}Z`;
};
export const heartPath = (x, y, s) =>
  `M${f1(x)} ${f1(y + 0.9 * s)}C${f1(x - 1.25 * s)} ${f1(y + 0.1 * s)} ${f1(x - 1.1 * s)} ${f1(y - 0.95 * s)} ${f1(x)} ${f1(y - 0.35 * s)}C${f1(x + 1.1 * s)} ${f1(y - 0.95 * s)} ${f1(x + 1.25 * s)} ${f1(y + 0.1 * s)} ${f1(x)} ${f1(y + 0.9 * s)}Z`;

// Rainbow faux fur in cool tones (no pink), in bands along the mane and tail.
const RAINBOW = ["#6FA8E8", "#73C6DA", "#8ED19C", "#F2CF6B", "#F5AA5E", "#9A86DE"];
const BLUR = (id, s) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${s}"/></filter>`;
// Minky fabric: fuzzy displaced edges plus a fine grain.
const PLUSH = `<filter id="p" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="f"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .5 0 0 0 0 .47 0 0 0 0 .55 .4 0 0 0 -.19" result="g"/><feComposite in="g" in2="f" operator="in" result="gi"/><feMerge><feMergeNode in="f"/><feMergeNode in="gi"/></feMerge></filter>`;
// Long faux fur: stronger displacement so strands frizz.
const FAUX = `<filter id="ff" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter>`;
const FUR = `<radialGradient id="fur" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#F7F5F9"/><stop offset=".82" stop-color="#E4DFEA"/><stop offset="1" stop-color="#C8C0D3"/></radialGradient>`;
const SEAM = `fill="none" stroke="#CFC8D8" stroke-width=".7" stroke-linecap="round"`;

function strands(r, n, root, dir, l0, l1, wMul = 1, cols = RAINBOW) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const t = r(), [x, y] = root(t), a = dir(r()) * RAD, L = l0 + r() * (l1 - l0), c = (r() - 0.5) * 0.7;
    const col = cols[Math.min(cols.length - 1, Math.floor(Math.min(0.999, t * 0.85 + r() * 0.15) * cols.length))];
    s += `<path d="M${f1(x)} ${f1(y)}Q${f1(x + Math.cos(a + c) * L * 0.55)} ${f1(y + Math.sin(a + c) * L * 0.55)} ${f1(x + Math.cos(a) * L)} ${f1(y + Math.sin(a) * L)}" stroke="${col}" stroke-width="${f1((1.6 + r() * 1.6) * wMul)}" opacity="${f1(0.8 + r() * 0.2)}"/>`;
  }
  return s;
}
const TIPS = ["#F2F8FF", "#FFFBEA", "#EEFAF4"];
// Dense faux fur: a soft blurred body, a blurred strand pass for depth, crisp strands, light tips.
const fluff = (r, blobs, sets) => `<g filter="url(#b3)" fill="#9FB8E2">${blobs}</g>
<g filter="url(#b1)" fill="none" stroke-linecap="round" opacity=".9">${sets.map(([n, ro, di, l0, l1]) => strands(r, n, ro, di, l0, l1, 1.4)).join("")}</g>
<g filter="url(#ff)" fill="none" stroke-linecap="round">${sets.map(([n, ro, di, l0, l1]) => strands(r, n, ro, di, l0, l1)).join("")}${sets.map(([n, ro, di, l0, l1]) => strands(r, Math.round(n / 3), ro, di, l0 * 0.6, l1 * 0.7, 0.8, TIPS)).join("")}</g>`;

function tailArt(r) {
  return fluff(r, `<ellipse cx="-48" cy="-20" rx="24" ry="13"/><ellipse cx="-64" cy="-31" rx="12" ry="10"/>`, [
    [80, t => [-33 + t * 9, -22 + t * 14], t => 186 + t * 46, 16, 36],
    [50, t => [-52 + t * 16, -30 + t * 12], t => 195 + t * 55, 8, 18],
  ]);
}

function baseArt() {
  const r = rng(26);
  return `<defs>${PLUSH}${FAUX}${BLUR("b4", 4)}${BLUR("b3", 3)}${BLUR("b2", 2)}${BLUR("b1", 1)}${FUR}
<radialGradient id="muz" cx=".45" cy=".3" r=".75"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".75" stop-color="#F6F2F4"/><stop offset="1" stop-color="#DCD3DD"/></radialGradient>
<linearGradient id="lil" x1="0" x2="1"><stop offset="0" stop-color="#C39A48"/><stop offset=".42" stop-color="#FBE7B0"/><stop offset=".7" stop-color="#E8C676"/><stop offset="1" stop-color="#B58838"/></linearGradient>
<clipPath id="ct"><path d="M-14-55C-28-50-33-22-25-5Q0 2 25-5C33-22 28-50 14-55Z"/></clipPath><clipPath id="ch"><circle cx="0" cy="-78" r="24.5"/></clipPath></defs>
<ellipse cx="0" cy="2" rx="50" ry="8" fill="#2E1A10" opacity=".45" filter="url(#b4)"/>
${tailArt(r)}
<g filter="url(#p)">
  <ellipse cx="-22" cy="-14" rx="16" ry="15" fill="url(#fur)"/><ellipse cx="22" cy="-14" rx="16" ry="15" fill="url(#fur)"/>
  <path d="M-14-55C-28-50-33-22-25-5Q0 2 25-5C33-22 28-50 14-55Z" fill="url(#fur)"/>
  <g clip-path="url(#ct)"><path d="M-14-55C-28-50-33-22-25-5Q0 2 25-5C33-22 28-50 14-55Z" transform="translate(2.5 2)" fill="none" stroke="#9E93AE" stroke-width="9" opacity=".3" filter="url(#b4)"/></g>
  <ellipse cx="-31" cy="-4" rx="10" ry="6.5" fill="url(#fur)"/><ellipse cx="31" cy="-4" rx="10" ry="6.5" fill="url(#fur)"/>
  <path d="M-34-12Q-22-26-10-16M34-12Q22-26 10-16M0-54Q1-46 0-38" ${SEAM}/>
  <path d="M-15-38V-6Q-15 1-9 1Q-3 1-3-6V-36Z" fill="url(#fur)"/><path d="M3-36V-6Q3 1 9 1Q15 1 15-6V-38Z" fill="url(#fur)"/>
  <path d="M-4.5-34V-5M4.5-34V-5" ${SEAM}/>
  <ellipse cx="-9" cy="-1" rx="5.5" ry="1.8" fill="#A69CB4" opacity=".35" filter="url(#b1)"/><ellipse cx="9" cy="-1" rx="5.5" ry="1.8" fill="#A69CB4" opacity=".35" filter="url(#b1)"/>
  <g clip-path="url(#ct)" opacity=".42"><ellipse cx="-13" cy="-32" rx="13" ry="17" fill="#CFE2F7" filter="url(#b4)"/><ellipse cx="13" cy="-22" rx="13" ry="15" fill="#CDEBDD" filter="url(#b4)"/><ellipse cx="0" cy="-47" rx="12" ry="7" fill="#FFF0C6" filter="url(#b4)"/></g>
  <ellipse cx="-9" cy="-3" rx="5.4" ry="3.2" fill="#AFC2E4"/><ellipse cx="9" cy="-3" rx="5.4" ry="3.2" fill="#AFC2E4"/>
  <ellipse cx="-36" cy="-4" rx="4.2" ry="4.8" fill="#BCCBE8"/><ellipse cx="36" cy="-4" rx="4.2" ry="4.8" fill="#BCCBE8"/>
</g>
<ellipse cx="0" cy="-54" rx="19" ry="5" fill="#6E6380" opacity=".35" filter="url(#b2)"/>
<g filter="url(#p)">
  <circle cx="0" cy="-78" r="24.5" fill="url(#fur)"/>
  <g clip-path="url(#ch)"><circle cx="2" cy="-75.5" r="24.5" fill="none" stroke="#9E93AE" stroke-width="8" opacity=".32" filter="url(#b3)"/></g>
  <g clip-path="url(#ch)" opacity=".36"><ellipse cx="-13" cy="-90" rx="12" ry="10" fill="#CFDDF6" filter="url(#b4)"/><ellipse cx="15" cy="-76" rx="10" ry="10" fill="#D3EEE2" filter="url(#b4)"/><ellipse cx="8" cy="-98" rx="9" ry="6" fill="#C8E0F7" filter="url(#b4)"/></g>
  <ellipse cx="-8" cy="-92" rx="10" ry="6" fill="#fff" opacity=".6" filter="url(#b3)"/>
  <ellipse cx="0" cy="-64.5" rx="14.5" ry="10.5" fill="#B8AEC4" opacity=".45" filter="url(#b2)"/>
  <ellipse cx="0" cy="-67" rx="14.5" ry="11" fill="url(#muz)"/>
  <path d="M0-102Q1-90 0-80M-13.5-67Q0-56 13.5-67" ${SEAM}/>
  <path d="M-7.6-72.4q3.2-1.3 3.4 3.6M7.6-72.4q-3.2-1.3-3.4 3.6" fill="none" stroke="#7E6670" stroke-width="1.3" stroke-linecap="round"/>
</g>
<g filter="url(#p)">
  <path d="M-6.5-98Q-4-111-1.6-121Q0-124 1.6-121Q4-111 6.5-98Q0-95.5-6.5-98Z" fill="url(#lil)"/>
  <path d="M-5.6-102Q0-104.5 5-108.5M-4.4-109.5Q0-111.5 3.8-115M-3-116Q0-117.5 2.4-120" fill="none" stroke="#9C7330" stroke-width=".8" opacity=".8"/>
  <path d="M-5.2-101Q0-103.4 4.7-107.2M-4-108.4Q0-110.4 3.5-113.8" fill="none" stroke="#FFF4EA" stroke-width=".7" opacity=".8"/>
</g>`;
}

const earArt = () => `<defs>${PLUSH}${FUR}<linearGradient id="in" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D3E3F8"/><stop offset=".5" stop-color="#B5CCF0"/><stop offset="1" stop-color="#98B3E4"/></linearGradient></defs>
<g filter="url(#p)"><path d="M-6.5 2Q-8-9 0-18Q8-9 6.5 2Q0 4.5-6.5 2Z" fill="url(#fur)"/><path d="M-3.6.5Q-4.4-7 0-13.5Q4.4-7 3.6.5Q0 2-3.6.5Z" fill="url(#in)"/></g>`;

function maneArt() {
  const r = rng(11);
  return `<defs>${FAUX}${BLUR("b3", 3)}${BLUR("b1", 1)}</defs>
${fluff(r, `<ellipse cx="-3" cy="-101" rx="19" ry="11"/><ellipse cx="-22" cy="-76" rx="10" ry="22"/><ellipse cx="-18" cy="-56" rx="8" ry="9"/>`, [
    [60, t => [-20 + t * 6, -74 + t * 22], t => 105 + t * 45, 8, 18],
    [80, t => { const a = (190 + t * 60) * RAD; return [24 * Math.cos(a), -78 + 24 * Math.sin(a)]; }, t => 125 + t * 55, 9, 19],
    [110, t => { const x = (t - 0.55) * 28; return [x, -78 - Math.sqrt(Math.max(0, 600 - x * x)) * 0.93 + 3]; }, t => -128 + t * 56, 8, 18],
  ])}`;
}

const FACE_DEFS = `<defs>${BLUR("b1", 0.8)}<radialGradient id="eye" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#4A4448"/><stop offset=".45" stop-color="#151214"/><stop offset="1" stop-color="#030203"/></radialGradient></defs>`;
// Glossy black bead eye sunk into the fabric
const eye = (x, y, r, dy = 0) => `<circle cx="${x}" cy="${y + 0.6}" r="${r + 0.9}" fill="#8E84A0" opacity=".4" filter="url(#b1)"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#eye)"/>
<path d="M${f1(x + r * 0.2)} ${f1(y + r * 0.92)}A${r} ${r} 0 0 0 ${f1(x + r * 0.92)} ${f1(y + r * 0.2)}" fill="none" stroke="#8A8296" stroke-width=".6" opacity=".7"/>
<ellipse cx="${f1(x - r * 0.33)}" cy="${f1(y - r * 0.36 + dy)}" rx="${f1(r * 0.34)}" ry="${f1(r * 0.26)}" fill="#fff" opacity=".95"/><circle cx="${f1(x + r * 0.36)}" cy="${f1(y + r * 0.35)}" r="${f1(r * 0.14)}" fill="#fff" opacity=".75"/>`;
const THREAD = `fill="none" stroke="#5E4650" stroke-width="1.5" stroke-linecap="round"`;
const SMILE = `<path d="M-9.5-61.5Q0-54.5 9.5-61.5M-9.5-61.5l-1.6-1.3M9.5-61.5l1.6-1.3" ${THREAD}/>`;
// Short stitched brows give him a cheerful, boyish look.
const BROWS = `<path d="M-18.5-89Q-13.5-92.5-8.5-90.5M8.5-90.5Q13.5-92.5 18.5-89" fill="none" stroke="#6E6474" stroke-width="1.7" stroke-linecap="round"/>`;
const happyArt = () => `${FACE_DEFS}${eye(-13, -80, 4.5)}${eye(13, -80, 4.5)}${BROWS}${SMILE}`;
// A little sad before the wish: brows raised in the middle, eyes glancing down, a small stitched frown.
const sadArt = () => `${FACE_DEFS}${eye(-13, -79.5, 4.3, 1.3)}${eye(13, -79.5, 4.3, 1.3)}
<path d="M-18.5-88Q-13.5-89-8.5-92.5M8.5-92.5Q13.5-89 18.5-88" fill="none" stroke="#6E6474" stroke-width="1.7" stroke-linecap="round"/>
<path d="M-6.5-58Q0-61.5 6.5-58" ${THREAD}/>`;
const blinkArt = () => `${FACE_DEFS}<path d="M-17.5-80Q-13-84-8.5-80M8.5-80Q13-84 17.5-80" fill="none" stroke="#1E1A1D" stroke-width="1.5" stroke-linecap="round"/>${BROWS}${SMILE}`;
const glowArt = () => `<defs><radialGradient id="g"><stop offset="0" stop-color="#FFE9C4" stop-opacity=".8"/><stop offset=".55" stop-color="#E9D4FF" stop-opacity=".35"/><stop offset="1" stop-color="#E9D4FF" stop-opacity="0"/></radialGradient></defs><ellipse cx="0" cy="-70" rx="70" ry="62" fill="url(#g)"/>`;

const svgUrl = (vb, body) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}">${body}</svg>`);
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// seat: [x, y] in the scene viewBox; frame: [width, height] of that viewBox.
export function createUnicorn(host, { label, onTap, seat, frame, scale = 1 }) {
  const [SX, SY] = seat, [VW, VH] = frame;
  const place = (el, [x, y, w, h]) => {
    Object.assign(el.style, { left: ((SX + x * scale) / VW) * 100 + "%", top: ((SY + y * scale) / VH) * 100 + "%", width: ((w * scale) / VW) * 100 + "%", height: ((h * scale) / VH) * 100 + "%" });
    return el;
  };
  const part = (cls, vb, body, at = vb) => {
    const im = new Image();
    im.className = "u " + cls;
    im.alt = "";
    im.draggable = false;
    im.decoding = "async";
    im.src = svgUrl(vb, body);
    b.appendChild(place(im, at));
  };
  const inline = (cls, at, vb, body) => {
    b.insertAdjacentHTML("beforeend", `<svg class="u ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`);
    place(b.lastElementChild, at);
  };
  const uni = document.createElement("div");
  uni.className = "uni mood-sad";
  uni.innerHTML = `<div class="uni-wig"><div class="uni-breathe"></div></div>`;
  const wig = uni.firstChild, b = wig.firstChild;
  // Breathing and wiggle pivot on the seat point
  wig.style.transformOrigin = b.style.transformOrigin = `${(SX / VW) * 100}% ${(SY / VH) * 100}%`;
  part("u-glow", [-72, -134, 144, 128], glowArt());
  part("u-mane", [-62, -132, 90, 102], maneArt());
  part("u-ear u-ear-l", [-10, -21, 20, 26], earArt(), [-25.5, -117, 20, 26]);
  part("u-ear u-ear-r", [-10, -21, 20, 26], earArt(), [5.5, -117, 20, 26]);
  part("u-base", [-96, -128, 150, 136], baseArt());
  part("u-face f-sad", [-30, -100, 60, 50], sadArt());
  part("u-face f-happy", [-30, -100, 60, 50], happyArt());
  part("u-face f-blink", [-30, -100, 60, 50], blinkArt());
  inline("u-spark", [-7, -135, 14, 14], "-7 -7 14 14", `<path d="${star4(0, 0, 6)}" fill="#FFF6D8" stroke="#E9B44C" stroke-width=".6"/>`);
  inline("u-heart", [11, -126, 14, 14], "-7 -7 14 14", `<path d="${heartPath(0, 0, 5.5)}" fill="#F27A9A" stroke="#fff" stroke-width=".9"/>`);
  b.insertAdjacentHTML("beforeend", `<button type="button" class="u u-head" aria-label="${label}"></button>`);
  const head = place(b.lastElementChild, [-30, -108, 60, 60]), heart = b.querySelector(".u-heart");
  head.addEventListener("click", () => onTap());
  host.appendChild(uni);
  let blinkTimer = 0;
  return {
    // "sad" (a little, before the wish) or "happy" (after it: smile, ears up, glow and sparkle).
    setMood(m) {
      uni.classList.toggle("party", m === "happy");
      uni.classList.toggle("mood-sad", m !== "happy");
    },
    react(big) {
      wig.classList.remove("wiggle", "nudge");
      if (!big) { restart(wig, "nudge"); return; }
      restart(wig, "wiggle");
      restart(heart, "go");
      uni.classList.add("blink");
      clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => uni.classList.remove("blink"), 170);
    },
  };
}
