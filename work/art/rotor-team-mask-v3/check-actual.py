"""Actual same-source comparisons, layer identities and native color contacts."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
from PIL import Image,ImageDraw

HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];OUT=HERE/'actual-v1'
sys.path.insert(0,str(REPO/'assets/pipeline/tools'))
from pack_sprites import normalise,downsample_premultiplied
from composite import tint,shadow_layer
report=json.loads((OUT/'render.json').read_text());checks=[];stats=[];repeats=[]
def check(name,ok,detail=None):checks.append({'name':name,'ok':bool(ok),'detail':detail})
def read(path):return np.asarray(Image.open(path).convert('RGBA'))
def equal(name,a,b):
 delta=np.abs(a.astype(int)-b.astype(int));check(name,np.array_equal(a,b),{'changed_pixels':int(np.any(delta,axis=2).sum()),'max_difference':int(delta.max())})
def composed(root,key,divisor=2):
 layers={layer:normalise(layer,Image.open(root/layer/(key+'.png')).convert('RGBA')).clip(0,255) for layer in ['beauty','team','shadow']}
 h,w=layers['beauty'].shape[:2];out=Image.new('RGBA',(w//divisor,h//divisor),'#8C806B')
 for layer in ['shadow','beauty','team']:
  image=Image.fromarray(layers[layer].astype(np.uint8) if divisor==1 else downsample_premultiplied(layers[layer]),'RGBA');out.alpha_composite(shadow_layer(image) if layer=='shadow' else tint(image,'#BDA14D') if layer=='team' else image)
 return out
for row in [r for r in report['records'] if r['version']=='before']:
 aid,key=row['id'],row['key'];old=OUT/'before'/aid;new=OUT/'candidate'/aid
 for layer in ['beauty','shadow']:
  a=read(old/layer/(key+'.png'));b=read(new/layer/(key+'.png'));equal(aid+'/'+key+'/'+layer+' exact',a,b)
  r=read(OUT/'repeat-before'/aid/layer/(key+'.png'));delta=np.abs(a.astype(int)-r.astype(int));repeats.append({'id':aid,'key':key,'layer':layer,'same_source_changed_pixels':int(np.any(delta,axis=2).sum()),'same_source_max_difference':int(delta.max())})
 before=read(old/'team'/(key+'.png'));after=read(new/'team'/(key+'.png'));body=read(new/'beauty'/(key+'.png'))
 check(aid+'/'+key+' team inside beauty',int(((after[:,:,3]>32)&(body[:,:,3]<8)).sum())<=max(4,.005*int((after[:,:,3]>32).sum())))
 black=(after[:,:,3]>32)&(after[:,:,:3].max(axis=2)<4);check(aid+'/'+key+' no black mask occlusion artifact',int(black.sum())==0,int(black.sum()))
 if aid=='unit.US.fighter':equal(aid+'/'+key+'/opaque team exact',before,after)
 stats.append({'id':aid,'key':key,'old_team_pixels_gt32':int((before[:,:,3]>32).sum()),'corrected_team_pixels_gt32':int((after[:,:,3]>32).sum())})
for aid in dict.fromkeys(r['id'] for r in report['records']):
 rows=[r for r in report['records'] if r['id']==aid and r['version']=='before']
 for divisor,scale in [(2,'1x'),(1,'2x')]:
  w,h=[n//divisor for n in rows[0]['canvas']];page=Image.new('RGBA',(2*w,30+len(rows)*(h+24)),'#8C806B');draw=ImageDraw.Draw(page);draw.text((3,5),'Same source: old mask | opacity-preserving mask',fill='#171713')
  for i,row in enumerate(rows):
   y=30+i*(h+24);draw.text((3,y+4),aid+' '+row['key'],fill='#171713')
   for j,version in enumerate(['before','candidate']):page.alpha_composite(composed(OUT/version/aid,row['key'],divisor),(j*w,y+24))
  page.convert('RGB').save(OUT/(aid+'@'+scale+'.png'))
ui=[]
for name in ['portrait','cameo']:
 old=OUT/'before/unit.US.airlift/ui';new=OUT/'candidate/unit.US.airlift/ui'
 equal(name+'/UI beauty exact',read(old/(name+'.beauty.png')),read(new/(name+'.beauty.png')))
 for divisor,scale in [(1,'2x'),(2,'1x')]:
  panels=[]
  for root in [old,new]:
   layers={layer:normalise(layer,Image.open(root/(name+'.'+layer+'.png')).convert('RGBA')).clip(0,255) for layer in ['beauty','team']};h,w=layers['beauty'].shape[:2];out=Image.new('RGBA',(w//divisor,h//divisor),'#8C806B')
   for layer in ['beauty','team']:
    im=Image.fromarray(layers[layer].astype(np.uint8) if divisor==1 else downsample_premultiplied(layers[layer]),'RGBA');out.alpha_composite(tint(im,'#BDA14D') if layer=='team' else im)
   panels.append(out)
  w,h=panels[0].size;page=Image.new('RGBA',(w*2,24+h),'#8C806B');draw=ImageDraw.Draw(page);draw.text((3,3),name+' @'+scale+' old | corrected',fill='#171713')
  for j,p in enumerate(panels):page.alpha_composite(p,(j*w,24))
  page.convert('RGB').save(OUT/(name+'@'+scale+'.png'))
 before=int((read(old/(name+'.team.png'))[:,:,3]>32).sum());after=int((read(new/(name+'.team.png'))[:,:,3]>32).sum())
 check(name+'/team coverage restored',after>=3*before and after>=90,{'old':before,'corrected':after});ui.append({'name':name,'old':before,'corrected':after})
failures=[r for r in checks if not r['ok']];target=OUT/'check.json';assert not target.exists();target.write_text(json.dumps({'checks':checks,'failures':failures,'team_coverage':stats,'ui_coverage':ui,'actual_same_source_repeats':repeats,'strict_byte_gate_remains_separate':True,'scope':'Isolated constant-alpha mask correction; native review required before helper promotion'},indent=2)+'\n');print('FC_TEAM_ALPHA_ACTUAL_CHECK',len(checks),len(failures));assert not failures,failures
