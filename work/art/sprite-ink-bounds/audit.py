"""Read-only exact packed-body ink bounds; no PNG or descriptor writes."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent;BASE=HERE.parent/'go-parking-browser-overlay/overlay-v1';rows=[];inputs={}
def read(p):inputs[str(p.relative_to(BASE))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
for sprite in sorted((BASE/'sprites').glob('*/*.sprite.json')):
 meta=read(sprite);directory=sprite.parent
 for scale in ('1x','2x'):
  layers={}
  for layer in ('beauty','team'):
   poses={}
   for name in meta['atlases'][scale][layer]:
    desc=read(directory/name);p=directory/desc['meta']['image'];inputs[str(p.relative_to(BASE))]=hashlib.sha256(p.read_bytes()).hexdigest();arr=np.asarray(Image.open(p).convert('RGBA'))
    for key,frame in desc['frames'].items():
     f=frame['frame'];poses[key]=arr[f['y']:f['y']+f['h'],f['x']:f['x']+f['w'],3]
   layers[layer]=poses
  assert layers['beauty'].keys()==layers['team'].keys()
  for key,beauty in layers['beauty'].items():
   union=np.maximum(beauty,layers['team'][key]);bounds={}
   for minimum in (1,9,33,128):
    ys,xs=np.nonzero(union>=minimum);bounds[str(minimum)]=None if len(xs)==0 else {'x':int(xs.min()),'y':int(ys.min()),'w':int(xs.max()-xs.min()+1),'h':int(ys.max()-ys.min()+1)}
   rows.append({'id':meta['id'],'scale':scale,'key':key,'frame_size':list(reversed(union.shape)),'alpha_min_bounds':bounds,'nonzero_pixels':int((union>0).sum())})
(HERE/'audit.json').write_text(json.dumps({'scope':'Read-only existing packed beauty/team alpha union, frame-local coordinates; shadows excluded. Each scale independently measured.','inputs':inputs,'results':rows},indent=2)+'\n')
print('FC_INK_BOUNDS_AUDIT',len(rows),'frames')
for row in rows:
 if row['scale']=='1x' and row['id'] in ('unit.US.strike','unit.US.airlift','unit.IR.strike'):print(json.dumps(row))
