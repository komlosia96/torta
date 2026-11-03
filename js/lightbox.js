// Enlarged polaroid viewer: FLIP open/close, swipe, arrows, focus trap.
import { esc, thumbSrc, fullSrc, pastel } from "./album.js";

export function createLightbox(el, photos, ui, { getSource, reduced, onBeforeClose }) {
  const list = [...photos].sort((a, b) => a.id - b.id);
  const n = list.length;
  el.setAttribute("aria-label", ui.photoDialog);
  el.innerHTML = `<div class="scrim"></div>
<figure class="lb-card" style="margin:0"><span class="lb-photo"><b></b><img alt="" class="th" decoding="async"><img alt="" class="fu" decoding="async"></span><figcaption class="lb-cap"></figcaption></figure>
<div class="lb-ui"><button type="button" class="close-btn lb-close">${esc(ui.close)}</button>
<div class="lb-nav"><button type="button" class="lb-arrow prev" aria-label="${esc(ui.prevPhoto)}">&#8249;</button><span class="lb-count" aria-live="polite"></span><button type="button" class="lb-arrow next" aria-label="${esc(ui.nextPhoto)}">&#8250;</button></div></div>`;
  const q = s => el.querySelector(s);
  const card = q(".lb-card"), photo = q(".lb-photo"), ph = q(".lb-photo b"), th = q(".th"), fu = q(".fu");
  const cap = q(".lb-cap"), count = q(".lb-count"), btnClose = q(".lb-close"), btnPrev = q(".prev"), btnNext = q(".next");
  const focusables = [btnClose, btnPrev, btnNext];
  let idx = 0, isOpen = false, busy = false, lastFocus = null, token = 0;

  // A photo that is not 4:5 is a print of its own (the photo strip): shown whole, without the polaroid frame.
  function size(ratio) {
    const bare = Math.abs((ratio || 0.8) - 0.8) > 0.03, k = bare ? 1 : 0.92;
    ratio = Math.max(bare ? 0.25 : 0.75, Math.min(1.34, ratio || 0.8));
    card.classList.toggle("bare", bare);
    const vw = innerWidth, vh = innerHeight;
    const w = Math.min(vw * 0.86, 480, (vh * (bare ? 0.7 : 0.58) * ratio) / k);
    card.style.width = w + "px";
    photo.style.height = (w * k) / ratio + "px";
    cap.style.fontSize = Math.max(20, w * 0.075) + "px";
  }

  function show(i) {
    idx = (i + n) % n;
    const p = list[idx], my = ++token, [pa, pb] = pastel(p.id);
    photo.style.setProperty("--pa", pa);
    photo.style.setProperty("--pb", pb);
    ph.textContent = p.id;
    cap.textContent = p.caption || "";
    count.textContent = `${idx + 1} / ${n}`;
    for (const img of [th, fu]) { img.classList.remove("ok"); img.hidden = false; img.removeAttribute("src"); }
    size(0.8);
    th.onload = () => { if (my !== token) return; th.classList.add("ok"); size(th.naturalWidth / th.naturalHeight); };
    th.onerror = () => { if (my === token) th.hidden = true; };
    fu.onload = () => { if (my !== token) return; fu.classList.add("ok"); size(fu.naturalWidth / fu.naturalHeight); };
    fu.onerror = () => { if (my === token) fu.hidden = true; };
    th.src = thumbSrc(p.id);
    fu.src = fullSrc(p.id);
    for (const d of [-1, 1]) { const im = new Image(); im.src = fullSrc(list[(idx + d + n) % n].id); }
  }

  function flipFrom(src) {
    if (!src || reduced) return null;
    const s = src.getBoundingClientRect(), d = card.getBoundingClientRect();
    if (!s.width || !d.width) return null;
    const scale = src.offsetWidth / d.width, rot = parseFloat(src.dataset.rot || 0);
    const dx = s.left + s.width / 2 - (d.left + d.width / 2), dy = s.top + s.height / 2 - (d.top + d.height / 2);
    return `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot}deg) scale(${scale.toFixed(4)})`;
  }

  function open(id) {
    if (isOpen) return;
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return;
    isOpen = true;
    busy = true;
    lastFocus = document.activeElement;
    show(i);
    card.style.transform = "";
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add("open");
    const from = flipFrom(getSource(id));
    const kf = from ? [{ transform: from }, { transform: "translate(0px,0px) rotate(0deg) scale(1)" }] : [{ opacity: 0 }, { opacity: 1 }];
    const dur = from ? 420 : 220, ready = () => { if (el.classList.contains("open")) busy = false; };
    card.animate(kf, { duration: dur, easing: "cubic-bezier(.25,.8,.25,1)" }).finished.then(ready, ready);
    setTimeout(ready, dur + 80); // in case the animation promise never settles
    btnClose.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (!isOpen || busy) return;
    busy = true;
    if (onBeforeClose) onBeforeClose(list[idx].id);
    const from = flipFrom(getSource(list[idx].id));
    const start = card.style.transform || "translate(0px,0px) rotate(0deg) scale(1)";
    el.classList.remove("open");
    const kf = from ? [{ transform: "translate(0px,0px) rotate(0deg) scale(1)" }, { transform: from }] : [{ opacity: 1 }, { opacity: 0 }];
    if (from && card.style.transform) kf[0] = { transform: start };
    const dur = from ? 360 : 200;
    card.animate(kf, { duration: dur, easing: "cubic-bezier(.5,0,.75,.4)", fill: "forwards" }).finished.then(done, done);
    setTimeout(done, dur + 80);
    function done() {
      if (!isOpen) return;
      card.getAnimations().forEach(a => a.cancel());
      card.style.transform = "";
      el.hidden = true;
      isOpen = false;
      busy = false;
      document.removeEventListener("keydown", onKey);
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    }
  }

  function nav(dir) {
    if (!isOpen || busy) return;
    show(idx + dir);
    card.style.transform = "";
    if (!reduced) card.animate([{ transform: `translateX(${dir * 46}px)`, opacity: 0 }, { transform: "translateX(0px)", opacity: 1 }], { duration: 220, easing: "ease-out" });
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") nav(1);
    else if (e.key === "ArrowLeft") nav(-1);
    else if (e.key === "Tab") {
      e.preventDefault();
      const i = focusables.indexOf(document.activeElement);
      focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
    }
  }

  btnClose.addEventListener("click", close);
  btnPrev.addEventListener("click", () => nav(-1));
  btnNext.addEventListener("click", () => nav(1));

  // Swipe left/right to navigate, down to close, tap anywhere (the photo too) to close.
  let sx = 0, sy = 0, drag = false, pid = null;
  el.addEventListener("pointerdown", e => {
    if (!isOpen || busy || e.target.closest("button")) return;
    sx = e.clientX; sy = e.clientY; drag = true; pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch (_) { /* ignore */ }
  });
  el.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== pid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    card.style.transform = Math.abs(dx) > Math.abs(dy)
      ? `translate(${(dx * 0.7).toFixed(1)}px,0px) rotate(${(dx * 0.02).toFixed(2)}deg) scale(1)`
      : `translate(0px,${(Math.max(0, dy) * 0.7).toFixed(1)}px) rotate(0deg) scale(1)`;
  });
  const end = e => {
    if (!drag || e.pointerId !== pid) return;
    drag = false;
    const dx = e.clientX - sx, dy = e.clientY - sy, moved = Math.hypot(dx, dy) > 10;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return nav(dx < 0 ? 1 : -1);
    if (dy > 80 && dy > Math.abs(dx)) return close();
    if (!moved && e.type === "pointerup") return close();
    if (card.style.transform) {
      const t = card.style.transform;
      card.style.transform = "";
      if (!reduced) card.animate([{ transform: t }, { transform: "translate(0px,0px) rotate(0deg) scale(1)" }], { duration: 200, easing: "ease-out" });
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  return { open, close, isOpen: () => isOpen };
}
