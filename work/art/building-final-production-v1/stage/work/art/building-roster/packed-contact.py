"""Native pages of every packed pose; turret pages assemble all ground shadows first."""
from pathlib import Path
import functools,json,math,sys
from PIL import Image,ImageDraw
repo=Path(__file__).resolve().parents[3];sys.path.insert(0,str(repo/'assets/pipeline/tools'))
from composite import tint,shadow_layer
aid=sys.argv[1];spec=json.loads((repo/'assets/pipeline/specs'/(aid+'.json')).read_text());assert spec['model']=='building_roster'
root=repo/'assets/build/sprites'/aid;side=json.loads((root/(aid+'.sprite.json')).read_text());out=repo/'work/art/building-roster/production-contacts'/aid;out.mkdir(parents=True,exist_ok=True)
@functools.lru_cache(maxsize=3)
def atlas(name):
 with Image.open(root/name) as im:return im.convert('RGBA')
index={}
for layer,names in side['atlases']['1x'].items():
 for name in names:
  page=json.loads((root/name).read_text())
  for key,item in page['frames'].items():
   assert (layer,key) not in index;index[layer,key]=(page['meta']['image'],item['frame'])
w,h=[v//2 for v in spec['canvas']];origin=tuple((a-b)//2 for a,b in zip(spec['anchor'],side['anchor_2x']))
def layer(key,name):
 if (name,key) not in index:return None
 fn,r=index[name,key];im=atlas(fn).crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h']))
 return shadow_layer(im) if name=='shadow' else tint(im,'#BDA14D') if name=='team' else im
def cell(key,turret=False):
 im=Image.new('RGBA',(w,h),'#8C806B');order=[(key,'shadow'),(key,'beauty'),(key,'team')]
 if turret:order=[('idle/d00_f00','shadow'),(key,'shadow'),('idle/d00_f00','beauty'),('idle/d00_f00','team'),(key,'beauty'),(key,'team')]
 for k,n in order:
  part=layer(k,n)
  if part is not None:im.alpha_composite(part,origin)
 return im
pages={};allposes=[]
for s in spec['states']:
 for d in range(s['directions']):
  for f in range(s['frames']):allposes.append((f"{s['name']}/d{d:02d}_f{f:02d}",s.get('part')=='turret'))
for page,start in enumerate(range(0,len(allposes),12),1):
 rows=allposes[start:start+12];im=Image.new('RGB',(w*3,(h+22)*math.ceil(len(rows)/3)),'#8C806B');draw=ImageDraw.Draw(im)
 for i,(key,turret) in enumerate(rows):
  x=i%3*w;y=i//3*(h+22);im.paste(cell(key,turret),(x,y+22));draw.text((x+4,y+4),key+(' (assembled)' if turret else ''),fill='#181713')
 name=f'poses-{page:02d}@1x.png';im.save(out/name);pages[name]=[key for key,_ in rows]
# One state overview for quick operational identity; full pages retain every pose.
selected=[]
for s in spec['states']:
 for f in sorted({0,s['frames']//2,s['frames']-1}):selected.append((f"{s['name']}/d00_f{f:02d}",s.get('part')=='turret'))
for page,start in enumerate(range(0,len(selected),12),1):
 rows=selected[start:start+12];im=Image.new('RGB',(w*3,(h+22)*math.ceil(len(rows)/3)),'#8C806B');draw=ImageDraw.Draw(im)
 for i,(key,turret) in enumerate(rows):
  x=i%3*w;y=i//3*(h+22);im.paste(cell(key,turret),(x,y+22));draw.text((x+4,y+4),key,fill='#181713')
 im.save(out/f'state-overview-{page:02d}@1x.png')
# Matched UI scales, the same mask tint as the native sprite pages.
gallery=Image.new('RGBA',(528,238),'#8C806B');draw=ImageDraw.Draw(gallery)
for part,x in [('portraits',0),('icons/build',208)]:
 for scale,factor in [('2x',1),('1x',2)]:
  prefix=repo/'assets/build/ui'/part/(aid+'@'+scale);beauty=Image.open(str(prefix)+'.beauty.png').convert('RGBA');team=Image.open(str(prefix)+'.team.png').convert('RGBA');pos=(x,24) if factor==1 else (360+x//2,24);gallery.alpha_composite(beauty,pos);gallery.alpha_composite(tint(team,'#BDA14D'),pos)
 draw.text((x+3,5),part,fill='#181713')
gallery.convert('RGB').save(out/'ui-contact@1x-2x.png');(out/'pages.json').write_text(json.dumps({'scope':'Actual packed1× pixels, all required poses, assembled live turret layers; independent shadows behind opaque base','pages':pages,'poses':len(allposes)},indent=2)+'\n');print(aid,len(allposes),'poses',len(pages),'native pages')
