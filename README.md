# Birthday cake web gift

Static single page site with a photoreal 3D scene (WebGL). No build step; the only library is three.js, self-hosted in `js/vendor/`. Open `index.html` through any static server, or deploy the folder to Vercel as is. The full design is in `BUILD_SPEC.md`.

## 1. Edit the text

Everything you write lives in `js/content.js`:

- `sliceMessages`: exactly 3 short Hungarian messages (2 to 6 words each), one for each of the three front slices, left to right. Each one is piped in icing on top of the slice she pulls out of the cake.
- `allSlicesText`: optional line shown after all 3 slices were opened. Empty string turns it off.
- `photos`: exactly 26 entries, one per page of the leather photo album next to the cake, in page order. `caption` is optional short handwritten text under the photo.
- `album.title`: gold lettering on the album cover (default "26"). `album.dedication`: optional line on the page facing photo 1, empty string shows nothing. The album opens straight onto photo 1.
- `candleNumber`: the wax number candles on the cake, default "26" (one candle per digit).

If a count is wrong the page still renders and the browser console shows a warning.

## 2. Add the photos

1. Install Node.js (LTS) if you do not have it.
2. Put your 26 original photos into a folder named `photos-original/` in the project root. They are processed in file name order, so name them in the order you want them in the album (for example `01-tengerpart.jpg`, `02-...`). Photo 1 becomes id 1 (album page 1), and so on. HEIC files must be converted to JPG first.
3. From the project folder run:

   ```bash
   npm install --no-save sharp
   ```

   ```bash
   node scripts/optimize-photos.mjs
   ```

   This writes `assets/photos/full/01.jpg ... 26.jpg` (1000 px) and `assets/photos/thumb/01.jpg ... 26.jpg` (360 px), fixes rotation and strips metadata (including GPS). It prints sizes and the total (target under 7 MB).

Until a photo exists, a pastel placeholder with its number is shown on its album page, so you can preview any time. Photos only load when the album is opened, so the first screen stays fast.

## 3. Preview locally

Any static server works, for example:

```bash
python -m http.server 5173
```

Then open http://localhost:5173. The microphone only works on `localhost` or HTTPS.

Dev shortcuts: open http://localhost:5173/?dev=1 and press `C` to jump to the celebration, `R` to reset. Blow levels are logged to the console. Without `?dev=1` these keys do nothing.

Font check: http://localhost:5173/dev/glyph-test.html must say PASS (every Hungarian letter, including ő and ű, comes from the bundled fonts).

## 4. Deploy to Vercel (free Hobby plan)

Use a hard to guess project name, for example `torta-k7q2x9`, so the `*.vercel.app` address cannot be guessed.

Option A, CLI:

```bash
npx vercel
```

Accept the defaults, framework preset "Other", no build command, output directory is the project root. Then:

```bash
npx vercel --prod
```

Option B, Git: push the folder to a private GitHub repo, then in Vercel choose "Add New Project", import the repo, framework "Other", no build command, deploy.

`.vercelignore` keeps `photos-original/`, `scripts/`, `dev/` and `node_modules/` out of the deployment.

Then open the production URL on a real phone over mobile data (not Wi-Fi) and go through the whole story once.

## Notes

- Photo files are served with a one year `immutable` cache (see `vercel.json`). If you open the live site on a phone and later replace a photo under the same name, that phone may keep showing the old one. Preview in a private tab until the photos are final. Her first visit always gets the current files.
- Privacy: `noindex` meta tag, `X-Robots-Tag` header, `robots.txt` disallow, `no-referrer`. No analytics, cookies or third party requests.
- If the microphone is blocked (for example inside WhatsApp, Messenger or Instagram), she can tap each candle instead. The page never gets stuck.
- The 3D scene needs WebGL (every current iPhone and Android browser has it). If it is missing, a short message asks her to open the page in Safari or Chrome.
- All textures (wood, cream, sponge, strawberries, leather) and the bokeh backdrop are generated in the browser at load time, so there are no image files besides your photos (the only other media file is the song). The candle digits are traced from the bundled Quicksand font.
- The song that plays (on a loop) after the candles go out is `assets/audio/birthday-swing.mp3`. To use a different song, replace that file. Because `/assets/` files are cached for a year, give the new file a new name and update `SONG_URL` in `js/audio.js` if the site has already been opened on a phone.
- On iPhone the hardware silent switch can mute Web Audio. The page tries a workaround and shows "Kapcsold be a hangot" if the sound looks blocked.
