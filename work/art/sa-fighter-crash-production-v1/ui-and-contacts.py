"""Native staged runtime-atlas pose pages plus paired UI checks; no publishing."""
from pathlib import Path
import functools,json,math,sys
import numpy as np
from PIL import Image,ImageDraw
repo=Path(__file__).resolve().parents[3];base=repo/'work/art/sa-fighter-crash-production-v1';lock=json.loads((base/'production-lock.json').read_text());stage=repo/lock['stage'];sys.path.insert(0,str(stage/'assets/pipeline/tools'));from pack_sprites import downsample_premultiplied;from composite import tint,shadow_layer
aid=sys.argv[1];assert aid in lock['assets'];spec=json.loads((stage/'assets/pipeline/specs'/(aid+'.json')).read_text());root=stage/'assets/build/sprites'/aid;side=json.loads((root/(aid+'.sprite.json')).read_text());out=base/'contacts'/aid;out.mkdir(parents=True,exist_ok=True)
checks=[];gallery=Image.new('RGBA',(528,238),'#8C806B');draw=ImageDraw.Draw(gallery)
for folder,size,x in [('portraits',(192,192),0),('icons/build',(128,96),208)]:
 key=spec.get('role_id',aid);source=stage/'assets/build/ui'/folder
 for layer in ['beauty','team']:
  path=source/(key+'@2x.'+layer+'.png');im=Image.open(path).convert('RGBA');Image.fromarray(downsample_premultiplied(np.asarray(im).astype(np.float32)),'RGBA').save(source/(key+'@1x.'+layer+'.png'))
 for scale,factor in [('2x',1),('1x',2)]:
  body=Image.open(source/(key+'@'+scale+'.beauty.png')).convert('RGBA');team=Image.open(source/(key+'@'+scale+'.team.png')).convert('RGBA');a=np.asarray(body)[:,:,3];t=np.asarray(team)[:,:,3];tests={'dimensions':body.size==team.size==(size[0]//factor,size[1]//factor),'nonempty':int((a>8).sum())>30 and int((t>8).sum())>5,'transparent_corners':int(max(a[0,0],a[0,-1],a[-1,0],a[-1,-1]))==0,'no_border':not bool((np.concatenate([a[0],a[-1],a[:,0],a[:,-1]])>8).any()),'team_inside':int(((t>32)&(a<8)).sum())<=max(4,.005*int((t>32).sum()))};checks.extend({'folder':folder,'scale':scale,'check':k,'ok':bool(v)} for k,v in tests.items());pos=(x,24) if factor==1 else (360+x//2,24);gallery.alpha_composite(body,pos);gallery.alpha_composite(tint(team,'#BDA14D'),pos)
 draw.text((x+3,5),folder,fill='#171713')
gallery.convert('RGB').save(out/'ui-contact@1x-2x.png');(base/('ui-check-'+aid+'.json')).write_text(json.dumps({'id':aid,'checks':checks,'failures':sum(not r['ok'] for r in checks)},indent=2)+'\n');assert all(r['ok'] for r in checks),[r for r in checks if not r['ok']]
@functools.lru_cache(maxsize=3)
def atlas(name):
 with Image.open(root/name) as im:return im.convert('RGBA')
records=[]
for scale,divisor in [('1x',2),('2x',1)]:
 index={}
 for layer,names in side['atlases'][scale].items():
  for name in names:
   page=json.loads((root/name).read_text())
   for key,data in page['frames'].items():assert (layer,key) not in index;index[layer,key]=(page['meta']['image'],data['frame'])
 width,height=[v//divisor for v in spec['canvas']];origin=tuple((a-b)//divisor for a,b in zip(spec['anchor'],side['anchor_2x']))
 for state in spec['states']:
  pairs=[(d,0) for d in range(state['directions'])]+[(min(3,state['directions']-1),f) for f in range(1,state['frames'])]
  for start in range(0,len(pairs),12):
   group=pairs[start:start+12];sheet=Image.new('RGBA',(width*4,(height+26)*math.ceil(len(group)/4)),'#8C806B');draw=ImageDraw.Draw(sheet)
   for n,(d,f) in enumerate(group):
    key=f"{state['name']}/d{d:02d}_f{f:02d}";cell=Image.new('RGBA',(width,height),'#8C806B')
    for layer in ['shadow','beauty','team']:
     if (layer,key) not in index:continue
     name,rect=index[layer,key];im=atlas(name).crop((rect['x'],rect['y'],rect['x']+rect['w'],rect['y']+rect['h']));im=shadow_layer(im) if layer=='shadow' else tint(im,'#BDA14D') if layer=='team' else im;cell.alpha_composite(im,origin)
    x=n%4*width;y=n//4*(height+26);sheet.paste(cell,(x,y+26));draw.text((x+4,y+5),key,fill='#171713')
   name=f"{state['name']}-{start//12+1:02d}@{scale}.png";sheet.convert('RGB').save(out/name);records.append({'path':name,'scale':scale,'state':state['name'],'poses':group})
 atlas.cache_clear()
(out/'pages.json').write_text(json.dumps({'id':aid,'scope':'Native atlas composition; every heading first frame and every frame at heading3; full pixel checks cover all raw poses; staged only','pages':records},indent=2)+'\n');print('FC_STAGED_UI_CONTACTS_DONE',aid,len(checks),'UI checks',len(records),'native pages')
