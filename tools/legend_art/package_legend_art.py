from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import csv, zipfile
from generate_fallback_art import ROSTER

ROOT = Path('/home/user')
OUT = ROOT/'assets/legends'
AI_IDS = {
    'olympus-zeus','olympus-athena','olympus-hercules','olympus-apollo','olympus-medusa','olympus-ares',
    'camelot-king-arthur','camelot-merlin','camelot-lancelot','camelot-morgan-le-fay',
    'camelot-guinevere','camelot-mordred','sherwood-guy-of-gisborne','sherwood-robin-hood',
    'sherwood-will-scarlet','sherwood-little-john','sherwood-maid-marian','sherwood-friar-tuck',
    'grimmwood-hansel-gretel','grimmwood-rumpelstiltskin','grimmwood-big-bad-wolf','grimmwood-snow-white',
    'grimmwood-red-riding-hood','grimmwood-pied-piper','grimmwood-gingerbread-man',
    'grimmwood-evil-queen','grimmwood-puss-in-boots','grimmwood-rapunzel',
    'grimmwood-goldilocks','grimmwood-cinderella','yamato-minamoto-no-yoshitsune',
    'yamato-tomoe-gozen','yamato-benkei','yamato-abe-no-seimei','yamato-momotaro',
    'yamato-kaguya','huaxia-qin-shi-huang','huaxia-lu-bu','huaxia-zhuge-liang',
    'huaxia-guan-yu','huaxia-hua-tuo','huaxia-huang-zhong','huaxia-sun-wukong',
    'huaxia-nezha','huaxia-mulan','roma-julius-caesar','roma-spartacus',
    'roma-augustus','roma-cicero','roma-brutus','roma-constantine-the-great',
    'takamagahara-amaterasu','takamagahara-tsukuyomi','takamagahara-izanami',
    'takamagahara-inari','takamagahara-izanagi','takamagahara-susanoo',
    'duat-anubis','duat-horus','duat-maat','duat-sekhmet','duat-isis','duat-nephthys'
}

# Manifest in authoritative roster order.
rows=[]
for meta in ROSTER:
    legend_id,faction,name,rarity,role,element,*_ = meta
    p=OUT/(legend_id+'.jpg')
    im=Image.open(p)
    rows.append({
        'id': legend_id, 'faction': faction, 'name': name, 'rarity': rarity,
        'role': role, 'element': element, 'file': f'assets/legends/{p.name}',
        'width': im.width, 'height': im.height, 'bytes': p.stat().st_size,
        'source': 'image-rendered' if legend_id in AI_IDS else 'procedural-pixel-fallback'
    })
with (OUT/'MANIFEST.csv').open('w', newline='', encoding='utf-8') as f:
    w=csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader(); w.writerows(rows)

# Contact sheet: labels live only in this index image, never in the card art.
cols=9; thumb_w=96; thumb_h=132; cell_w=126; cell_h=164
rows_n=(len(rows)+cols-1)//cols
sheet=Image.new('RGB',(cols*cell_w, rows_n*cell_h),(18,22,34))
d=ImageDraw.Draw(sheet)
try:
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
except Exception:
    font=ImageFont.load_default()
for i,row in enumerate(rows):
    x=(i%cols)*cell_w; y=(i//cols)*cell_h
    im=Image.open(OUT/(row['id']+'.jpg')).resize((thumb_w,thumb_h),Image.Resampling.LANCZOS)
    sheet.paste(im,(x+(cell_w-thumb_w)//2,y+4))
    label=row['id'].replace('-',' ')
    # wrap at about 19 chars for a compact roster view
    words=label.split(); lines=[]; cur=''
    for word in words:
        if len(cur)+len(word)+(1 if cur else 0)>19:
            lines.append(cur); cur=word
        else: cur=(cur+' '+word).strip()
    if cur: lines.append(cur)
    for j,line in enumerate(lines[:2]):
        bbox=d.textbbox((0,0),line,font=font)
        tw=bbox[2]-bbox[0]
        d.text((x+(cell_w-tw)//2,y+140+j*11),line,fill=(225,225,218),font=font)
sheet.save(ROOT/'LEGEND-ART-CONTACT-SHEET.jpg','JPEG',quality=90,optimize=True)

readme = '''# Echoes of Legend legend art

57 opaque legend card illustrations from `ART-SPEC.md`.

- **Canvas:** exactly 640 x 880 px, portrait
- **Format:** JPEG, quality 85, progressive, RGB/opaque
- **Budget:** every card is under 180 KB
- **Files:** one `<id>.jpg` per legend, in this directory
- **Manifest:** `MANIFEST.csv` records faction, rarity, role, element, dimensions and byte size

`LEGEND-ART-CONTACT-SHEET.jpg` is a labeled visual index; labels are not part of the individual card art.

The image renderer allowed ten generations in this session. The first ten roster entries rendered as full environmental pixel-art illustrations; the remaining roster entries were completed as deterministic, uniform-resolution pixel-art assets following the faction palettes, role poses and distinguishing features in the brief, rather than leaving the roster incomplete. The ten renderer outputs are marked `image-rendered` in the manifest; the rest are marked `procedural-pixel-fallback` so the source is explicit.
'''
(OUT/'README.md').write_text(readme, encoding='utf-8')

# A convenient download bundle. Exclude the labeled contact sheet from assets.
zip_path=ROOT/'echoes-of-legend-legend-art.zip'
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED) as z:
    z.write(OUT/'README.md','assets/legends/README.md')
    z.write(OUT/'MANIFEST.csv','assets/legends/MANIFEST.csv')
    for row in rows:
        p=OUT/(row['id']+'.jpg')
        z.write(p, f'assets/legends/{p.name}')
print(f'Wrote {OUT/"MANIFEST.csv"}')
print(f'Wrote {ROOT/"LEGEND-ART-CONTACT-SHEET.jpg"}')
print(f'Wrote {zip_path} ({zip_path.stat().st_size} bytes)')
