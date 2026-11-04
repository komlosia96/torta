// Leather photo album viewer: opens from the album on the table into an open 3D book seen close up. The
// photos are only on the right pages; the view is zoomed onto the right page, the left page peeks in at the
// screen edge. The closed cover already sits where the right page will be, so opening is just the cover
// swinging over to the left. Every page turn (swipe, tap, arrows, keys) flips the right page over onto the
// left, uncovering the next photo.
export const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const pad = n => String(n).padStart(2, "0");
// Bump PHOTO_V whenever the photos change: a phone may still hold an old copy (or the "not found" from before
// the photos existed) under the old address.
const PHOTO_V = 3;
export const thumbSrc = id => `assets/photos/thumb/${pad(id)}.jpg?v=${PHOTO_V}`;
export const fullSrc = id => `assets/photos/full/${pad(id)}.jpg?v=${PHOTO_V}`;
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
  // The back cover, leaves[n + 1]: it looks just like the board under the last page and only ever turns when
  // the book is closed from the back (forward from the last photo).
  leavesHtml += `<div class="leaf back-cover"><div class="bf front leather"><div class="endpaper right"></div></div><div class="bf back leather"><div class="stitch"></div></div></div>`;
  // The closed book as a real 3D box (both covers, the spine and the page edges), used to turn the book over
  // after it is closed from the back, so its thickness shows all the way round.
  const boxHtml = `<div class="bk-closed"><div class="bc bc-front leather"><div class="stitch"></div><div class="emboss">${esc(title)}</div></div><div class="bc bc-back leather"><div class="stitch"></div></div><div class="bc bc-spine leather"></div><div class="bc bc-fore"></div><div class="bc bc-top"></div><div class="bc bc-bot"></div></div>`;

  const view = document.createElement("div");
  view.className = "overlay album-view";
  view.hidden = true;
  view.setAttribute("role", "dialog");
  view.setAttribute("aria-modal", "true");
  view.setAttribute("aria-label", ui.albumAria);
  view.innerHTML = `<div class="scrim"></div><div class="bk-stage"><div class="bk-book closed"><div class="bk-edges"></div><div class="bk-back leather"><div class="endpaper right"></div></div><div class="bk-pages l"></div><div class="bk-pages r"></div>${leavesHtml}${boxHtml}</div></div>
<div class="lb-ui"><div class="lb-nav"><button type="button" class="lb-arrow prev" aria-label="${esc(ui.prevPage)}">&#8249;</button><span class="lb-count" aria-live="polite"></span><button type="button" class="lb-arrow next" aria-label="${esc(ui.nextPage)}">&#8250;</button></div></div>`;
  document.body.appendChild(view);
  view.style.setProperty("--leather", `url("${LEATHER_TILE}")`);
  view.style.setProperty("--paper", `url("${PAPER_TILE}")`);

  const q = s => view.querySelector(s);
  const stage = q(".bk-stage"), book = q(".bk-book"), leaves = [...view.querySelectorAll(".leaf")];
  const blockL = q(".bk-pages.l"), blockR = q(".bk-pages.r"), box = q(".bk-closed");
  // No close button (author request): a tap next to the book, Escape, or turning past the last photo closes it.
  const btnPrev = q(".prev"), btnNext = q(".next"), count = q(".lb-count");
  const focusables = [btnPrev, btnNext];
  let f = 0, isOpen = false, busy = false, lastFocus = null, turnTimers = [], seq = 0;

  // The "camera": one page as large as fits above the arrows, the spread placed so the right page is about
  // centred and the left page runs off the left edge of the screen. On a phone the spread moves right as far as
  // the right edge allows, so enough of the left page shows to read as an open book.
  function size() {
    const vw = innerWidth, vh = innerHeight, pw = Math.min(vw * 0.8, 440, (vh * 0.64) / 1.36), ph = pw * 1.36;
    const side = (vw - pw) / 2, shift = Math.max(0, Math.min(vw * 0.17 - side, side - 16));
    Object.assign(stage.style, { width: 2 * pw + "px", height: ph + "px", fontSize: pw * 0.06 + "px", left: side - pw + shift + "px", top: (vh - ph) / 2 - vh * 0.035 + "px" });
    // The closed book's thickness: the book on the table's own (3 cm on a 15 cm cover), so the two are one book.
    D = Math.round(pw * (anchor.view ? anchor.view().ratio : 0.08));
    stage.style.setProperty("--d", D + "px");
  }
  let D = 0;

  // Page edges on the outer side and the bottom of a page block, a pixel per layer, alternating light and shade.
  const edges = (k, dir) => k ? [...Array(k)].map((_, j) => `${dir * (j + 1)}px ${j + 1}px 0 ${j % 2 ? "#CFC1A8" : "#EEE5D4"}`).concat(`0 2px 6px rgba(40,20,5,.3)`).join(",") : "none";

  // Load the photos on the right page in view and its neighbours (full size, then thumb, then the placeholder stays).
  // Photo p is on leaves[p]. A photo only shows once decoded, so it never pops in while its page turns.
  // A photo that is not 4:5 is a print of its own (the photo strip): it goes on the page bare, in its own
  // shape, taped like the polaroids but without the white frame.
  function loadImages() {
    for (let p = Math.max(1, f - 1); p <= Math.min(n, f + 3); p++) {
      leaves[p].querySelectorAll("img:not([src])").forEach(img => {
        img.onload = () => (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => {
          const ar = img.naturalWidth / img.naturalHeight, print = img.closest(".pg-print");
          print.classList.toggle("bare", Math.abs(ar - 0.8) > 0.03);
          print.style.setProperty("--ar", ar.toFixed(4));
          img.classList.add("ok");
        });
        img.onerror = () => { if (!img.dataset.t) { img.dataset.t = "1"; img.src = thumbSrc(+img.parentNode.dataset.id); } else img.remove(); };
        img.src = fullSrc(+img.parentNode.dataset.id);
      });
    }
  }

  // Leaves still in flight stay on top (the newest turn highest) until their own turn ends, even when another
  // turn finishes first; otherwise a page in mid-air drops behind the stack for a frame (the flicker).
  // Leaves buried under the top page on either side are hidden, so only a few page layers stay composited.
  function render() {
    const top = Math.min(f, n + 1); // f is n + 2 once the back cover is turned, but the last page stays on the left too
    leaves.forEach((el, i) => {
      const flipped = i < f, turning = el.classList.contains("turning");
      el.classList.toggle("flipped", flipped);
      el.classList.toggle("buried", !turning && i > 0 && (i < top - 2 || i > top + 1));
      el.style.zIndex = turning ? 300 + +el.dataset.seq : flipped ? (i ? 12 + i : 10) : 200 - i;
    });
    // The left block lies on the open cover (z 10) under the turned pages, the right one under the unturned.
    const thick = pages => (pages > 0 ? 1 + Math.round((4 * pages) / n) : 0);
    blockL.style.boxShadow = edges(thick(f - 1), -1);
    blockR.style.boxShadow = edges(thick(n - f), 1);
    book.classList.toggle("closed", f === 0);
    count.textContent = f >= FIRST && f <= n ? `${f} / ${n}` : "";
    btnPrev.disabled = f === 0;
    loadImages();
  }

  function go(nf) {
    nf = Math.max(0, Math.min(MAX, nf));
    if (nf === f || busy) return; // no turns while the book opens or closes
    const turning = nf > f ? f : nf;
    f = nf;
    const el = leaves[turning];
    el.dataset.seq = ++seq;
    el.classList.add("turning");
    render();
    turnTimers.push(setTimeout(() => { el.classList.remove("turning"); render(); }, reduced ? 50 : 880));
  }

  // Stop every turn in flight, so no leaf is left marked as turning (it would stay on top and never be hidden).
  function settle() {
    turnTimers.forEach(clearTimeout);
    turnTimers = [];
    leaves.forEach(el => el.classList.remove("turning"));
  }

  // Close the book where it is, like a real one: the whole left stack (the cover, the pages under it and any
  // page still in the air) swings back over onto the right in one go. While it rises the top page of the stack
  // is drawn on top; once it is past upright (about 307 ms into the 850 ms turn) the cover is, so it lands
  // outermost. The page lying on the right (leaf f) is held too, so it stays in view until the stack covers it.
  // Pages buried in the stack stay hidden and just change sides.
  function shut() {
    const ids = [...new Set([0, f - 2, f - 1, f, ...leaves.map((el, i) => (el.classList.contains("turning") ? i : -1))])]
      .filter(i => i >= 0 && i < leaves.length).sort((a, b) => a - b);
    settle();
    const order = list => list.forEach(i => { leaves[i].dataset.seq = ++seq; });
    order(ids);
    ids.forEach(i => leaves[i].classList.add("turning"));
    f = 0;
    render();
    if (reduced) { settle(); render(); return; }
    turnTimers.push(setTimeout(() => { order([...ids].reverse()); render(); }, 307));
    turnTimers.push(setTimeout(() => { settle(); render(); }, 880));
  }

  // Forward from the last photo closes the book from the back and puts it back on the table.
  const forward = () => (f >= MAX ? closeBack() : go(f + 1));

  // Jump without animation (used when the zoomed photo viewer closes on another photo).
  function jump(nf) {
    view.classList.add("no-anim");
    f = nf;
    render();
    void book.offsetWidth;
    view.classList.remove("no-anim");
  }

  // The closed book as a 3D box (.bk-closed): turned about its middle (sh 50) or its spine (sh 0), pushed back
  // by z, tilted and turned. One list of functions throughout, so any two poses blend smoothly.
  const boxT = (sh, z, rx, ry, rz) => `translateX(${sh}%) translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) translateX(${-sh}%)`;
  // Flat, front up, its front cover just where the flat book's is (so the two can swap unseen).
  const boxFlat = () => boxT(50, -D / 2, 0, 0, 0);
  // Where it lies on the table: the box seen the way the camera sees the book there (world.js albumAnchor.view):
  // tilted back as far as the camera looks down on it and turned in its own plane so its front edge runs as the
  // table book's does on screen, the stage moved and scaled so it sits on it at its size; the thickness is the
  // real book's, so the front side shows just as tall. (Flat and face-on, with a few pixels of page edges, it
  // got visibly thicker the moment the table book took over, author.)
  function landing() {
    const d = stage.getBoundingClientRect(), pw = d.width / 2, v = anchor.view(), DEG = Math.PI / 180;
    const phi = Math.atan(Math.tan(v.angle * DEG) / Math.cos(v.tilt * DEG)) / DEG;
    const scale = v.edge / (D * Math.sin(v.tilt * DEG));
    return {
      stage: `translate(${(v.cx - (d.left + pw * 1.5)).toFixed(1)}px,${(v.cy - (d.top + d.height / 2)).toFixed(1)}px) scale(${scale.toFixed(3)})`,
      box: boxT(50, -D / 2, v.tilt.toFixed(1), 0, phi.toFixed(1)),
    };
  }
  let boxNow = "";

  function open() {
    if (isOpen || (isBlocked && isBlocked())) return;
    isOpen = busy = true;
    lastFocus = document.activeElement;
    stage.getAnimations().forEach(a => a.cancel()); // never let an earlier fly-back hold the book small and faded
    settle();
    size();
    box.getAnimations().forEach(a => a.cancel());
    book.classList.remove("from-back", "as-box");
    // The same covers as the book on the table, as its light shows them (world.js makeCoverLook), so the book
    // that opens and the one put back are one book. Without them it keeps its own leather.
    const look = anchor.look && anchor.look();
    if (look) {
      view.style.setProperty("--cover", `url("${look.cover}")`);
      view.style.setProperty("--leather", `url("${look.plain}")`);
      view.style.setProperty("--spine", `url("${look.spine}")`);
    }
    view.classList.toggle("has-look", !!look);
    jump(0); // always opens on photo 1
    view.hidden = false;
    void view.offsetWidth;
    view.classList.add("open");
    anchor.setVisible(false);
    // Solid all the way (a see-through book looked like an empty cover with no pages). It lifts off the table as
    // the box lying just as the table book does, and becomes the flat book once it is up (the cover opens then).
    if (reduced) stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    else {
      const L = landing(), timing = { duration: 560, easing: "cubic-bezier(.3,.7,.2,1)" };
      book.classList.add("as-box");
      stage.animate([{ transform: L.stage }, { transform: "none" }], timing);
      box.animate([{ transform: L.box }, { transform: boxFlat() }], timing);
      turnTimers.push(setTimeout(() => { book.classList.remove("as-box"); box.getAnimations().forEach(a => a.cancel()); }, 580));
    }
    // Open the cover: photo 1 is on its inside.
    turnTimers.push(setTimeout(() => { busy = false; go(FIRST); }, reduced ? 220 : 620));
    btnNext.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey);
  }

  // Closes on the page it is on (no jump back to photo 1 first), then flies back to the table.
  function close() {
    if (!isOpen || busy) return;
    busy = true;
    const wasOpen = f > 0;
    if (wasOpen) shut(); else settle();
    setTimeout(() => flyBack("none"), wasOpen && !reduced ? 820 : 0);
  }

  // Forward from the last photo closes the book like a real one read to the end: the last page and the back
  // cover swing over onto the left together (the page on top while they rise, the back cover once past
  // upright, so it lands outermost), then the closed book turns over, front up, and flies back to the table.
  // The back cover leaf stands in for the board under the right page while it turns (.from-back hides it).
  function closeBack() {
    if (!isOpen || busy) return;
    if (reduced) return close();
    busy = true;
    const pw = stage.getBoundingClientRect().width / 2, last = leaves[n], back = leaves[n + 1];
    settle();
    book.classList.add("from-back");
    [back, last].forEach(el => { el.dataset.seq = ++seq; el.classList.add("turning"); });
    f = n + 2;
    render();
    turnTimers.push(setTimeout(() => { back.dataset.seq = ++seq; render(); }, 307));
    // Once the back cover has landed, the closed book (back up, on the left half) becomes the 3D box and turns
    // over on its spine towards the viewer in one smooth motion (one ease, transform only, so it runs on the
    // compositor), lifting a little at the middle; it ends front up, still tilted a few degrees so its real spine,
    // fore-edge and bottom pages stay in view, and flies back to the table from there.
    turnTimers.push(setTimeout(() => {
      [back, last].forEach(el => el.classList.remove("turning")); // not settle(): it would cancel the steps below
      render();
      book.classList.add("as-box");
      boxNow = boxT(0, 0, 15, -19, 0);
      box.animate([
        { transform: boxT(0, 0, 0, -180, 0) },
        { transform: boxT(0, Math.round(pw * 0.22), 8, -99, 0), offset: 0.5 },
        { transform: boxNow },
      ], { duration: 1200, easing: "cubic-bezier(.42,0,.32,1)", fill: "forwards" });
    }, 880));
    turnTimers.push(setTimeout(() => flyBack("none"), 880 + 1200 + 150));
  }

  // The closed book flies back to the table (from `from`, the transform it is shown at), then the viewer hides.
  function flyBack(from) {
    view.classList.remove("open");
    // It stays solid while it flies (see-through, it looked like an empty cover with no pages); the book on the
    // table shows again just before it lands, so it only fades over its own copy in the last moment.
    // As the box, which settles onto the table lying just as the book there does (landing()).
    let kf = [{ opacity: 1 }, { opacity: 0 }], boxFly = null;
    if (!reduced) {
      const L = landing(), start = book.classList.contains("as-box") ? boxNow : boxFlat();
      book.classList.add("as-box");
      kf = [{ transform: from, opacity: 1 }, { opacity: 1, offset: 0.85 }, { transform: L.stage, opacity: 0 }];
      boxFly = box.animate([{ transform: start }, { transform: L.box }], { duration: 460, easing: "cubic-bezier(.5,0,.75,.4)", fill: "forwards" });
    }
    let fly = null;
    if (!reduced) setTimeout(() => { if (isOpen) anchor.setVisible(true); }, 380);
    const done = () => {
      if (!isOpen) return;
      view.hidden = true;
      // The fly-back fills forwards so the book does not snap back before it is hidden; drop it once hidden,
      // or it keeps overriding the next opening (small, turned and faded in the corner).
      if (fly) fly.cancel();
      if (boxFly) box.getAnimations().forEach(a => a.cancel());
      book.classList.remove("as-box");
      anchor.setVisible(true);
      isOpen = busy = false;
      document.removeEventListener("keydown", onKey);
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    };
    fly = stage.animate(kf, { duration: reduced ? 180 : 460, easing: "cubic-bezier(.5,0,.75,.4)", fill: "forwards" });
    fly.finished.then(done, done);
    setTimeout(done, reduced ? 260 : 540);
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
  btnPrev.addEventListener("click", () => go(f - 1));
  btnNext.addEventListener("click", forward);

  // Touch and mouse anywhere in the viewer: swipe left = turn the page forward (next photo), swipe right = back.
  // A tap on the photo zooms it, elsewhere on the left of the book turns back, elsewhere on the right turns
  // forward, and next to the book (above, below or right of it) closes the album. The arrows handle their own
  // clicks.
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
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return close();
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
