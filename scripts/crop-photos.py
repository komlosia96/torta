# Local-only helper (Python + Pillow, used instead of optimize-photos.mjs on machines without Node).
# Reads photos-original/ and writes assets/photos/full/NN.jpg (800x1000) and thumb/NN.jpg (288x360), cropped
# to the album's 4:5 page around the people in each photo. The list P below sets the order (date taken) and the
# centre of the people per photo. Usage: pip install pillow, then python scripts/crop-photos.py [preview_dir]
import sys, os
from PIL import Image, ImageOps
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "photos-original")
FULL, THUMB = os.path.join(root, "assets/photos/full"), os.path.join(root, "assets/photos/thumb")
sheet_dir = sys.argv[1] if len(sys.argv) > 1 else None
A = 4 / 5  # album page and lightbox ratio

# In date order. (file, fx, fy, zoom): fx, fy = centre of the people (0..1); zoom < 1 crops tighter.
# "asis" = keep the whole picture uncropped in its own shape (the photo strip, already a print of its own:
# the album shows any photo that is not 4:5 without the white polaroid frame).
P = [
    ("IMG_8579.JPG", 0.58, 0.55, 1),
    ("IMG_8570.JPG", 0.45, 0.6, 1),
    ("IMG_8569.JPG", 0.64, 0.5, 1),  # wider, so her head and feet both fit
    ("IMG_9280.jpeg", 0.45, 0.5, 1),
    ("IMG_9294.jpeg", 0.62, 0.55, 1),
    ("IMG_9348.jpeg", 0.54, 0.45, 0.75),
    ("f321d86f-ed1a-47e0-bad1-a83b43e1fd79.JPG", 0.43, 0.55, 1),
    ("IMG_9888.jpeg", 0.6, 0.5, 0.55),
    ("e878fa81-5122-401c-a442-4a8611ddec96.JPG", 0.55, 0.5, 1),
    ("IMG_0466.jpeg", 0.36, 0.62, 1),
    ("IMG_0558.jpeg", 0.66, 0.46, 1),  # higher, so the cap fits
    ("IMG_0632.jpeg", 0.52, 0.55, 1),  # him and her in the water on the left
    ("IMG_0778.jpeg", 0.33, 0.6, 1),
    ("IMG_1318.jpeg", 0.65, 0.5, 1),
    ("IMG_1326.jpeg", 0.48, 0.66, 1),
    ("IMG_1732.jpeg", 0.5, 0.63, 0.85),
    ("IMG_1781.jpeg", 0.5, 0.66, 1),  # full width, so the donkey statue shows too
    ("IMG_1936.jpeg", 0.45, 0.46, 1),  # wider and higher, so his head fits with room above
    ("IMG_1943.jpeg", 0.57, 0.7, 1),
    ("IMG_2172.jpeg", 0.5, 0.6, 1),
    ("IMG_2463.jpeg", 0.4, 0.66, 1),
    ("IMG_2540.jpeg", 0.5, 0.62, 1),
    ("IMG_2669.JPG", 0.45, 0.43, 1),  # higher, so his hair is not cut
    ("IMG_2768.jpeg", 0.55, 0.52, 1),
    ("IMG_2896.jpeg", 0.47, 0.45, 1),  # higher, so the party hat fits
    ("IMG_2151.JPG", "asis"),  # the photo strip, last by author request
]
assert len(P) == 26 and len({p[0] for p in P}) == 26
missing = set(f for f in os.listdir(src) if not f.startswith(".")) - {p[0] for p in P}
assert not missing, missing

def framed(im, spec):
    W, H = im.size
    if spec[1] == "asis":
        return im
    _, fx, fy, z = spec
    bw = min(W, H * A, 2 * min(fx, 1 - fx) * W) * z
    bh = bw / A
    x0 = fx * W - bw / 2
    y0 = min(max(fy * H - bh / 2, 0), H - bh)
    return im.crop((round(x0), round(y0), round(x0 + bw), round(y0 + bh)))

os.makedirs(FULL, exist_ok=True); os.makedirs(THUMB, exist_ok=True); sheet_dir and os.makedirs(sheet_dir, exist_ok=True)
sheet = Image.new("RGB", (7 * 160, 4 * 200), "white")
total = 0
for i, spec in enumerate(P, 1):
    im = ImageOps.exif_transpose(Image.open(os.path.join(src, spec[0]))).convert("RGB")
    c = framed(im, spec)
    name = f"{i:02d}.jpg"
    # Saved without EXIF, so no location or camera data is published.
    if spec[1] == "asis":
        full = c.copy(); full.thumbnail((1000, 1800), Image.LANCZOS)
        thumb = c.copy(); thumb.thumbnail((360, 360), Image.LANCZOS)
    else:
        full = c.resize((800, 1000), Image.LANCZOS) if c.width >= 800 else c
        thumb = c.resize((288, 360), Image.LANCZOS)
    full.save(os.path.join(FULL, name), quality=80, optimize=True, progressive=True)
    thumb.save(os.path.join(THUMB, name), quality=72, optimize=True, progressive=True)
    fs, ts = os.path.getsize(os.path.join(FULL, name)), os.path.getsize(os.path.join(THUMB, name))
    total += fs + ts
    print(f"{spec[0]} -> {name}  crop {c.size}  full {fs // 1024} KB, thumb {ts // 1024} KB")
    sheet.paste(c.resize((160, 200)), (((i - 1) % 7) * 160, ((i - 1) // 7) * 200))
if sheet_dir: sheet.save(os.path.join(sheet_dir, "sheet.jpg"), quality=85)
print(f"total {total / 1024 / 1024:.2f} MB")
