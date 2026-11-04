// Boot, state machine and wiring.
import { CONTENT } from "./content.js";
import { createWorld } from "./world.js";
import { createAlbum } from "./album.js";
import { buildRoom } from "./room.js";
import { createLightbox } from "./lightbox.js";
import { startBlow, stopBlow } from "./blow.js";
import * as audio from "./audio.js";
import { createConfetti } from "./confetti.js";
import { createFireworks } from "./fireworks.js";
import { createConcert } from "./concert.js";

const C = CONTENT, U = C.ui;
const $ = id => document.getElementById(id);
const DEV = new URLSearchParams(location.search).get("dev") === "1";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement, body = document.body;
const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Messenger|MicroMessenger|Snapchat|TikTok|; wv\)/i.test(navigator.userAgent);
let lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
if (lowEnd) root.classList.add("lowend");

// Content validation: warn, but always render.
const messages = Array.isArray(C.sliceMessages) ? C.sliceMessages : [];
const photos = Array.isArray(C.photos) ? C.photos : [];
if (messages.length !== 1) console.warn(`[torta] content.js: sliceMessages should have exactly 1 item (the front slice), found ${messages.length}.`);
if (photos.length !== 26) console.warn(`[torta] content.js: photos should have exactly 26 items, found ${photos.length}.`);
const ids = photos.map(p => p.id);
if (new Set(ids).size !== ids.length) console.warn("[torta] content.js: photo ids must be unique, found duplicates.");
const candleNumber = String(C.candleNumber || "26").replace(/\D/g, "").slice(0, 3) || "26";
const albumCfg = C.album || {};

const blowBtn = $("blowBtn"), hint = $("hint"), hint2 = $("hint2"), meter = $("meter"), bars = [...meter.children];
const muteBtn = $("muteBtn"), toastEl = $("toast"), soundHint = $("soundHint");
const say = $("say"), sayText = $("sayText"), sayTail = $("sayTail"), sparkHost = $("sparkHost"), allText = $("allText");
const sliceLayer = $("sliceLayer");

document.title = C.pageTitle;
root.lang = C.lang || "hu";
sayText.textContent = C.intro.text;
blowBtn.textContent = U.blowButton;
const resetBtn = $("resetBtn");
resetBtn.setAttribute("aria-label", U.restart);
resetBtn.title = U.restart;
muteBtn.setAttribute("aria-label", U.soundOff);
muteBtn.title = U.soundOff;
soundHint.textContent = U.soundHint;
$("turnBackText").textContent = U.turnBack;

const S = { WISH: "WISH", BLOWING: "BLOWING", CELEBRATE: "CELEBRATE", PLAY: "PLAY" };
// Before the candles are out only the buttons answer (author rule): the blow button, reset and sound; the
// candles themselves once the blow button has been tapped (the hint then says to tap them if blowing does not
// work). The album, Ákos and the slice do nothing until then.
const beforeWish = () => state === S.WISH || state === S.BLOWING;
let state = S.WISH, timers = [], heartTimer = 0, toastTimer = 0, muted = false, soundHintShown = false, allDone = false, uniTaps = 0;
const visited = new Set();
const later = (ms, fn) => timers.push(setTimeout(fn, ms));

const hasDvh = window.CSS && CSS.supports("height", "100dvh");
function layout() {
  if (!hasDvh) $("app").style.height = innerHeight + "px"; // older iOS: 100vh hides behind the toolbar
}
addEventListener("resize", layout);
layout();
buildRoom($("sky"), { reduced });
blowBtn.disabled = true;

