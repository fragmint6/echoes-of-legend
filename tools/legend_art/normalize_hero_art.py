from pathlib import Path
from PIL import Image

OUT = Path('/home/user/assets/heroes')
TARGET_W, TARGET_H = 640, 880
TARGET_ASPECT = TARGET_W / TARGET_H

for p in sorted(OUT.glob('*.jpg')):
    im = Image.open(p).convert('RGB')
    w, h = im.size
    # Centre-crop to the authoritative portrait aspect before exact resize.
    current = w / h
    if current > TARGET_ASPECT:
        new_w = round(h * TARGET_ASPECT)
        left = (w - new_w) // 2
        im = im.crop((left, 0, left + new_w, h))
    elif current < TARGET_ASPECT:
        new_h = round(w / TARGET_ASPECT)
        top = (h - new_h) // 2
        im = im.crop((0, top, w, top + new_h))
    im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    im.save(p, 'JPEG', quality=85, optimize=True, progressive=True, subsampling=2)
    print(f'{p.name}\t{im.size[0]}x{im.size[1]}\t{p.stat().st_size} bytes')
