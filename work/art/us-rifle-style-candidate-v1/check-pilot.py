"""Same-ground-origin, unchanged-world-zoom rifle comparison at native scales."""
from pathlib import Path
import hashlib,json,sys,math,functools
import numpy as np
from PIL import Image,ImageDraw
B=Path(__file__).resolve().parent;R=B.parents[2];S=B/'stage';out=B/'pilot-v1';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();report=json.loads((out/'render.json').read_text());specs={'before':json.loads((B/'reference-spec.json').read_text()),'candidate':json.loads((B/'unit.US.rifle.json').read_text())};states={s['name']:s for s in specs['candidate']['states']};sys.path.insert(0,str(S/'assets/pipeline/tools'));from pack_sprites import normalise,downsample_premultiplied;from composite import tint,shadow_layer
checks=[];arrays={};measure=[]
def rec(name,ok):checks.append({'check':name,'ok':bool(ok)})
for row in report['records']:
 folder,key=row['folder'],row['key'];spec=specs[folder];layer_arrays={}
 for rel,want in row['files'].items():
  p=out/rel;assert sha(p)==want;layer=Path(rel).parts[1]
  with Image.open(p) as im:rec(rel+'/dimensions',im.size==tuple(spec['canvas']));arr=normalise(layer,im)
  alpha=arr[:,:,3];border=np.concatenate([alpha[0],alpha[-1],alpha[:,0],alpha[:,-1]]);rec(rel+'/no_border',not (border>8).any());arrays[folder,key,layer]=arr;layer_arrays[layer]=arr
  if layer=='beauty':
   rec(rel+'/body_visible',int((alpha>8).sum())>30);ys,xs=np.nonzero(alpha>8);measure.append({'folder':folder,'key':key,'ink_bounds_relative_ground_2x':[int(xs.min())-spec['anchor'][0],int(ys.min())-spec['anchor'][1],int(xs.max())-spec['anchor'][0],int(ys.max())-spec['anchor'][1]]})
  if layer=='shadow':rec(rel+'/black_shadow',not arr[:,:,:3].any())
 if 'team' in layer_arrays:
  a=layer_arrays['beauty'][:,:,3];t=layer_arrays['team'][:,:,3];rec(f'{folder}/{key}/team_inside',int(((t>32)&(a<8)).sum())<=max(4,.005*int((t>32).sum())))
for name,st in states.items():
 if st['frames']>1:
  variants=[arrays['candidate',f'{name}/d01_f{f:02d}','beauty'] for f in range(st['frames'])];rec(name+'/visible_pose_variation',any(np.any(variants[0]!=x) for x in variants[1:]))
contacts=out/'contacts';assert not contacts.exists();contacts.mkdir();images={}
def compose(folder,key,div,color='#3E8EDE'):
 canvas=specs['candidate']['canvas'];origin=[(a-b)//div for a,b in zip(specs['candidate']['anchor'],specs[folder]['anchor'])];im=Image.new('RGBA',tuple(v//div for v in canvas),'#8C806B')
 for layer in ['shadow','beauty','team']:
  if (folder,key,layer) not in arrays:continue
  a=arrays[folder,key,layer];a=downsample_premultiplied(a) if div==2 else a.clip(0,255).astype(np.uint8);part=Image.fromarray(a,'RGBA');part=shadow_layer(part) if layer=='shadow' else tint(part,color) if layer=='team' else part;im.alpha_composite(part,tuple(origin))
 return im
for name,st in states.items():
 keys=[f'{name}/d{d:02d}_f{f:02d}' for d in [1,5] for f in range(st['frames'])]
 for div in [2,1]:
  w,h=[v//div for v in specs['candidate']['canvas']]
  for start in range(0,len(keys),8):
   group=keys[start:start+8];sheet=Image.new('RGBA',(4*w,(h+26)*math.ceil(len(group)/2)),'#8C806B');draw=ImageDraw.Draw(sheet)
   for n,key in enumerate(group):
    x=(n%2)*w*2;y=(n//2)*(h+26)
    for col,folder in enumerate(['before','candidate']):sheet.paste(compose(folder,key,div),(x+col*w,y+26));draw.text((x+col*w+3,y+3),folder,fill='#171713');draw.text((x+col*w+3,y+14),key,fill='#171713')
   p=contacts/f'{name}-before-after-{start//8+1:02d}@{1 if div==2 else 2}x.png';sheet.convert('RGB').save(p);images[p.name]=sha(p)
result={'scope':'50-pose native same-world-zoom comparison, old frames exact and grounded by anchor delta. Height changes are measured rather than hidden with rescaling. Family context/UI and direct native review remain required.','checks':len(checks),'failures':sum(not x['ok'] for x in checks),'results':checks,'native_images':images,'body_ink_measurements':measure};(out/'check.json').write_text(json.dumps(result,indent=2)+'\n');print('FC_RIFLE_STYLE_PILOT_CHECK',len(checks),result['failures']);assert result['failures']==0