const world = await createWorld({
  stage: $("stage"), ov: $("ov"), ui: U, messages, number: candleNumber, topper: C.topper == null ? "" : String(C.topper), shirt: C.unicornShirt == null ? "" : String(C.unicornShirt), albumTitle: albumCfg.title || "", reduced, lowEnd,
  plateNote: C.plateNote || "",
  onSliceTap, onCandleTap, onUnicornTap, onAlbumTap: () => album.open(),
  onNoteTap: () => { if (state === S.PLAY && !album.isOpen() && !lightbox.isOpen()) showNote(); },
  // Where the note lies on the table: the middle of the screen, halfway between the album and the text below.
  noteSpot: () => { const a = world.albumAnchor.rect(), t = $("action").getBoundingClientRect(); return { x: innerWidth / 2, y: (a.top + a.height + t.top) / 2 }; },
});
if (!world) {
  hint.textContent = U.noWebgl;
  throw new Error("[torta] WebGL is not available");
}
blowBtn.disabled = false;
const cake = world;
if (DEV) window.__world = world;
const album = createAlbum({
  anchor: world.albumAnchor, photos, ui: U, reduced,
  title: albumCfg.title || "", dedication: albumCfg.dedication || "",
  onPhoto: id => lightbox.open(id),
  // Not before the candles are out (author rule: until then only the buttons do anything), nor over the lightbox.
  isBlocked: () => lightbox.isOpen() || beforeWish(),
});
const lightbox = createLightbox($("lightbox"), photos, U, {
  getSource: id => album.getPhotoEl(id), reduced,
  onBeforeClose: id => album.showPhoto(id),
});
const confetti = createConfetti($("confetti"));
// Fireworks in the sky: the big show (dimmed sky) the moment the candles go out.
// Not tied to the song: on a phone the song can still be downloading (or fail), and the show must never wait.
const fireworks = createFireworks($("fireworks"), { lowEnd });

// Every third tap on Ákos after the wish he asks whether he should sing. "Nem" just closes the question (three
// more taps ask again); "Igen" starts his concert, during which nothing else plays or reacts.
const concert = createConcert({
  unicorn: cake.unicorn, audio, reduced,
  onStart() { fireworks.clear(); confetti.clear(); document.querySelectorAll(".kisses").forEach(e => e.remove()); },
  onEnd() { uniTaps = 0; },
});
const ask = $("ask"), askYes = $("askYes"), askNo = $("askNo");
$("askText").textContent = U.singAsk;
askYes.textContent = U.singYes;
askNo.textContent = U.singNo;
function askToSing() {
  if (state !== S.PLAY || concert.isActive() || album.isOpen() || lightbox.isOpen() || world.isSliceOpen()) return;
  concert.prepare();
  ask.hidden = false;
  placeAsk();
  void ask.offsetWidth;
  ask.classList.add("open");
  askYes.focus({ preventScroll: true });
}
// The card sits well above his head (author rule): she keeps tapping him, and a tap meant for him must never
// land on "Nem". Centred if that is high enough already, never above the round buttons at the top.
function placeAsk() {
  const card = ask.querySelector(".ask-card"), h = world.unicornHead(), ch = card.offsetHeight;
  const top = Math.max(76, Math.min((innerHeight - ch) / 2, h.y - h.r * 2.3 - 28 - ch));
  card.style.marginTop = top + "px";
}
function closeAsk() {
  ask.classList.remove("open");
  ask.hidden = true;
}
askYes.addEventListener("click", () => { closeAsk(); uniTaps = 0; concert.start(); }); // inside the tap: iOS lets the song start
askNo.addEventListener("click", () => { closeAsk(); uniTaps = 0; });
// A tap beside the card is a no, except on Ákos himself: tapping him again must not answer it.
const onUnicorn = e => { const r = document.querySelector(".uni-host").getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom; };
ask.addEventListener("click", e => { if (e.target === ask && !onUnicorn(e)) { closeAsk(); uniTaps = 0; } });
ask.addEventListener("keydown", e => { if (e.key === "Escape") { closeAsk(); uniTaps = 0; } });

