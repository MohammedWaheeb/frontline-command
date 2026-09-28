"""Reproducible old/new export comparison; never changes raw or shipping images."""
from pathlib import Path
import ast,hashlib,json,sys
import numpy as np
from PIL import Image,ImageDraw
repo=Path(__file__).resolve().parents[3];sys.path.insert(0,str(repo/'assets/pipeline/tools'))
from pack_sprites import downsample_premultiplied,normalise
from composite import tint,shadow_layer
base=Path(__file__).resolve().parent;oldsource=(base/'before-pack_sprites.py').read_text();tree=ast.parse(oldsource);fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='downsample_premultiplied');ns={'Image':Image,'np':np};exec(compile(ast.Module(body=[fn],type_ignores=[]),'before-pack_sprites.py','exec'),ns);old=ns['downsample_premultiplied']
rows=[]
for aid,state,frame,layers in [('prop.palm','idle','d00_f00',['beauty','shadow']),('unit.US.rig','idle','d00_f00',['beauty','team','shadow']),('unit.US.rifle','idle','d00_f00',['beauty','team','shadow'])]:
 root=repo/'assets/build/frames'/aid;images={};rawhash={}
 for layer in layers:
  p=root/layer/state/(frame+'.png');rawhash[layer]=hashlib.sha256(p.read_bytes()).hexdigest();images[layer]=normalise(layer,Image.open(p).convert('RGBA'))
 height,width=next(iter(images.values())).shape[:2];views=[]
 for func in [old,downsample_premultiplied]:
  im=Image.new('RGBA',(width//2,height//2),'#81755E')
  for layer in ['shadow','beauty','team']:
   if layer not in images:continue
   part=Image.fromarray(func(images[layer]),'RGBA');part=shadow_layer(part) if layer=='shadow' else tint(part,'#BDA14D') if layer=='team' else part;im.alpha_composite(part)
  views.append(im)
 current=downsample_premultiplied(images['beauty']);previous=old(images['beauty']);a=current[:,:,3];edges=(a>=24)&(a<=224);ys,xs=np.nonzero(a>8);bbox=(max(0,int(xs.min())-8),max(0,int(ys.min())-8),min(width//2,int(xs.max())+9),min(height//2,int(ys.max())+9));w,h=bbox[2]-bbox[0],bbox[3]-bbox[1]
 sheet=Image.new('RGB',(w*2,h+24),'#81755E');draw=ImageDraw.Draw(sheet)
 for i,title in enumerate(['BEFORE','CORRECTED']):sheet.paste(views[i].crop(bbox),(i*w,24));draw.text((i*w+2,5),title,fill='white')
 sheet.save(base/(aid+'-before-after@1x.png'));sheet.resize((sheet.width*3,sheet.height*3),Image.Resampling.NEAREST).save(base/(aid+'-diagnostic@3x.png'))
 assert (current[current[:,:,3]==0,:3]==0).all(), aid+' transparent RGB'
 assert float((previous[:,:,:3].astype(float)-current[:,:,:3])[edges].mean())>10, aid+' edge regression'
 for layer,a in images.items():
  derived=downsample_premultiplied(a)
  if layer=='team':assert (derived[:,:,0]==derived[:,:,1]).all() and (derived[:,:,1]==derived[:,:,2]).all(), aid+' grayscale team'
  if layer=='shadow':assert (derived[:,:,:3]==0).all(), aid+' black shadow'
 rows.append({'id':aid,'raw_sha256':rawhash,'partial_edge_pixels':int(edges.sum()),'previous_minus_current_edge_rgb_mean':float((previous[:,:,:3].astype(float)-current[:,:,:3])[edges].mean()),'current_transparent_rgb_is_zero':bool((current[current[:,:,3]==0,:3]==0).all())})
result={'before_helper_sha256':hashlib.sha256(oldsource.encode()).hexdigest(),'after_helper_sha256':hashlib.sha256((repo/'assets/pipeline/tools/pack_sprites.py').read_bytes()).hexdigest(),'scope':'Raw beauty/team/shadow comparisons at native scale; historical shipping files not changed','assets':rows};(base/'actual-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
