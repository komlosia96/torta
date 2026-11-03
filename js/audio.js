// Web Audio only: music-box birthday tune, pop and squeak. No audio files.
const MASTER = 0.15;
const BPM = 84;
const F = { G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
// "Happy Birthday" (traditional melody, public domain): pitch and beats.
const TUNE = [
  ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2],
  ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
  ["G4", 0.75], ["G4", 0.25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 1],
  ["F5", 0.75], ["F5", 0.25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 2],
];

let ctx = null, master = null, bus = null, muted = false, voices = [], silent = null, wasRunning = false;

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

// Must be called inside a user gesture (iOS unlocks audio only there).
export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(ctx.destination);
    bus = ctx.createGain();
    const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.25;
    fb.gain.value = 0.22;
    wet.gain.value = 0.3;
    bus.connect(master);
    bus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    // Best-effort iOS hack: a looping silent <audio> moves the audio session to playback mode.
    try {
      silent = new Audio(silentWavUrl());
      silent.loop = true;
      silent.setAttribute("playsinline", "");
      const p = silent.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { silent = null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export const isRunning = () => !!ctx && ctx.state === "running";

function note(f, t) {
  const g = ctx.createGain(), g2 = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  g2.gain.value = 0.126; // octave partial, about -18 dB
  o1.type = "triangle";
  o1.frequency.value = f;
  o2.type = "sine";
  o2.frequency.value = f * 2;
  o1.connect(g);
  o2.connect(g2);
  g2.connect(g);
  g.connect(bus);
  o1.start(t); o2.start(t);
  o1.stop(t + 0.9); o2.stop(t + 0.9);
  o1.onended = () => { g.disconnect(); g2.disconnect(); voices = voices.filter(v => v !== o1 && v !== o2); };
  voices.push(o1, o2);
}

export function stopTune() {
  voices.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } });
  voices = [];
}

export function playTune() {
  if (!ctx) return;
  stopTune();
  const beat = 60 / BPM;
  let t = ctx.currentTime + 0.08;
  for (const [p, b] of TUNE) { note(F[p], t); t += b * beat; }
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
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => g.disconnect();
}
export const pop = () => blip("triangle", 720, 180, 0.1, 0.55);
export const squeak = () => blip("sine", 950, 1700, 0.14, 0.4);

export function setMuted(m) {
  muted = m;
  if (!ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(m ? 0 : MASTER, now + 0.1);
}

document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) {
    wasRunning = ctx.state === "running";
    stopTune();
    if (silent) silent.pause();
    ctx.suspend().catch(() => {});
  } else if (wasRunning) {
    ctx.resume().catch(() => {});
    if (silent) { const p = silent.play(); if (p && p.catch) p.catch(() => {}); }
  }
});