// The unicorn's speech bubble sits just above its head (or above the candle flames when it would cover
// them), with a curved tail pointing at the head. Re-placed on resize and whenever its text changes.
function placeSay() {
  const W = innerWidth, head = world.unicornHead(), cr = world.candlesRect();
  const w = Math.min(300, Math.max(176, W * 0.5));
  say.style.width = w + "px";
  // Prefer a spot right of the candles (wide screens); on narrow phones it goes above the flames instead.
  const right = Math.min(W - 10, Math.max(head.x + w * 0.3, w + 10, cr.right + 10 + w)), left = right - w, h = say.offsetHeight;
  let bottom = head.top - 16;
  if (left < cr.right + 10 && bottom - h < cr.bottom) bottom = Math.min(bottom, cr.top - 14);
  const top = Math.max(56, bottom - h); // clear of the reset and mute buttons
  say.style.left = left + "px";
  say.style.top = top + "px";
  // The tail leaves the bubble on the right, curves down past the right side of his head (away from the cake)
  // and ends just outside his cheek, level with the mouth, so it covers neither the cake nor his face.
  const by = top + h - 1, bx = Math.min(right - 26, Math.max(left + 26, head.x + head.r * 1.5));
  const tx = head.x + head.r * 0.98, ty = head.y + head.r * 0.72, cx = Math.max(bx, head.x + head.r * 2), cy = (by + ty) / 2;
  sayTail.firstChild.setAttribute("d", `M${bx - 12} ${by}Q${cx - 6} ${cy} ${tx} ${ty}Q${cx + 8} ${cy} ${bx + 12} ${by}Z`);
  say.classList.add("on");
  sayTail.classList.add("on");
}
addEventListener("resize", placeSay);
placeSay();
document.fonts.ready.then(placeSay);

// Reading a slice: the 3D view does the animation; this layer adds the close button and tap-to-close. A tap on
// the slice itself takes a bite (world.biteSlice); once it is all eaten, only a paper note is left (it then
// lies on the table, and a tap on it shows it here again).
sliceLayer.tabIndex = -1;
sliceLayer.innerHTML = `<div class="scrim"></div><p class="bite-hint">${U.biteHint}</p><div class="plate" aria-live="polite"><p class="plate-note"></p></div>`;
const plate = sliceLayer.querySelector(".plate");
plate.querySelector(".plate-note").textContent = C.plateNote || "";
let sliceKey = null;
function openSlice(k) {
  if (world.isSliceOpen() || sliceLayer.classList.contains("open")) return;
  // Already eaten: its empty place does nothing (author rule); only the note on the table opens.
  if (world.isEaten(k)) return;
  sliceLayer.classList.remove("bitten", "eaten", "plate-only", "note3d", "hint-on");
  // The bite hint only shows once the message is written on the slice (author rule).
  world.openSlice(k, () => { if (sliceLayer.classList.contains("open")) sliceLayer.classList.add("hint-on"); });
  body.classList.add("reading");
  sliceLayer.setAttribute("role", "dialog");
  sliceLayer.setAttribute("aria-modal", "true");
  sliceLayer.setAttribute("aria-label", messages[k] || "");
  sliceLayer.hidden = false;
  void sliceLayer.offsetWidth;
  sliceLayer.classList.add("open");
  sliceLayer.focus({ preventScroll: true }); // no close button (author rule): a tap anywhere but the slice, or Escape, closes it
  sliceKey = e => { if (e.key === "Escape") closeSlice(); else if (e.key === "Tab") e.preventDefault(); };
  document.addEventListener("keydown", sliceKey);
}
// The note on its own (tapped on the table, or the eaten slice's place): the paper shows over a blurred, dimmed
// page, the same scrim as the album view (author rule: nothing disappears, the speech bubble and the text included).
function showNote() {
  if (world.isSliceOpen() || sliceLayer.classList.contains("open")) return;
  sliceLayer.classList.remove("bitten", "note3d");
  sliceLayer.classList.add("eaten", "plate-only");
  // The same note as the one first held up (author rule): the 3D view draws it as it was then, at this size.
  const paper = world.noteImage();
  paper.className = "plate-paper";
  plate.querySelector(".plate-paper")?.remove();
  plate.appendChild(paper);
  plate.classList.add("paper");
  sliceLayer.hidden = false;
  void sliceLayer.offsetWidth;
  sliceLayer.classList.add("open");
  sliceLayer.focus({ preventScroll: true }); // no close button here: any tap closes
  sliceKey = e => { if (e.key === "Escape") closeSlice(); };
  document.addEventListener("keydown", sliceKey);
}
function closeSlice() {
  if (!sliceLayer.classList.contains("open")) return;
  sliceLayer.classList.remove("open");
  body.classList.remove("reading");
  document.removeEventListener("keydown", sliceKey);
  if (!world.isSliceOpen()) { setTimeout(() => { if (!sliceLayer.classList.contains("open")) sliceLayer.hidden = true; }, 750); return; } // only the note was shown: it fades, then the dim lifts (css)
  // The speech bubble waits until the slice is back and the note has come to rest on the table (author rule).
  body.classList.add("say-hold");
  world.closeSlice(k => { sliceLayer.hidden = true; onSliceClosed(k); }, () => body.classList.remove("say-hold"));
}
sliceLayer.addEventListener("click", e => {
  if (!sliceLayer.classList.contains("eaten")) {
    const b = world.biteSlice(e.clientX, e.clientY);
    if (b && b.wait) return; // on the slice, but its message is still being written: no bite yet, and it stays open
    if (b) {
      audio.ensureAudio();
      audio.nom();
      sliceLayer.classList.add("bitten");
      crumbs(e.clientX, e.clientY);
      // All eaten: the 3D note comes up where the slice was (world.js presentNote), so the DOM paper stays hidden
      // (note3d) and the note itself is then carried down to the table.
      if (b.done) {
        hint.textContent = U.eatenHint; // nothing left to tap on the cake (author rule)
        later(420, () => { sliceLayer.classList.add("eaten", "note3d"); sliceLayer.focus({ preventScroll: true }); });
      }
      return;
    }
  }
  closeSlice();
});
// Cake crumbs that fall from a bite.
function crumbs(x, y) {
  if (reduced) return;
  const host = document.createElement("div");
  host.className = "crumbs";
  host.style.left = x + "px";
  host.style.top = y + "px";
  for (let i = 0; i < 9; i++) {
    const c = document.createElement("i");
    c.style.setProperty("--dx", ((Math.random() - 0.5) * 90).toFixed(0) + "px");
    c.style.setProperty("--dy", (60 + Math.random() * 90).toFixed(0) + "px");
    c.style.setProperty("--s", (0.6 + Math.random() * 0.9).toFixed(2));
    c.style.animationDelay = Math.round(Math.random() * 80) + "ms";
    host.appendChild(c);
  }
  sliceLayer.appendChild(host);
  setTimeout(() => host.remove(), 1300);
}
const STAR = '<svg viewBox="-6 -6 12 12"><path d="M0-6L1.5-1.5L6 0L1.5 1.5L0 6L-1.5 1.5L-6 0L-1.5-1.5Z"/></svg>';
const HEART = '<svg viewBox="-7 -7 14 14"><path d="M0 6.3C-8.75.7-7.7-6.65 0-2.45C7.7-6.65 8.75.7 0 6.3Z"/></svg>';
const SPARK_COLORS = ["#FFD39A", "#F6B8C4", "#FFF1D6", "#E9B44C", "#F7C9A9"];

