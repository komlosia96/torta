# Birthday Cake Web Gift: Development Spec (v2, photoreal 3D)

A mobile-first, single-page birthday website for the author's girlfriend, who lives in Spain and turns 26. The page is in **Hungarian**, hosted for free on **Vercel**, and opens immediately (no countdown, no lock).

The scene is a **photorealistic 3D render** in the browser, modelled on the author's reference picture: a white cream cake heaped with strawberries and lit "2" and "6" wax number candles, on a white cake stand, on a warm rosewood (cherry) table that ends just behind the cake, in front of a navy and indigo twilight backdrop full of coral and rose bokeh (palette: coral #FB5A3E, rose #DC375A, teal #163E50, navy #1C1C54, indigo #342D77, used for the sky and lights; the table is warm wood, not teal, by author's choice; the cake and the unicorn keep their own colours). A brown leather photo album lies on the table to the left, a smiling pastel plush unicorn sits on the right. She makes a wish, blows out the candles, then pulls slices out of the cake to read the messages written on them and flips through 26 photos in the album.

This document replaces the first version of the spec.

---

## 0. Rules for the builder

1. **No build step.** Plain HTML, CSS and JavaScript (ES modules). The deployed site is static files only.
2. **One vendored library: three.js** (MIT, r160, `js/vendor/three.module.min.js`), self-hosted. No other runtime dependencies.
3. **No third-party requests at runtime.** No CDNs, analytics, external fonts or images. Every texture is generated procedurally on a canvas at load time; photos, fonts and the birthday song are self-hosted.
4. **No cost.** Vercel Hobby plan only.
5. **Do not invent the 3 slice messages.** The author writes them. Ship placeholders ("Üzenet 1" ... "Üzenet 3").
6. **No em-dashes or en-dashes anywhere** (code, comments, copy, docs). Use commas, periods or hyphens.
7. **Never broken without assets.** A missing photo shows a pastel placeholder page with its number.
8. **Primary device: iPhone 17 Pro in Safari, portrait** (402 x 874 pt screen, about 402 x 760 visible with Safari's bars; Dynamic Island and home indicator respected through safe-area insets). Must also feel finished at 360 to 430 px wide portrait; landscape and desktop must look good too (the 3D framing adapts).
9. **Realism first.** Correct perspective (one real perspective camera), objects rest on surfaces with plausible contact and shadows, physically based materials and light.

---

## 1. Story beats

1. **Opening.** Warm, candle-lit scene. The plush unicorn (a boy, looking a little sad) asks in a speech bubble: `Tudtad, hogy Rutéba nem lehet tortát kiszállítani?` The candles burn and light the cake.
2. **The wish.** She taps "Fújd el a gyertyákat!", allows the microphone and blows. The flames lean with the strength of her breath and go out with smoke. Tapping a candle puts it out at any time before the wish is complete, mic or not.
3. **The payoff.** The unicorn's bubble pops and now says `Boldog szülinapot, Kicsim!` (capital K, author's choice), the lights come up, confetti, the big band swing birthday song starts and keeps looping, and as it starts small fireworks go off in the sky above the cake (about 9 rockets over 6 s; again on "Dallam újra"), the unicorn glows and sparkles.
4. **Exploring.** Tapping the cake lifts that slice out of the cake toward her, showing the layered inside, with the message piped in icing on top. Tapping the album opens it; pages flip in 3D; tapping a photo shows it full size.

**Lock rule:** before the candles are out, slices do not open (a small toast and a wiggle instead) and the unicorn only gives a small wiggle. The album is always available.

---

## 2. Files

