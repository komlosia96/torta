// Local-only helper. Not part of the deployed site.
// Reads photos-original/, sorts by file name, and writes
//   assets/photos/full/01.jpg ... 26.jpg  (long edge 1000 px)
//   assets/photos/thumb/01.jpg ... 26.jpg (long edge 360 px)
// Usage (from the project folder):
//   npm install --no-save sharp
//   node scripts/optimize-photos.mjs
import { readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "photos-original");
const FULL = path.join(ROOT, "assets", "photos", "full");
const THUMB = path.join(ROOT, "assets", "photos", "thumb");
const EXPECTED = 26;
const EXT = /\.(jpe?g|png|webp|avif|tiff?)$/i;

const pad = n => String(n).padStart(2, "0");
const kb = b => (b / 1024).toFixed(0) + " KB";

const files = (await readdir(SRC))
  .filter(f => EXT.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

const heic = (await readdir(SRC)).filter(f => /\.hei[cf]$/i.test(f));
if (heic.length) console.warn(`Skipped ${heic.length} HEIC file(s), convert them to JPG first: ${heic.join(", ")}`);
if (files.length !== EXPECTED) console.warn(`Expected ${EXPECTED} photos, found ${files.length}. Processing the first ${Math.min(files.length, EXPECTED)}.`);

await mkdir(FULL, { recursive: true });
await mkdir(THUMB, { recursive: true });

let total = 0;
for (const [i, file] of files.slice(0, EXPECTED).entries()) {
  const name = pad(i + 1) + ".jpg";
  const input = path.join(SRC, file);
  const full = path.join(FULL, name), thumb = path.join(THUMB, name);
  // .rotate() applies the EXIF orientation. sharp strips metadata unless asked to keep it.
  await sharp(input).rotate().resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true }).toFile(full);
  await sharp(input).rotate().resize(360, 360, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true }).toFile(thumb);
  const fs = (await stat(full)).size, ts = (await stat(thumb)).size;
  total += fs + ts;
  const warn = (fs > 250 * 1024 ? "  (full over 250 KB)" : "") + (ts > 35 * 1024 ? "  (thumb over 35 KB)" : "");
  console.log(`${file} -> ${name}  full ${kb(fs)}, thumb ${kb(ts)}${warn}`);
}
console.log(`Total photo weight: ${(total / 1024 / 1024).toFixed(2)} MB (target under 7 MB).`);
