// Ákos's concert (author request): after "Igen" the plush glides to the middle of the screen into a spotlight,
// raises a microphone and sings the author's song. Only that song plays (the birthday song and effects are held
// silent), nothing can be touched, and when the song ends everything goes back to how it was.
const SONG_URL = "assets/audio/concert.mp3?v=1";
const SONG_GAIN = 1.21; // louder than recorded, twice 10% (author: it was quieter than the birthday song), see audio.boost
const NOTE = '<svg viewBox="0 0 18 24"><path d="M7 3.5 17 1v14.6a3.6 3 0 1 1-2-2.6V5.6L9 7.1v11.5a3.6 3 0 1 1-2-2.6z"/></svg>';

export function createConcert({ unicorn, audio, reduced, onStart, onEnd }) {
  const body = document.body, spot = document.getElementById("spot"), host = unicorn.host;
  const locked = [...document.querySelectorAll("#stage, #ov, #app, .ui")];
  let song = null, active = false, noteTimer = 0, guard = 0, notes = null, wasPlaying = false;

  // Created ahead (when he asks), so it is loaded by the time she says yes.
  function prepare() {
    if (song) return;
    song = new Audio(SONG_URL);
    song.preload = "auto";
    song.setAttribute("playsinline", "");
    song.addEventListener("ended", finish);
    song.addEventListener("error", finish);
    // Ends even if "ended" never fires (a stalled stream): the song's length plus a few seconds.
    song.addEventListener("loadedmetadata", () => { if (active && isFinite(song.duration)) armGuard(song.duration * 1000 + 4000); });
  }
  function armGuard(ms) { clearTimeout(guard); guard = setTimeout(finish, ms); }

  // Where he sits on stage: his seat centred low on the screen, scaled up so he is the star.
  function stageTransform() {
    const r = host.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const sx = r.left + r.width / 2, sy = r.top + r.height * (136 / 150);
    const s = Math.max(1, Math.min(2.6, (vh * 0.34) / (r.height * (124 / 150)), (vw * 0.8) / (r.width * 0.75)));
    const tx = vw / 2, ty = vh * 0.7;
    return { css: `translate(${(tx - sx).toFixed(1)}px,${(ty - sy).toFixed(1)}px) scale(${s.toFixed(3)})`, tx, ty, size: r.height * (124 / 150) * s };
  }

  function spawnNote() {
    const n = document.createElement("span");
    n.className = "note";
    n.innerHTML = NOTE;
    n.style.setProperty("--dx", ((Math.random() - 0.5) * 160).toFixed(0) + "px");
    n.style.setProperty("--rot", ((Math.random() - 0.5) * 60).toFixed(0) + "deg");
    n.style.left = (Math.random() - 0.5) * 40 + "px";
    n.style.top = (Math.random() - 0.5) * 20 + "px";
    n.addEventListener("animationend", () => n.remove());
    notes.appendChild(n);
  }

  // Must be called inside the tap on "Igen": iOS only lets a song start from a user gesture.
  function start() {
    if (active) return;
    prepare();
    active = true;
    try { song.currentTime = 0; } catch (e) { /* not seekable yet: it starts from the beginning anyway */ }
    song.muted = audio.isMuted();
    audio.boost(song, SONG_GAIN);
    const p = song.play();
    if (p && p.catch) p.catch(() => finish());
    armGuard(60000);
    audio.hold(true);
    onStart();
    locked.forEach(el => { el.inert = true; });
    const t = stageTransform();
    spot.style.setProperty("--x", t.tx + "px");
    spot.style.setProperty("--y", t.ty - t.size * 0.45 + "px");
    spot.style.setProperty("--r", Math.max(120, t.size * 0.75) + "px");
    body.classList.add("concert");
    host.classList.add("on-stage");
    host.style.transform = t.css;
    unicorn.setSinging(true);
    if (!reduced) {
      notes = document.createElement("div");
      notes.className = "notes";
      notes.style.left = t.tx + "px";
      notes.style.top = t.ty - t.size * 0.62 + "px";
      body.appendChild(notes);
      noteTimer = setInterval(() => spawnNote(), 520);
    }
  }

  // The song is over (or could not play): back to his seat, lights up, the birthday song fades back in.
  function finish() {
    if (!active) return;
    active = false;
    clearTimeout(guard);
    clearInterval(noteTimer);
    if (song) song.pause();
    unicorn.setSinging(false);
    host.style.transform = "";
    body.classList.remove("concert");
    audio.hold(false);
    const n = notes;
    notes = null;
    setTimeout(() => {
      if (n) n.remove();
      if (active) return;
      host.classList.remove("on-stage");
      locked.forEach(el => { el.inert = false; });
      onEnd();
    }, reduced ? 50 : 1150);
  }

  // A hidden (or closed) page pauses the song with everything else, and it carries on when she comes back.
  const away = () => { if (active && song && !song.paused) { wasPlaying = true; song.pause(); } };
  document.addEventListener("visibilitychange", () => {
    if (!active || !song) return;
    if (document.hidden) away();
    else if (wasPlaying) { wasPlaying = false; const p = song.play(); if (p && p.catch) p.catch(() => {}); }
  });
  addEventListener("pagehide", away);

  return { prepare, start, stop: finish, isActive: () => active };
}
