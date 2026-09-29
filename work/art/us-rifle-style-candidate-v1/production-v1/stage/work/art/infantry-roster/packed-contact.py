"""Every infantry pose from exact packed native pixels; no presentation resizing."""
from pathlib import Path
import json,sys,functools
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[3];sys.path.insert(0,str(R/'assets/pipeline/tools'));from composite import tint,shadow_layer
aid=sys.argv[1];spec=json.loads((R/'assets/pipeline/specs'/f'{aid}.json').read_text());D=R/'assets/build/sprites'/aid;side=json.loads((D/f'{aid}.sprite.json').read_text());out=R/'work/art/infantry-roster/contacts'/aid;out.mkdir(parents=True);index={}
for layer,names in side['atlases']['1x'].items():
 for name in names:
  page=json.loads((D/name).read_text())
  for key,value in page['frames'].items():assert (layer,key)not in index;index[layer,key]=(page['meta']['image'],value['frame'])
@functools.lru_cache(maxsize=6)
def atlas(name):
 with Image.open(D/name)as im:return im.convert('RGBA')
w,h=[v//2 for v in spec['canvas']];offset=[(a-b)//2 for a,b in zip(spec['anchor'],side['anchor_2x'])];pages={}
for st in spec['states']:
 rows=[f"{st['name']}/d{d:02d}_f{f:02d}" for f in range(st['frames']) for d in range(st['directions'])];sheet=Image.new('RGBA',(w*st['directions'],(h+18)*st['frames']),'#8C806B');draw=ImageDraw.Draw(sheet)
 for n,key in enumerate(rows):
  x=n%st['directions']*w;y=n//st['directions']*(h+18);draw.text((x+2,y+2),f"d{n%st['directions']:02d} f{n//st['directions']:02d}",fill='#171713')
  for layer in ['shadow','beauty','team']:
   if (layer,key)not in index:continue
   name,f=index[layer,key];part=atlas(name).crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));part=shadow_layer(part)if layer=='shadow'else tint(part,'#3E8EDE')if layer=='team'else part;sheet.alpha_composite(part,(x+offset[0],y+18+offset[1]))
 name=f"{st['name']}@1x.png";sheet.convert('RGB').save(out/name);pages[name]=rows
(out/'pages.json').write_text(json.dumps({'id':aid,'poses':sum(len(x)for x in pages.values()),'pages':pages,'scope':'Exact packed1x beauty/team/shadow all required directions and phases.'},indent=2)+'\n');print('FC_RIFLE_PACKED_CONTACT',len(pages),sum(len(x)for x in pages.values()))
