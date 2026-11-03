// Leather photo album viewer: opens from the album on the table into an open 3D book seen close up. The
// photos are only on the right pages; the view is zoomed onto the right page, the left page peeks in at the
// screen edge. The closed cover already sits where the right page will be, so opening is just the cover
// swinging over to the left. Every page turn (swipe, tap, arrows, keys) flips the right page over onto the
// left, uncovering the next photo.
export const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const pad = n => String(n).padStart(2, "0");
export const thumbSrc = id => `assets/photos/thumb/${pad(id)}.jpg`;
export const fullSrc = id => `assets/photos/full/${pad(id)}.jpg`;
const PASTELS = [["#F3D9D3", "#E6D3E8"], ["#D9E8DF", "#DCE4EE"], ["#F4E6C8", "#EED8C6"], ["#E4DAEE", "#D9E2EC"], ["#EFD9C9", "#F1D6DA"], ["#DCE6EC", "#DCEAE0"]];
export const pastel = id => PASTELS[Math.abs(id - 1) % PASTELS.length];
const svgUrl = (vb, body) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`);

// Pebbled leather: noise used as a height map, lit from the top left, multiplied onto the base color.
const LEATHER = (id, freq, depth) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="5" stitchTiles="stitch"/><feDiffuseLighting surfaceScale="${depth}" diffuseConstant="1.15" lighting-color="#fff"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting><feComposite operator="arithmetic" k1="1" k2="0" k3="0" k4="0" in2="SourceGraphic"/></filter>`;
const LEATHER_TILE = svgUrl("0 0 240 240", `<defs>${LEATHER("l", 0.5, 1.8)}</defs><rect width="240" height="240" fill="#7E4B2E" filter="url(#l)"/>`);
const PAPER_TILE = svgUrl("0 0 200 200", `<defs><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .4 0 0 0 0 .3 -.9 0 0 0 .52"/></filter></defs><rect width="200" height="200" filter="url(#n)"/>`);