```
index.html
vercel.json, robots.txt, .vercelignore, .gitignore, README.md
css/style.css
js/
  main.js        boot, state machine, wiring, DOM UI
  content.js     ALL text and photo settings (the only file the author edits)
  world.js       3D scene: renderer, camera framing, lights, table, cake stand, album model,
                 plush placement, tap picking, slice pull-out animation, render loop
  cake.js        3D cake geometry and materials: 8 removable slices, strawberry mound
  candles.js     wax number candles traced from the page font, flames, candlelight, smoke
  tex.js         procedural canvas textures (wood, cream, sponge, strawberry, leather, flame, icing text)
  unicorn.js     plush unicorn as layered pre-rendered SVG images in the DOM
  album.js       leather album viewer with 3D page flips
  lightbox.js    full-size photo viewer
  room.js        twilight backdrop with coral and rose bokeh (canvas), dimmer
  blow.js        microphone blow detection
  audio.js       Web Audio: the looping birthday song and sound effects
  confetti.js    canvas confetti
  fireworks.js   small canvas fireworks in the sky (between the backdrop and the 3D scene), launched when the song starts
  vendor/three.module.min.js
assets/fonts/    Quicksand and Caveat woff2 (Latin + Latin Extended)
assets/photos/full/01.jpg ... 26.jpg (about 1000 px), thumb/01.jpg ... 26.jpg (about 360 px)
scripts/optimize-photos.mjs   local-only helper (sharp)
dev/glyph-test.html           local-only Hungarian glyph check
```

Target browsers: iOS Safari 15+ and Chrome for Android 100+ (WebGL required; if it is missing, a short message asks her to open the page in Safari or Chrome). Use `100dvh` with an `innerHeight` fallback.

---

## 3. Content (`js/content.js`)

