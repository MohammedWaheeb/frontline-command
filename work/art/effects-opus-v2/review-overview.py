"""Reconstruct selected actual packed frames at native world scale for review."""
from pathlib import Path
import argparse
import json
import math
import sys

sys.path.insert(0, str(Path(__file__).parent / 'src'))
from PIL import Image, ImageDraw
from contacts import background, text

ap=argparse.ArgumentParser()
ap.add_argument('--pack', type=Path, required=True)
ap.add_argument('--out', type=Path, required=True)
ap.add_argument('--ids', nargs='+', required=True)
ap.add_argument('--variant', default='standard')
ap.add_argument('--background', default='dirt', choices=['dirt','dark','concrete'])
args=ap.parse_args()
if args.out.exists():raise RuntimeError('Preserve the earlier review image.')
rows=[]
for eid in args.ids:
    group,name=eid.split('.')[1:]
    base=args.pack/'fx'/group/name
    meta=json.loads((base/'effect.json').read_text())
    clip=meta['clips'][meta['variants'][args.variant]]
    # Fixed authored origin across different crops and a union over the whole
    # actual clip, so a late drifting plume cannot be clipped by the review.
    frames=clip['frames'];res=meta['resolution']
    left=min(-f['origin'][0] for f in frames);right=max(f['w']-f['origin'][0] for f in frames)
    top=min(-f['origin'][1] for f in frames);bottom=max(f['h']-f['origin'][1] for f in frames)
    w=max(64,math.ceil((right-left)/res)+16);h=max(64,math.ceil((bottom-top)/res)+16)
    ox,oy=8-left/res,8-top/res
    times=sorted(set(round((len(frames)-1)*t) for t in (.08,.25,.5,.8)))
    pages=[Image.open(base/p['file']).convert('RGBA') for p in meta['pages']]
    row=Image.new('RGB',(w*4,h+30),(33,31,26))
    text(ImageDraw.Draw(row),(3,2),eid+' / '+args.variant)
    for i,frame_index in enumerate(times):
        f=frames[frame_index]
        im=pages[f['page']].crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))
        if res!=1:im=im.resize((max(1,round(im.width/res)),max(1,round(im.height/res))),Image.Resampling.BOX)
        tile=background(args.background,w,h)
        tile.paste(im,(round(ox-f['origin'][0]/res),round(oy-f['origin'][1]/res)),im)
        text(ImageDraw.Draw(tile),(3,h-13),f'frame {frame_index}')
        row.paste(tile,(i*w,18))
    rows.append(row)
out=Image.new('RGB',(max(r.width for r in rows),sum(r.height for r in rows)),(33,31,26))
y=0
for row in rows:out.paste(row,(0,y));y+=row.height
args.out.parent.mkdir(parents=True,exist_ok=True)
out.save(args.out)
print(args.out,out.size)