export function createAlbum({ anchor, photos, ui, title, dedication, reduced, onPhoto, isBlocked }) {
  const list = [...photos].sort((a, b) => a.id - b.id), n = list.length;
  const label = id => ui.photoAria.replace("{n}", id);
  const btn = anchor.el; // real button placed over the album lying on the table

  // Leaves: the cover (the optional dedication is written on its inside, facing photo 1), then one leaf per
  // photo with the photo on the front (a right page) and a plain back, which lands on the left when turned.
  // f = how many leaves are turned; the right page shows photo f (f >= 1), on leaves[f].
  const FIRST = 1, MAX = n;
  const photoPage = (ph, p) => {
    const [pa, pb] = pastel(ph.id), rot = (((p * 37) % 7) - 3) * 0.6;
    return `<div class="page"><figure class="pg-print" style="--r:${rot.toFixed(1)}deg"><button type="button" class="pg-photo" data-id="${ph.id}" aria-label="${esc(label(ph.id))}"><span class="ph" style="--pa:${pa};--pb:${pb}"><b>${ph.id}</b></span><img alt="" draggable="false"></button><figcaption class="pg-cap">${esc(ph.caption)}</figcaption></figure><span class="pg-num r">${p}</span></div>`;
  };
  const inside = dedication ? `<div class="page dedication"><p class="dedic">${esc(dedication)}</p></div>` : `<div class="page"></div>`;
  let leavesHtml = `<div class="leaf cover"><div class="bf front leather"><div class="stitch"></div><div class="emboss">${esc(title)}</div></div><div class="bf back leather"><div class="cover-page">${inside}</div></div></div>`;
  list.forEach((ph, i) => {
    leavesHtml += `<div class="leaf sheet"><div class="bf front">${photoPage(ph, i + 1)}</div><div class="bf back"><div class="page"></div></div></div>`;
  });

  const view = document.createElement("div");
  view.className = "overlay album-view";
  view.hidden = true;
  view.setAttribute("role", "dialog");
  view.setAttribute("aria-modal", "true");
  view.setAttribute("aria-label", ui.albumAria);
  view.innerHTML = `<div class="scrim"></div><div class="bk-stage"><div class="bk-book closed"><div class="bk-back leather"><div class="endpaper right"></div></div>${leavesHtml}</div></div>
<div class="lb-ui"><button type="button" class="close-btn lb-close">${esc(ui.close)}</button>
<div class="lb-nav"><button type="button" class="lb-arrow prev" aria-label="${esc(ui.prevPage)}">&#8249;</button><span class="lb-count" aria-live="polite"></span><button type="button" class="lb-arrow next" aria-label="${esc(ui.nextPage)}">&#8250;</button></div></div>`;
  document.body.appendChild(view);
  view.style.setProperty("--leather", `url("${LEATHER_TILE}")`);
  view.style.setProperty("--paper", `url("${PAPER_TILE}")`);

  const q = s => view.querySelector(s);
  const stage = q(".bk-stage"), book = q(".bk-book"), leaves = [...view.querySelectorAll(".leaf")];
  const btnClose = q(".lb-close"), btnPrev = q(".prev"), btnNext = q(".next"), count = q(".lb-count");
  const focusables = [btnClose, btnPrev, btnNext];
  let f = 0, isOpen = false, busy = false, lastFocus = null, turnTimers = [], seq = 0;

  // The "camera": one page as large as fits between the close button and the arrows, the spread placed so the
  // right page is centred and the left page runs off the left edge of the screen.
  function size() {
    const vw = innerWidth, vh = innerHeight, pw = Math.min(vw * 0.84, 440, (vh * 0.64) / 1.36), ph = pw * 1.36;
    Object.assign(stage.style, { width: 2 * pw + "px", height: ph + "px", fontSize: pw * 0.06 + "px", left: (vw - pw) / 2 - pw + "px", top: (vh - ph) / 2 - vh * 0.035 + "px" });
  }

  // Load the photos on the right page in view and its neighbours (full size, then thumb, then the placeholder stays).
  // Photo p is on leaves[p].
  function loadImages() {
    for (let p = Math.max(1, f - 1); p <= Math.min(n, f + 2); p++) {
      leaves[p].querySelectorAll("img:not([src])").forEach(img => {
        img.onload = () => img.classList.add("ok");
        img.onerror = () => { if (!img.dataset.t) { img.dataset.t = "1"; img.src = thumbSrc(+img.parentNode.dataset.id); } else img.remove(); };
        img.src = fullSrc(+img.parentNode.dataset.id);
      });
    }
  }

  // Leaves still in flight stay on top (the newest turn highest) until their own turn ends, even when another
  // turn finishes first; otherwise a page in mid-air drops behind the stack for a frame (the flicker).
  // Leaves buried under the top page on either side are hidden, so only a few page layers stay composited.
  function render() {
    leaves.forEach((el, i) => {
      const flipped = i < f, turning = el.classList.contains("turning");
      el.classList.toggle("flipped", flipped);
      el.classList.toggle("buried", !turning && i > 0 && (i < f - 2 || i > f + 1));
      el.style.zIndex = turning ? 300 + +el.dataset.seq : flipped ? 10 + i : 200 - i;
    });
    book.classList.toggle("closed", f === 0);
    count.textContent = f >= FIRST ? `${f} / ${n}` : "";
    btnPrev.disabled = f === 0;
    loadImages();
  }

  function go(nf) {
    nf = Math.max(0, Math.min(MAX, nf));
    if (nf === f) return;
    const turning = nf > f ? f : nf;
    f = nf;
    const el = leaves[turning];
    el.dataset.seq = ++seq;
    el.classList.add("turning");
    render();
    turnTimers.push(setTimeout(() => { el.classList.remove("turning"); render(); }, reduced ? 50 : 880));
  }

  // Forward from the last photo closes the book and puts it back on the table.
  const forward = () => (f >= MAX ? close() : go(f + 1));

  // Jump without animation (used when the zoomed photo viewer closes on another photo).
  function jump(nf) {
    view.classList.add("no-anim");
    f = nf;
    render();
    void book.offsetWidth;
    view.classList.remove("no-anim");
  }

  function flyTransform() {
    // While closed, the cover sits over the right half of the stage (the stage scales around that point).
    const s = anchor.rect(), d = stage.getBoundingClientRect(), pw = d.width / 2;
    const scale = (s.width * 0.72) / pw, turn = anchor.angle ? anchor.angle() : -11;
    return `translate(${(s.left + s.width * 0.5 - (d.left + pw * 1.5)).toFixed(1)}px,${(s.top + s.height * 0.55 - (d.top + d.height / 2)).toFixed(1)}px) rotate(${turn.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
  }

  function open() {
    if (isOpen) return;
    isOpen = busy = true;
    lastFocus = document.activeElement;
    stage.getAnimations().forEach(a => a.cancel()); // never let an earlier fly-back hold the book small and faded
    size();
    jump(0);
    view.hidden = false;
    void view.offsetWidth;
    view.classList.add("open");
    anchor.setVisible(false);
    const kf = reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: flyTransform(), opacity: 0.7 }, { transform: "none", opacity: 1 }];
    stage.animate(kf, { duration: reduced ? 200 : 560, easing: "cubic-bezier(.3,.7,.2,1)" });
    // Open the cover: photo 1 is on its inside.
    turnTimers.push(setTimeout(() => { busy = false; go(FIRST); }, reduced ? 220 : 620));
    btnClose.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (!isOpen || busy) return;
    busy = true;
    turnTimers.forEach(clearTimeout);
    turnTimers = [];
    if (f > 1) jump(1);
    const wasOpen = f > 0;
    if (wasOpen) go(0);
    setTimeout(() => {
      view.classList.remove("open");
      const kf = reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "none", opacity: 1 }, { transform: flyTransform(), opacity: 0.7 }];
      let fly = null;
      const done = () => {
        if (!isOpen) return;
        view.hidden = true;
        // The fly-back fills forwards so the book does not snap back before it is hidden; drop it once hidden,
        // or it keeps overriding the next opening (small, turned and faded in the corner).
        if (fly) fly.cancel();
        anchor.setVisible(true);
        isOpen = busy = false;
        document.removeEventListener("keydown", onKey);
        if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      };
      fly = stage.animate(kf, { duration: reduced ? 180 : 460, easing: "cubic-bezier(.5,0,.75,.4)", fill: "forwards" });
      fly.finished.then(done, done);
      setTimeout(done, reduced ? 260 : 540);
    }, wasOpen && !reduced ? 820 : 0);
  }

  function onKey(e) {
    if (isBlocked && isBlocked()) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") forward();
    else if (e.key === "ArrowLeft") go(f - 1);
    else if (e.key === "Tab") {
      e.preventDefault();
      const live = focusables.filter(b => !b.disabled), i = live.indexOf(document.activeElement);
      live[(i + (e.shiftKey ? -1 : 1) + live.length) % live.length].focus();
    }
  }

  btn.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  btnPrev.addEventListener("click", () => go(f - 1));
  btnNext.addEventListener("click", forward);

  // Touch and mouse anywhere in the viewer: swipe left = turn the page forward (next photo), swipe right = back.
  // A tap on the photo zooms it, on the left edge of the screen turns back, on the right side turns forward,
  // above or below the book closes the album. The close and arrow buttons handle their own clicks.
  let sx = 0, sy = 0, down = false;
  view.addEventListener("pointerdown", e => {
    if (busy || e.target.closest(".lb-ui button")) return;
    down = true; sx = e.clientX; sy = e.clientY;
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: pointerup still bubbles */ }
  });
  view.addEventListener("dragstart", e => e.preventDefault());
  view.addEventListener("pointerup", e => {
    if (!down || busy) return;
    down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.2) return dx < 0 ? forward() : go(f - 1);
    if (Math.hypot(dx, dy) > 10) return;
    const r = stage.getBoundingClientRect();
    if (e.clientX < r.left || e.clientY < r.top || e.clientY > r.bottom) return close();
    // With pointer capture the event target is the viewer, so find what is under the finger.
    const hit = document.elementFromPoint(e.clientX, e.clientY), photo = hit && hit.closest(".pg-photo");
    if (photo && f >= FIRST) return onPhoto(+photo.dataset.id);
    if (e.clientX < innerWidth * 0.3) go(f - 1); else forward();
  });
  view.addEventListener("pointercancel", () => { down = false; });
  stage.addEventListener("click", e => { // keyboard activation of a photo (pointer taps are handled above)
    const photo = e.detail === 0 && e.target.closest(".pg-photo");
    if (photo && f >= FIRST) onPhoto(+photo.dataset.id);
  });
  addEventListener("resize", () => { if (isOpen) size(); });

  return {
    open, close,
    isOpen: () => isOpen,
    // Element to animate the zoomed photo from or back to (only the photo on the right page in view).
    // Photo i (0-based) is on the front of leaf i + 1 (leaf 0 is the cover), the right page when f = i + 1.
    getPhotoEl(id) {
      if (!isOpen) return btn;
      const i = list.findIndex(ph => ph.id === id);
      return i >= 0 && f === i + 1 ? leaves[i + 1].querySelector(".pg-photo") : null;
    },
    showPhoto(id) {
      const i = list.findIndex(ph => ph.id === id);
      if (isOpen && i >= 0 && i + 1 !== f) jump(i + 1);
    },
  };
}
