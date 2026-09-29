from pathlib import Path
import json,sys,hashlib
from PIL import Image,ImageDraw
import numpy as np
REPO=Path(__file__).resolve().parents[3];STAGE=REPO/'work/art/aircraft-final-production-v3/stage';BASE=REPO/'work/art/strike-crash-attachment-candidate-v1/pilot-v2';sys.path.insert(0,str(STAGE/'assets/pipeline/tools'));from pack_sprites import normalise,downsample_premultiplied;from composite import shadow_layer
result=json.loads((BASE/'result.json').read_text());assert result['failures']==0
out=BASE/'contacts';assert not out.exists();out.mkdir();images={}
for row in result['assets']:
 for scale,div in [('1x',2),('2x',1)]:
  w,h=[v//div for v in row['canvas']];sheet=Image.new('RGBA',(4*w,2*(h+26)),'#8C806B');draw=ImageDraw.Draw(sheet)
  for n,key in enumerate(row['rendered_keys']):
   cell=Image.new('RGBA',(w,h),'#8C806B')
   for layer in ['shadow','beauty']:
    path=BASE/'frames'/row['id']/layer/(key+'.png');im=Image.open(path).convert('RGBA');a=normalise(layer,im);im=Image.fromarray(downsample_premultiplied(a) if div==2 else a.clip(0,255).astype(np.uint8),'RGBA');im=shadow_layer(im) if layer=='shadow' else im;cell.alpha_composite(im)
   x=n%4*w;y=n//4*(h+26);sheet.paste(cell,(x,y+26));draw.text((x+4,y+5),key,fill='#171713')
  p=out/(row['id']+'@'+scale+'.png');sheet.convert('RGB').save(p);images[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(out/'result.json').write_text(json.dumps({'scope':'Candidate source pilot, native scale and anchor; consumes only frozen crash beauty/shadow layers. No production PNG comparison or final acceptance.','source_result_sha256':hashlib.sha256((BASE/'result.json').read_bytes()).hexdigest(),'files':images},indent=2)+'\n')
