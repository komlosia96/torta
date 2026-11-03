// Microphone blow detection. Every failure path ends in the tap-the-candles fallback.

// Tunable constants
const CALIBRATE_MS = 600;        // ambient noise measurement at the start
const SENSITIVITY_RANGE = 0.12;  // RMS above baseline that counts as a full blow (level 1)
const NOISE_MARGIN = 0.006;      // ignore tiny RMS changes above baseline
const LEVEL_GATE = 0.22;         // levels below this count as quiet
const ENERGY_THRESHOLD = 0.4;    // seconds of full-strength blowing needed
const ENERGY_DECAY = 0.35;       // energy lost per second while quiet
const NO_BLOW_TIMEOUT_MS = 8000; // then also offer the tap fallback
const NO_MIC_TIMEOUT_MS = 10000; // some in-app webviews never answer the permission request
const LOW_FREQ_HZ = 1500;        // blowing is mostly broadband low-frequency noise

let session = 0, stream = null, source = null, analyser = null, raf = 0, timer = 0, watchdog = 0;

export function stopBlow() {
  session++;
  cancelAnimationFrame(raf);
  clearTimeout(timer);
  clearTimeout(watchdog);
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (source) source.disconnect();
  if (analyser) analyser.disconnect();
  stream = source = analyser = null;
}

export async function startBlow(ctx, { onLevel, onSuccess, onFallback, log }) {
  stopBlow();
  const my = session;
  const md = navigator.mediaDevices;
  if (!ctx || !window.isSecureContext || !md || !md.getUserMedia) { onFallback("unsupported"); return; }
  let s;
  watchdog = setTimeout(() => { if (my === session && !stream) onFallback("timeout"); }, NO_MIC_TIMEOUT_MS);
  try {
    s = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    if (my === session) onFallback("denied");
    return;
  }
  if (my !== session) { s.getTracks().forEach(t => t.stop()); return; }
  clearTimeout(watchdog);
  stream = s;
  try {
    if (ctx.state !== "running") await ctx.resume();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser); // never connected to the speakers
  } catch (e) {
    stopBlow();
    onFallback("error");
    return;
  }
  if (my !== session) return;

  const td = new Uint8Array(analyser.fftSize), fd = new Uint8Array(analyser.frequencyBinCount);
  const lowBins = Math.max(1, Math.round(LOW_FREQ_HZ / (ctx.sampleRate / analyser.fftSize)));
  const t0 = performance.now();
  let last = t0, baseSum = 0, baseN = 0, energy = 0, lastLog = 0;

  const tick = now => {
    if (my !== session) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    analyser.getByteTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / td.length);
    if (now - t0 < CALIBRATE_MS) {
      baseSum += rms; baseN++;
      onLevel(0);
      raf = requestAnimationFrame(tick);
      return;
    }
    analyser.getByteFrequencyData(fd);
    let lo = 0, all = 0;
    for (let i = 0; i < fd.length; i++) { const e = fd[i] * fd[i]; all += e; if (i < lowBins) lo += e; }
    const lowShare = all ? lo / all : 0;
    const baseline = baseN ? baseSum / baseN : 0;
    const raw = Math.max(0, Math.min(1, (rms - baseline - NOISE_MARGIN) / SENSITIVITY_RANGE));
    const level = raw * (0.55 + 0.45 * lowShare);
    onLevel(level);
    if (level > LEVEL_GATE) energy += level * dt;
    else energy = Math.max(0, energy - ENERGY_DECAY * dt);
    if (log && now - lastLog > 150) {
      lastLog = now;
      console.log(`[blow] rms=${rms.toFixed(3)} base=${baseline.toFixed(3)} low=${lowShare.toFixed(2)} level=${level.toFixed(2)} energy=${energy.toFixed(2)}`);
    }
    if (energy >= ENERGY_THRESHOLD) { stopBlow(); onSuccess(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  timer = setTimeout(() => { if (my === session) onFallback("timeout"); }, CALIBRATE_MS + NO_BLOW_TIMEOUT_MS);
}
