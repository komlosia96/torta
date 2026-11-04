// Web Audio: the birthday song (a looping MP3) after the wish, plus small pop and squeak effects.
// The song is decoded into a buffer and looped by Web Audio, so it can start when the candles go out
// even without a tap at that moment (iOS only needs the earlier tap that unlocked the AudioContext).
// ?v= dodges a 404 a phone may have cached before the song was deployed (assets are cached for a year).
const SONG_URL = "assets/audio/birthday-swing.mp3?v=2";
const SONG_VOL = 0.75, FX_VOL = 0.15;

let ctx = null, fx = null, music = null, muted = false, held = false, away = false, silent = null, wasRunning = false;
let song = null, songEnd = 0, songLoad = null, source = null, wantSong = false, onStart = null;

// Called each time the song actually starts playing.
export function onSongStart(fn) { onStart = fn; }

// Where the loop jumps back to the start. Song files often end with a cut-off fragment after the real
// ending (this one starts a new run-through at 39.0 s and is chopped at 40.6 s), so loop at the quietest
// moment of the last few seconds, after the final note has died away, when there is a clear one.
function findLoopEnd(buf) {
  const sr = buf.sampleRate, win = Math.round(sr * 0.05), chans = [...Array(buf.numberOfChannels).keys()].map(c => buf.getChannelData(c));
  const from = Math.max(0, buf.length - sr * 6), rms = at => {
    let s = 0;
    for (const d of chans) for (let i = at; i < at + win; i++) s += d[i] * d[i];
    return Math.sqrt(s / (win * chans.length));
  };
  let best = buf.length, bestRms = 0.02; // only accept a really quiet spot
  for (let at = from; at + win <= buf.length - win; at += win) { const v = rms(at); if (v < bestRms) { bestRms = v; best = at + win; } }
  return best / sr;
}

function silentWavUrl() {
  const sr = 8000, n = 4000, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

// Fetch and decode the song once, in the background (started by the first ensureAudio()).
function loadSong() {
  if (!songLoad) {
    songLoad = fetch(SONG_URL)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(data => new Promise((ok, fail) => { const p = ctx.decodeAudioData(data, ok, fail); if (p && p.catch) p.catch(fail); }))
      .then(buf => { song = buf; songEnd = findLoopEnd(buf); if (wantSong) startSong(); })
      .catch(e => { console.warn("[torta] birthday song could not be loaded:", e); songLoad = null; });
  }
  return songLoad;
}

// Must be called inside a user gesture (iOS unlocks audio only there).
export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    fx = ctx.createGain();
    fx.gain.value = muted ? 0 : FX_VOL;
    fx.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = muted ? 0 : SONG_VOL;
    music.connect(ctx.destination);
    // Best-effort iOS hack: a looping silent <audio> moves the audio session to playback mode,
    // so the hardware silent switch does not mute the page.
    try {
      silent = new Audio(silentWavUrl());
      silent.loop = true;
      silent.setAttribute("playsinline", "");
      const p = silent.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { silent = null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  loadSong();
  return ctx;
}

export const isRunning = () => !!ctx && ctx.state === "running";

function startSong() {
  if (source) { try { source.stop(); } catch (e) { /* already stopped */ } source.disconnect(); }
  source = ctx.createBufferSource();
  source.buffer = song;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = songEnd;
  source.connect(music);
  source.start(ctx.currentTime + 0.05);
  if (onStart) onStart();
}

// Start the song from the beginning, looping until stopTune(). If it is still loading, it starts once ready.
export function playTune() {
  if (!ctx) return;
  wantSong = true;
  if (song) startSong(); else loadSong();
}

export function stopTune() {
  wantSong = false;
  if (!source) return;
  try { source.stop(); } catch (e) { /* already stopped */ }
  source.disconnect();
  source = null;
}

function blip(type, f0, f1, dur, vol) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(fx);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => g.disconnect();
}
export const pop = () => blip("triangle", 720, 180, 0.1, 0.55);
export const squeak = () => blip("sine", 950, 1700, 0.14, 0.4);
// A bite of cake: a soft, low "nom nom".
export function nom() {
  blip("triangle", 300, 150, 0.09, 0.5);
  setTimeout(() => blip("triangle", 260, 130, 0.08, 0.42), 120);
}
// A blown kiss: a soft rising "mwa" and the little smack at its end.
export function kiss() {
  blip("sine", 360, 780, 0.17, 0.32);
  setTimeout(() => blip("triangle", 1500, 520, 0.05, 0.28), 150);
}

// Mute fades rather than cutting hard; the song keeps its place underneath.
function fade(secs) {
  if (!ctx) return;
  const now = ctx.currentTime, off = muted || held || away;
  for (const [g, v] of [[fx, FX_VOL], [music, SONG_VOL]]) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    if (secs) g.gain.linearRampToValueAtTime(off ? 0 : v, now + secs);
    else g.gain.setTargetAtTime(off ? 0 : v, now, 0.004); // near-instant, without a click
  }
}
export function setMuted(m) { muted = m; fade(0.25); }
export const isMuted = () => muted;
// Silences the song and effects while the unicorn sings (only his song plays), then brings them back.
export function hold(on) { held = on; fade(on ? 0.4 : 1.2); }

// Pause everything while the page is hidden; the song continues where it was when she comes back.
// The sound is silenced first and the audio stopped a moment later: suspending it mid-song made a buzz when the
// page was closed (iOS repeats the last chunk of sound that was playing while it tears the page down).
function leave() {
  if (!ctx || away) return;
  away = true;
  wasRunning = ctx.state === "running";
  fade(0);
  if (silent) silent.pause();
  setTimeout(() => { if (away) ctx.suspend().catch(() => {}); }, 60);
}
function back() {
  if (!ctx || !away) return;
  away = false;
  if (!wasRunning) return;
  ctx.resume().catch(() => {});
  fade(0.4);
  if (silent) { const p = silent.play(); if (p && p.catch) p.catch(() => {}); }
}
document.addEventListener("visibilitychange", () => (document.hidden ? leave() : back()));
addEventListener("pagehide", leave); // closing the page or the in-app browser
addEventListener("pageshow", e => { if (e.persisted) back(); });
