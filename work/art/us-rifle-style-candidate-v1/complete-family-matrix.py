"""Fresh25-role review matrix from pinned complete exports, replacing only rifle source."""
from pathlib import Path
import hashlib,json,sys
from PIL import Image,ImageDraw
B=Path(__file__).resolve().parent;R=B.parents[2];sys.path.insert(0,str(B/'production-v1/stage/assets/pipeline/tools'));from composite import tint,shadow_layer
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();registry=R/'work/art/ui-team-normalization-audit-v1/normalized-roster-v2/result.json';j=json.loads(registry.read_text());inputs={str(registry.relative_to(R)):sha(registry)};roles=['rifle','at','recon','elite','engineer','medic','portable_aa'];factions=['US','IR','SY','SA'];selected={};handoffs={}
for faction in factions:
 for role in roles:
  if role=='portable_aa'and faction!='SY':continue
  aid=f'unit.{faction}.{role}'
  if aid=='unit.US.rifle':p=B/'production-v1/runtime-handoff/unit.US.rifle.json'
  else:
   row=next(x for x in j['handoffs']if x['id']==aid);p=R/row['path'];assert sha(p)==row['sha256']
  h=json.loads(p.read_text());assert h['id']==aid;selected[aid]=h;inputs[str(p.relative_to(R))]=sha(p);handoffs[aid]={'path':str(p.relative_to(R)),'sha256':sha(p)}
assert len(selected)==25;out=B/'complete-family-v1';assert not out.exists();out.mkdir()
def get(h,key):
 row=h['files'][key];p=R/row['source'];assert sha(p)==row['sha256']and p.stat().st_size==row['bytes'];inputs[str(p.relative_to(R))]=row['sha256'];return p
for scale,factor in [('1x',1),('2x',2)]:
 cw,ch=150*factor,168*factor;sheet=Image.new('RGBA',(7*cw,4*ch),'#8C7F66');draw=ImageDraw.Draw(sheet)
 for row,faction in enumerate(factions):
  for col,role in enumerate(roles):
   x,y=col*cw,row*ch;aid=f'unit.{faction}.{role}'
   if aid not in selected:draw.text((x+6,y+6),'No roster role',fill='#39352B');continue
   h=selected[aid];draw.text((x+6,y+6),aid,fill='#181813');prefix=f'sprites/{aid}/';side=json.loads(get(h,prefix+aid+'.sprite.json').read_text());key='idle/d01_f00'
   for layer in ['shadow','beauty','team']:
    matches=[]
    for name in side['atlases'][scale].get(layer,[]):
     page=json.loads(get(h,prefix+name).read_text())
     if key in page['frames']:matches.append((page['meta']['image'],page['frames'][key]['frame']))
    assert len(matches)==1;name,f=matches[0]
    with Image.open(get(h,prefix+name))as im:part=im.convert('RGBA').crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))
    part=shadow_layer(part)if layer=='shadow'else tint(part,'#C6A34A')if layer=='team'else part;anchor=[a*factor/2 for a in side['anchor_2x']];pos=(round(x+40*factor-anchor[0]),round(y+90*factor-anchor[1]));assert pos[0]>=x and pos[1]>=y and pos[0]+part.width<=x+cw and pos[1]+part.height<=y+ch;sheet.alpha_composite(part,pos)
   for layer in ['beauty','team']:
    with Image.open(get(h,f'ui/icons/build/{faction}.{role}@{scale}.{layer}.png'))as im:part=im.convert('RGBA')
    if layer=='team':part=tint(part,'#C6A34A')
    pos=(x+75*factor,y+30*factor);assert pos[0]+part.width<=x+cw and pos[1]+part.height<=y+ch;sheet.alpha_composite(part,pos)
   draw.text((x+6,y+120*factor),'idle d1 + build cameo',fill='#181813');draw.text((x+6,y+135*factor),'same tint; native '+scale,fill='#181813')
 sheet.convert('RGB').save(out/f'roles-and-factions@{scale}.png')
(out/'receipt.json').write_text(json.dumps({'scope':'Fresh exact native25-role matrix. Only US rifle uses its new accepted full200 handoff; other24 use byte-pinned previous complete exports. Original matrices/products untouched. No new pixel scaling/normalization, model edits or final visual claim.','handoffs':handoffs,'inputs':inputs,'images':{p.name:sha(p)for p in out.glob('*.png')}},indent=2)+'\n');print('FC_COMPLETE_INFANTRY_UPDATED_MATRIX',25)
