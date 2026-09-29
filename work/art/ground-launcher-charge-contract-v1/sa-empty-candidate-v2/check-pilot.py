"""Full selected-frame integrity and native comparison sheets; no production writes."""
from pathlib import Path
import hashlib,json,sys,math
import numpy as np
from PIL import Image,ImageDraw
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[3];C=HERE.parent/'candidate-v1';aid='unit.SA.launcher';out=HERE/'pilot-v1'
sys.path.insert(0,str(REPO/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/pipeline/tools'));from pack_sprites import normalise,downsample_premultiplied;from composite import tint,shadow_layer
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();report=json.loads((out/'render.json').read_text());s=json.loads((C/'specs'/f'{aid}.json').read_text());states={st['name']:st for st in s['states']};plan=next(r['poses'] for r in json.loads((HERE.parent/'pilot-plan.json').read_text()) if r['id']==aid)
plan += [{'state':'ready_empty','direction':d,'frame':0} for d in [3,7,11,15]]
checks=[]
def rec(key,ok):checks.append({'check':key,'ok':bool(ok)})
for row in report['records']:
 for path,want in row['files'].items():
  p=out/path;assert sha(p)==want
  with Image.open(p) as im:
   rec(path+'/dimensions',im.size==tuple(s['canvas']));layer=Path(path).parts[1];a=normalise(layer,im);alpha=a[:,:,3];border=np.concatenate([alpha[0,:],alpha[-1,:],alpha[:,0],alpha[:,-1]])
   rec(path+'/no_border',not (border>8).any())
   if layer=='beauty':rec(path+'/visible_body',(alpha>8).sum()>20)
   if layer=='shadow':rec(path+'/black_shadow',not a[:,:,:3].any())
# All moving variants must visibly vary; no waiver for mere metadata/hash changes.
for name in sorted({r['state'] for r in plan}):
 frames=sorted({r['frame'] for r in plan if r['state']==name and r['direction']==3})
 if len(frames)>1:
  arrays=[normalise('beauty',Image.open(out/'candidate/beauty'/name/f'd03_f{f:02d}.png')) for f in frames]
  rec(name+'/visible_pose_variation',any(np.any(arrays[0]!=a) for a in arrays[1:]))
contacts=out/'contacts';assert not contacts.exists();contacts.mkdir();images={}
def compose(folder,key,scale):
 size=tuple(v//scale for v in s['canvas']);im=Image.new('RGBA',size,'#8C806B')
 for layer in ('shadow','beauty','team'):
  path=out/folder/layer/(key+'.png');a=normalise(layer,Image.open(path));a=downsample_premultiplied(a) if scale==2 else a.astype(np.uint8);part=Image.fromarray(a,'RGBA');part=shadow_layer(part) if layer=='shadow' else tint(part,'#BDA14D') if layer=='team' else part;im.alpha_composite(part)
 return im
for name in sorted({r['state'] for r in plan}):
 rows=[r for r in plan if r['state']==name]
 for scale in (2,1):
  w,h=[v//scale for v in s['canvas']]
  for start in range(0,len(rows),8):
   group=rows[start:start+8];sheet=Image.new('RGBA',(4*w,(h+24)*math.ceil(len(group)/2)),'#8C806B');draw=ImageDraw.Draw(sheet)
   for i,row in enumerate(group):
    suffix=f"d{row['direction']:02d}_f{row['frame']:02d}";base=name.rsplit('_charges_',1)[0];x=i%2*w*2;y=i//2*(h+24)
    sheet.paste(compose('before',base+'/'+suffix,scale),(x,y+24));sheet.paste(compose('candidate',name+'/'+suffix,scale),(x+w,y+24));draw.text((x+3,y+4),base+'/'+suffix,fill='#171713');draw.text((x+w+3,y+4),name+'/'+suffix,fill='#171713')
   p=contacts/f'{name}-{start//8+1:02d}@{1 if scale==2 else 2}x.png';sheet.convert('RGB').save(p);images[p.name]=sha(p)
# The generic firing state remains frozen; show its final frame next to the
# newly authored empty-ready shell, without silently hiding the transition.
for scale in (2,1):
 w,h=[v//scale for v in s['canvas']]
 for n,dirs in enumerate(([3,7],[11,15])):
  sheet=Image.new('RGBA',(2*w,2*(h+24)),'#8C806B');draw=ImageDraw.Draw(sheet)
  for row,d in enumerate(dirs):
   y=row*(h+24)
   for col,folder,key in [(0,'before',f'fire/d{d:02d}_f03'),(1,'candidate',f'ready_empty/d{d:02d}_f00')]:
    sheet.paste(compose(folder,key,scale),(col*w,y+24));draw.text((col*w+3,y+4),key,fill='#171713')
  p=contacts/f'fire-to-empty-{n+1:02d}@{1 if scale==2 else 2}x.png';sheet.convert('RGB').save(p);images[p.name]=sha(p)
result={'id':aid,'checks':len(checks),'failures':sum(not r['ok'] for r in checks),'results':checks,'images':images,'scope':'Selected new charge-state pilot plus exact/copy references; native visual review and actual Go course remain separate.'};(out/'check.json').write_text(json.dumps(result,indent=2)+'\n');print('FC_CHARGE_PILOT_CHECK',aid,len(checks),result['failures']);assert result['failures']==0