function sparkBurst(host, n) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span"), a = (i / n) * 6.283 + Math.random() * 0.4, d = 50 + Math.random() * 50;
    s.className = "spark";
    s.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px");
    s.style.setProperty("--dy", (Math.sin(a) * d * 0.7).toFixed(1) + "px");
    s.style.setProperty("--c", SPARK_COLORS[i % SPARK_COLORS.length]);
    s.innerHTML = i % 3 ? STAR : HEART;
    s.addEventListener("animationend", () => s.remove());
    host.appendChild(s);
  }
}

function spawnHeart() {
  const h = document.createElement("span");
  h.className = "fheart";
  h.innerHTML = HEART;
  h.style.left = 8 + Math.random() * 84 + "%";
  h.style.top = Math.random() * 30 + "%";
  h.style.setProperty("--dx", ((Math.random() - 0.5) * 40).toFixed(0) + "px");
  h.addEventListener("animationend", () => h.remove());
  say.appendChild(h);
}

// Blown kisses: lip prints that leave the plush's mouth and float up and out towards her, growing as they come.
const KISS = '<svg viewBox="0 0 24 16"><path d="M1.5 8C4.5 4.2 7.6 2.4 10 3.8C11 3 13 3 14 3.8C16.4 2.4 19.5 4.2 22.5 8C17.5 7.2 6.5 7.2 1.5 8Z"/><path d="M1.5 8.6C6.5 8 17.5 8 22.5 8.6C19.4 13 15.6 15 12 15C8.4 15 4.6 13 1.5 8.6Z"/></svg>';
function sendKisses() {
  const h = world.unicornHead(), host = document.createElement("div");
  host.className = "kisses";
  host.style.left = h.x + "px";
  host.style.top = h.y + h.r * 0.45 + "px";
  for (let i = 0; i < 6; i++) {
    const k = document.createElement("span");
    k.className = "kiss";
    k.innerHTML = KISS;
    k.style.setProperty("--dx", (-150 + Math.random() * 130).toFixed(0) + "px");
    k.style.setProperty("--dy", (-90 - Math.random() * 150).toFixed(0) + "px");
    k.style.setProperty("--rot", ((Math.random() - 0.5) * 50).toFixed(0) + "deg");
    k.style.setProperty("--s", (1.1 + Math.random() * 0.9).toFixed(2));
    k.style.animationDelay = i * 110 + "ms";
    host.appendChild(k);
  }
  body.appendChild(host);
  setTimeout(() => host.remove(), 2400);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function showSoundHint() {
  if (soundHintShown) return;
  soundHintShown = true;
  soundHint.hidden = false;
  setTimeout(() => { soundHint.hidden = true; }, 4500);
}

function setWishUI() {
  blowBtn.hidden = false;
  meter.hidden = true;
  hint.textContent = ""; // the wish text only shows once the button is tapped
  hint2.hidden = true; // blowHint already says to tap the candles if the mic does not work (also in Messenger)
  cake.setCandlesTappable(false); // not before the blow button (author rule: only the buttons until then)
  cake.setTapHint(false);
}

// WISH -> BLOWING
blowBtn.addEventListener("click", () => {
  if (state !== S.WISH) return;
  const ctx = audio.ensureAudio(); // inside the user gesture, required on iOS
  state = S.BLOWING;
  blowBtn.hidden = true;
  meter.hidden = false;
  hint.textContent = U.blowHint;
  cake.setCandlesTappable(true); // from now on tapping a candle always works, mic or not
  cake.setTapHint(inApp);
  startBlow(ctx, { log: DEV, onLevel, onSuccess: celebrate, onFallback: showFallback });
});

function onLevel(l) {
  cake.setBlowLevel(l);
  bars.forEach((b, i) => { b.style.height = 4 + Math.max(0, Math.min(1, l * 5 - i)) * 10 + "px"; });
}

function showFallback(reason) {
  if (state === S.CELEBRATE || state === S.PLAY) return;
  if (DEV) console.log("[torta] fallback:", reason);
  cake.setTapHint(true);
  // blowHint stays in every case (author request): it already says to tap the candles if blowing does not work.
  // On a timeout the mic keeps listening; without a mic only the level meter goes.
  if (reason !== "timeout") {
    cake.setBlowLevel(0);
    meter.hidden = true;
  }
}

function onCandleTap(i) {
  if (state !== S.BLOWING) return; // only once the blow button has been tapped
  audio.ensureAudio();
  if (!cake.extinguish(i)) return;
  cake.setTapHint(true);
  if (cake.litCount() === 0) celebrate();
}

// BLOWING (or WISH) -> CELEBRATE, idempotent
function celebrate() {
  if (state === S.CELEBRATE || state === S.PLAY) return;
  state = S.CELEBRATE;
  stopBlow();
  cake.setBlowLevel(0);
  cake.setCandlesTappable(false);
  cake.setTapHint(false);
  blowBtn.hidden = true;
  meter.hidden = true;
  hint.textContent = "";
  hint2.hidden = true;
  const wait = cake.extinguishAll();
  body.classList.add("candles-out");
  later(wait + 250, () => {
    // The bubble pops and the unicorn now wishes her a happy birthday.
    say.classList.remove("pop");
    void say.offsetWidth;
    say.classList.add("pop");
    sparkBurst(sparkHost, 12);
    audio.pop();
    later(180, () => { sayText.textContent = C.happy.text; say.classList.add("happy"); placeSay(); });
    cake.unicorn.setMood("happy");
    body.classList.add("lights-on");
    cake.setLights(true);
    cake.setCut(true);
    const f = cake.cakeScreen();
    if (!reduced) confetti.fire(f.cx, f.cy, lowEnd ? 0.6 : 1);
    if (!reduced) fireworks.show({ big: true });
    audio.playTune();
    if (!audio.isRunning()) showSoundHint();
    if (!reduced) later(3500, () => { clearInterval(heartTimer); heartTimer = setInterval(spawnHeart, 1300); });
  });
  later(wait + 3600, toPlay);
}

// CELEBRATE -> PLAY
function toPlay() {
  state = S.PLAY;
  cake.setLocked(false);
  cake.shimmer();
  hint.textContent = world.isEaten(0) ? U.eatenHint : U.afterHint;
}

// Only once the slice has moved out of the cake (after the wish, world.setCut) does it answer a tap at all
// (author rule): before that it is part of the whole cake, with no shake and no message.
function onSliceTap(k) {
  if (state === S.PLAY && !lightbox.isOpen() && !album.isOpen()) openSlice(k);
}

function onSliceClosed(k) {
  visited.add(k);
  if (visited.size < messages.length || allDone || !C.allSlicesText) return;
  allDone = true;
  allText.textContent = C.allSlicesText;
  allText.hidden = false;
  const f = cake.cakeScreen(), host = document.createElement("div");
  host.style.cssText = `position:fixed;left:${f.cx}px;top:${f.cy - f.r * 0.5}px;width:0;height:0;z-index:5;pointer-events:none`;
  body.appendChild(host);
  sparkBurst(host, 16);
  setTimeout(() => host.remove(), 1200);
}

function onUnicornTap() {
  if (concert.isActive()) return;
  if (state === S.PLAY || state === S.CELEBRATE) {
    audio.ensureAudio();
    cake.unicorn.react(true);
    audio.kiss();
    sendKisses();
    if (state === S.PLAY && ++uniTaps >= 3) later(650, askToSing); // after the kisses have flown
  } // before the wish he does not react to taps (author rule: only the buttons until then)
}

muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.title = muted ? U.soundOn : U.soundOff;
  audio.ensureAudio();
  audio.setMuted(muted);
  soundHint.hidden = true;
});