One exported object: `lang`, `pageTitle`, `intro` (the unicorn's question before the wish), `happy` (what its bubble says after), `ui` (all UI strings and screen reader labels), `sliceMessages` (exactly 3, for the three front slices, left to right), `allSlicesText` (optional, empty disables), `candleNumber` ("26", one wax candle per digit, digits 0 to 9 supported), `album` (`title` gold-stamped on the cover, optional `dedication` inside the cover), `photos` (exactly 26 `{ id, caption }`, in album page order).

Photo `id` N maps to `assets/photos/full/NN.jpg` and `thumb/NN.jpg`. Validate counts at startup with `console.warn`, but always render.

---

## 4. The 3D scene (units: centimetres)

### 4.1 Camera and framing
- One perspective camera, vertical FOV 28 degrees, looking down at about 18 degrees, low enough that the table's back edge shows behind the cake. A long lens keeps distortion low.
- Composition follows the reference picture: the cake is centred, the lowest point of the group (the album's front corner) about 80 percent down the screen, the flames below the top UI. The whole group (album on the left, cake, plush with its tail on the right) is always fully visible, in portrait too (author requirement): the distance is solved so the group spans about 97 percent of the width (the album and plush are kept compact and close to the stand so the cake can be as large as possible), and a horizontal lens shift centres the group. The camera distance is solved for this, then a lens shift (`setViewOffset`) places it without changing the perspective.

### 4.2 Lighting and rendering
- Physically based rendering, ACES filmic tone mapping, sRGB output, soft shadow maps.
- Image-based lighting from a small generated studio room (PMREM).
- A warm window key light with shadows, a hemisphere fill and a warm rim light.
- Each flame is a real point light that lights the cake and goes out with the flame.
- Before the wish the scene is warm and candle-lit; after the wish the lights come up over about 2 seconds (the CSS backdrop brightens in step).
- Render on demand: the loop runs only while flames burn, smoke rises or something animates. Animations also finish on a timer so state never sticks if frames are throttled.

### 4.3 Table and backdrop
- Polished warm rosewood (cherry) table with a rosy undertone that matches the coral and rose lights (long soft grain, no plank joints, light clearcoat with slightly damped reflections so the indigo room does not grey the wood). It ends about 52 cm behind the cake with a rounded back edge, turned very slightly, so the edge runs behind the cake at about the height of its top.
- Beyond the edge: a navy to indigo wall with coral and rose glows (CSS gradients) and coral and rose out-of-focus lights painted on a canvas: discs of varied size and brightness spread evenly over the whole backdrop (one per cell of a jittered, staggered grid, a few cells empty, not in a single band), plus faint large glows. A few discs gently twinkle. The front of the table falls off into shadow. Before the wish the scene is dim and candle-lit; when the candles go out it lights up over about 2 seconds into a party look: a lighter indigo, violet and coral sky fades in, the bokeh brightens, the vignettes ease off, and the 3D lights and exposure rise (`applyLight` in world.js, `.lights-on` in style.css). Reset fades back.

### 4.4 Cake (modelled on the reference picture)
- Radius 12.5, height 15 (a tall, wide layer cake, so it fills more of the phone screen; author request; the stand and the strawberry layout scale with the radius), smooth white cream with a softly rounded top edge, on a white glazed ceramic cake stand (foot, short stem, plate with a low rim). Soft contact shadows under the foot and around the base of the cake.
- Whipped cream: smooth sides with faint spatula marks, soft top; a faint emissive term stands in for light scattering inside the cream so it reads white, not grey.
- Piped shell border of cream around the base of the cake, on the plate.
- **8 slices**, each a separate object: cream top, cream side with the rounded edge, two cut faces with a sponge texture (three vanilla sponge layers, cream fillings, strawberry pieces, outer frosting), and its own segment of the base border. **Only the three slices facing the viewer can be opened** (author request); they carry messages 1 to 3, left to right. Taps on the rest of the cake do nothing.
- **Cut after the wish:** when the candles go out, the three front slices ease about 4.5 mm outward, so thin gaps (showing the sponge on the sides) mark exactly which slices to tap; the back of the cake stays whole. Reset puts the cake back together.
- **Strawberries:** only whole berries (no halves), resting calyx up and leaning back or outward, heaped behind and beside the candles. Nothing stands in front of the candles, so they are seen whole; the front of the top stays bare cream. Each berry rests on the cream (lowest point slightly sunk in) and belongs to the slice it sits on; while a slice's message is read its berries step aside and come back when it is put back. All cast and receive shadows.

### 4.5 Number candles
- Wax "2" and "6" number candles, 8 cm tall: solid digits traced from the page's rounded font (Quicksand Bold, slightly thickened, drawn a little narrower so they stand tall), extruded about 1 cm thick with a rounded bevel. Ivory wax face, warm orange wax rim (sides and bevel), so each digit reads as outlined like in the reference. Standing on top of the cream (not sunk into the cake) side by side just in front of the centre, fully visible. Any digit 0 to 9 works.
- Wick on each top. Flame = additive sprite with an analytic teardrop texture, glow sprite, point light. Flames flicker, lean outward and shrink with the live blow level, go out in about 0.2 s, and release rising smoke.

### 4.6 Album on the table
- Closed brown leather album (15 x 3 x 20) with light stitching and the gold title on the cover, a rounded spine with raised bands, and a cream page block, lying on the table in front of the cake stand on the left, its back corner tucked under the plate's rim (it is lower than the plate). Album and plush sit in front so they overlap the cake's sides on screen: the group stays narrow and the cake can be large on a phone. A real DOM button sits over its projected outline; the opening book starts out turned like the album on the table.

### 4.7 Plush unicorn
- A boy: white minky plush with soft cool tints (blue, mint, cream) sitting on the table in front of the cake stand on the right; he may cover a little of the cake's right side (author request) (about 18 cm tall): gold stitched horn, light blue inner ears, rainbow faux-fur mane and tail in cool tones (blue, teal, green, gold, orange, violet; no pink), black bead eyes with short stitched brows, slate-blue hooves, dark stitched nostrils and smile. No blush, no eyelashes. Mirrored so the tail points away from the cake.
- **Speech bubble:** a cream bubble in the handwritten font with a curved tail that leaves the bubble on the right, passes the right side of his head and ends beside his mouth, so it never covers the cake (author request) or his face. It sits just above his head, or above the candle flames when it would otherwise cover them (narrow phones), and is re-placed on resize. Before the wish it shows `intro.text`; after, it pops and shows `happy.text`. Hidden while a slice is read; hearts float up from it after the wish.
- Rendered as layered pre-rendered SVG images in the DOM (fabric filters render once), placed and scaled by projecting its position on the table; a 3D contact shadow grounds it.
- **A little sad before the wish, happy after** (author request; this replaced an earlier "always smiling" rule). Before the wish: brows raised in the middle, eyes glancing down, a small stitched frown, ears slightly lowered; no tears, no blush. When the candles go out: the smile returns, ears come up, and he glows and his horn sparkles. Reset makes him a little sad again. Breathing and a gently swaying mane always (unless reduced motion). Tapping the head after the wish: wiggle, blink, squeak, heart; before the wish: a small wiggle.

---

## 5. Slices and messages
- Tap anywhere on a slice (picked by raycasting). Before the wish: locked toast "Előbb fújd el a gyertyákat!" for 1.8 s and a small wiggle of that slice.
- After the wish: the slice slides outward, lifts, then turns to face her (top toward the camera, tip down, slightly turned so one layered cut face shows) and stops in front of the camera. The rest of the scene darkens behind it (drawn in WebGL).
- The message is piped in pink icing on the slice top, wrapped to the widening wedge (lines measured against the wedge width at their height), shrunk to fit, revealed left to right like writing.
- Tap anywhere or "Bezár" (or Escape) to put it back. A small gold heart then appears on that slice. One slice at a time. After all 3: optional `allSlicesText` with a sparkle burst.
- Hidden accessible buttons let keyboard and screen reader users open each slice.

## 6. Photo album
- **A real open book, seen close up.** The album is a two-page book with the spine in the middle, but the view is zoomed onto the left page: the left page (with the photo) is centred and fills most of the phone's width, the spine and the right page only peek in at the right edge, and the leather cover with its page edges shows around it. On wide screens the whole spread fits.
- **Photos only on the left pages.** Photo 1 is pasted inside the cover; each further leaf has a plain right page on its front and one photo on its back. Every page turn lifts the right page from the spine and flips it over onto the left in 3D, landing with the next photo. Turning back flips it the other way.
- Opening: the book flies from the table into the centre and the cover turns, landing straight on photo 1 (no title page in between; author request). The optional dedication is written on the right page facing photo 1.
- Turn pages by swiping left (forward) or right (back) anywhere in the viewer (touch or mouse, pointer-captured so a swipe always completes; text selection and image dragging are disabled), tapping (left edge of the screen = back, right side = forward), the arrows, or the keyboard. Tapping above or below the book closes the album. Page counter like `5 / 26`. Photos load only when the album is opened, a few pages ahead (full image, then thumb, then placeholder).
- Tapping a photo opens the full-size viewer (swipe or arrows through all 26). Closing it jumps the album to the photo she ended on.
- Close: "Bezár", Escape, a tap above or below the book, or going forward from the last photo (swipe, tap, arrow or key): the book closes and flies back to the table. Focus is trapped while open and restored on close.

## 7. Blow detection (`blow.js`)
The button is the user gesture; resume the AudioContext, then `getUserMedia` with echo cancellation, noise suppression and auto gain off; analyser (fftSize 1024); 500 ms calibration; RMS above baseline mapped to a 0..1 level that drives the flames; accumulated energy threshold extinguishes all candles; mic tracks stopped afterwards. **Tuned to be forgiving** (the author found the first version too hard): a full blow is only 0.045 RMS above the baseline, about half a second of a gentle blow is enough, the baseline is capped (0.02) so blowing during calibration cannot make it impossible, and it only ever adapts downward to quieter moments. Fallbacks: denied, unavailable, insecure, a permission request that never answers (10 s), or no blow for 8 s all reveal "Nem megy a mikrofon? Koppints a gyertyákra!" and tappable candles. In-app browsers show the tap hint immediately. The experience never gets stuck.

## 8. Audio (`audio.js`)
The author's song `assets/audio/birthday-swing.mp3` (big band swing "Happy Birthday", about 40 s, supplied by the author) starts when the candles go out and **loops** until reset. It is fetched and decoded in the background from the first tap that unlocks audio (the blow button or a candle), then played as a looping Web Audio buffer, so it can start without a tap at that moment on iOS. The file ends with a cut-off fragment of a second run-through (39.0 to 40.6 s) that sounded like a buzz at the loop, so the loop end is set to the quietest spot of the last 6 s after the final note (found automatically, 39.0 s for this file) and jumps back to the start; if it is still loading it starts as soon as it is ready. "Dallam újra" restarts it from the beginning, the mute toggle fades it (and the effects) out and back in, and it pauses while the page is hidden and continues where it was. Also: short pop and squeak sounds, best-effort iOS silent-switch workaround.

## 9. State machine (`main.js`)
`WISH` (initial) -> `BLOWING` (mic active) -> `CELEBRATE` (about 3.6 s, idempotent) -> `PLAY`. A round reset button in the top-left corner ("Újrakezdés", always visible; the replay pill sits beside it after the wish) returns to `WISH`: candles relit, cake whole, the unicorn asks his question again. Dev shortcuts only with `?dev=1`: `C` celebrate, `R` reset, blow levels logged.

## 10. Accessibility and quality
`<html lang="hu">`; real buttons for everything (album, candles, unicorn head, hidden slice buttons); visible focus; `prefers-reduced-motion` turns off floating, breathing, bokeh drift and big transitions (slices and pages switch instantly); tap targets at least 44 px; fonts verified for ő and ű with `dev/glyph-test.html`.

## 11. Privacy and hosting
`noindex` meta, `X-Robots-Tag`, `robots.txt` disallow, `Referrer-Policy: no-referrer`, `Permissions-Policy: microphone=(self)`, long cache on `/assets/`, hard-to-guess Vercel project name, no analytics or cookies. Deploy with `npx vercel` then `npx vercel --prod` (framework "Other", no build command), or via a Git import.

## 12. Testing checklist
- [ ] Opens without errors; the unicorn's bubble asks its question, candle-lit scene, burning "26" candles.
- [ ] Looks like the reference picture: table ends behind the cake, coral and rose bokeh on navy and indigo beyond, contact shadows under the stand, album and plush.
- [ ] Only whole strawberries, right side up, none hiding any part of the candles, none floating or sinking unnaturally.
- [ ] After the wish the slice cut lines are visible; reset makes the cake whole again.
- [ ] Tapping a candle puts it out, before and while blowing.
- [ ] Locked slices before the wish; album opens any time.
- [ ] Mic blow bends the flames, then puts them out with smoke; mic indicator turns off; all fallbacks work.
- [ ] Celebration: lights up, the unicorn's bubble changes to the birthday wish, confetti, tune once, unicorn glows.
- [ ] Each of the three front slices lifts out, shows layered inside and its message, returns, gets a heart; the back of the cake ignores taps.
- [ ] Album: opens from the table, all 26 pages flip, photo viewer works, closes back to the table.
- [ ] iPhone 17 Pro 402x874 and 402x760 (Safari bars), plus 360x640, 390x844, 430x932, landscape (874x402) and desktop framing; no console errors; reduced motion honoured.
- [ ] Album: looks like an open book zoomed onto the left page (right page peeking), page turns look like flipping a book, swipe left and right through all 26 photos on a phone, tap a photo to zoom.
- [ ] Real iPhone and Android over mobile data: smooth frame rate, acceptable load time.

## 13. Inputs from the author
26 photos (in album order) in `photos-original/`, the 3 messages, optional captions, optional album dedication, optional `allSlicesText`.
