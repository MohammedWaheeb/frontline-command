from pathlib import Path
import json,sys,functools,hashlib
from PIL import Image,ImageDraw
import numpy as np
repo=Path('/Users/mohammedkalouti/Documents/Codex/2026-09-27/i');stage=repo/'work/art/sa-fighter-crash-production-v1/stage';sys.path.insert(0,str(stage/'assets/pipeline/tools'));from composite import tint,shadow_layer
base=repo/'work/art/sa-fighter-crash-attachment-v1';out=base/'all-crash-native-v2';assert not out.exists();out.mkdir();aid='unit.SA.fighter';root=stage/'assets/build/sprites'/aid;spec=json.loads((stage/'assets/pipeline/specs'/f'{aid}.json').read_text());side=json.loads((root/f'{aid}.sprite.json').read_text());index={}
for layer,names in side['atlases']['1x'].items():
 for name in names:
  page=json.loads((root/name).read_text())
  for key,data in page['frames'].items():index[layer,key]=(page['meta']['image'],data['frame'])
@functools.lru_cache(maxsize=3)
def atlas(name):
 with Image.open(root/name) as im:return im.convert('RGBA')
w,h=[v//2 for v in spec['canvas']];origin=tuple((a-b)//2 for a,b in zip(spec['anchor'],side['anchor_2x']));files={}
for start in range(0,16,4):
 sheet=Image.new('RGBA',(4*w,4*(h+26)),'#8C806B');draw=ImageDraw.Draw(sheet)
 for d in range(start,start+4):
  for f in range(4):
   key=f'crash/d{d:02d}_f{f:02d}';cell=Image.new('RGBA',(w,h),'#8C806B')
   for layer in ['shadow','beauty','team']:
    if (layer,key) not in index:continue
    name,r=index[layer,key];im=atlas(name).crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h']));im=shadow_layer(im) if layer=='shadow' else tint(im,'#BDA14D') if layer=='team' else im;cell.alpha_composite(im,origin)
   x=f*w;y=(d-start)*(h+26);sheet.paste(cell,(x,y+26));draw.text((x+4,y+5),key,fill='#171713')
 path=out/f'crash-all-{start//4+1:02d}@1x.png';sheet.convert('RGB').save(path);files[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
(out/'result.json').write_text(json.dumps({'scope':'All64 corrected crash tuples at native1x from final packed atlas, unchanged original world canvas/anchor; no scaling.','files':files,'poses':64,'handoff_pending':True},indent=2)+'\n')