function reset() {
  if (concert.isActive()) return; // nothing can be touched while he sings
  closeAsk();
  uniTaps = 0;
  timers.forEach(clearTimeout);
  timers = [];
  clearInterval(heartTimer);
  stopBlow();
  audio.stopTune();
  confetti.clear();
  fireworks.clear();
  cake.closeSliceNow();
  sliceLayer.hidden = true;
  sliceLayer.classList.remove("open", "bitten", "eaten", "plate-only", "note3d", "hint-on");
  body.classList.remove("reading", "say-hold");
  if (sliceKey) document.removeEventListener("keydown", sliceKey);
  state = S.WISH;
  cake.relightAll();
  cake.setBlowLevel(0);
  cake.setCandlesTappable(false);
  cake.setLocked(true);
  cake.unicorn.setMood("sad");
  cake.resetVisited();
  visited.clear();
  allDone = false;
  allText.hidden = true;
  say.classList.remove("pop", "happy");
  sayText.textContent = C.intro.text;
  say.querySelectorAll(".fheart").forEach(e => e.remove());
  document.querySelectorAll(".kisses").forEach(e => e.remove());
  placeSay();
  body.classList.remove("lights-on", "candles-out");
  cake.setLights(false);
  cake.setCut(false);
  setWishUI();
}

// Corner button: start over (candles relit, cake whole again, the unicorn asks his question again).
resetBtn.addEventListener("click", reset);

// Dev shortcuts, only with ?dev=1
if (DEV) {
  console.info("[torta] dev mode: C = celebrate, R = reset");
  addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (concert.isActive()) return;
    const k = e.key.toLowerCase();
    if (k === "c") celebrate();
    else if (k === "r") reset();
  });
}

// Dropped-frame check after load settles: weaker devices get lighter blur and confetti.
setTimeout(() => {
  let n = 0, t0 = 0;
  const f = t => {
    if (!t0) t0 = t;
    if (++n < 45) { requestAnimationFrame(f); return; }
    if (!lowEnd && (t - t0) / (n - 1) > 24) { lowEnd = true; root.classList.add("lowend"); }
  };
  requestAnimationFrame(f);
}, 1500);

setWishUI();
