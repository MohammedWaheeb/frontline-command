"""Apply isolated helper to copied real atlases; prove bytes/fields/coverage."""
from pathlib import Path
import copy,hashlib,json,shutil,sys
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];sys.path.insert(0,str(HERE/'candidate'))
from sprite_ink_bounds import add_ink_bounds
OUT=HERE/'proof-existing-v1';assert not OUT.exists();OUT.mkdir();rows=[];shadow_audit=[];checks=0
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=list(sorted((REPO/'work/art/go-parking-browser-overlay/overlay-v1/sprites').glob('*')))
sources += [REPO/'assets/build/sprites/unit.US.rig',REPO/'assets/build/sprites/prop.spawn_marker_editor',REPO/'work/art/aircraft-production/stage-v1/assets/build/sprites/unit.US.fighter']
for index,source in enumerate(sources):
 assert source.is_dir(),source;target=OUT/f'{index:02d}-{source.name}';shutil.copytree(source,target);meta_path=next(target.glob('*.sprite.json'));meta=json.loads(meta_path.read_text());before={p.name:sha(p) for p in target.iterdir() if p.is_file()};descs={p.name:json.loads(p.read_text()) for p in target.glob('*.json') if '.sprite.' not in p.name};count=add_ink_bounds(target,meta['atlases']);changed=[]
 for name,want in before.items():
  p=target/name
  if name.endswith('.png') or '.sprite.' in name:assert sha(p)==want,(source,name,'pixel/sidecar mutation');checks+=1
 for name,old in descs.items():
  new=json.loads((target/name).read_text());original_fields=copy.deepcopy(new);original_fields['meta'].pop('ink_bounds_policy');[f.pop('ink_bounds') for f in original_fields['frames'].values()];assert original_fields==old,(source,name,'existing fields');checks+=1;changed.append(name)
 for scale,layers in meta['atlases'].items():
  alpha={};descriptors={}
  for layer,names in layers.items():
   for name in names:
    d=json.loads((target/name).read_text());a=np.asarray(Image.open(target/d['meta']['image']).convert('RGBA'))[...,3]
    for key,f in d['frames'].items():
     r=f['frame'];alpha[layer,key]=a[r['y']:r['y']+r['h'],r['x']:r['x']+r['w']].copy();descriptors[layer,key]=(f,d['meta']['ink_bounds_policy'])
  for (layer,key),(frame,policy) in descriptors.items():
   selected=[a for (l,k),a in alpha.items() if k==key and l in (('beauty','team') if layer in ('beauty','team') else (layer,))];union=np.maximum.reduce(selected);ys,xs=np.nonzero(union>0);expected=None if not len(xs) else {'x':int(xs.min()),'y':int(ys.min()),'w':int(xs.max()-xs.min()+1),'h':int(ys.max()-ys.min()+1)};assert frame['ink_bounds']==expected,(source,key,layer,'coverage');assert policy['alpha_min']==1 and policy['sources']==(['beauty','team'] if layer in ('beauty','team') else [layer]);checks+=2
   if index<16 and layer=='shadow':shadow_audit.append({'id':meta['id'],'key':key,'scale':scale,'shadow_ink_bounds':expected})
 # Prove immutable source still matches its pre-copy bytes after annotation.
 for name,want in before.items():assert sha(source/name)==want,(source,name,'source mutation');checks+=1
 rows.append({'source':str(source.relative_to(REPO)),'id':meta['id'],'frames_annotated':count,'descriptor_files_changed':len(changed),'pngs_unchanged':sum(n.endswith('.png') for n in before),'source_sha256':before,'result_descriptor_sha256':{name:sha(target/name) for name in changed}})
(HERE/'existing-proof.json').write_text(json.dumps({'scope':'Real copied descriptor metadata only, all source files/PNG/sidecar bytes and existing JSON fields exact. No live promotion.','assets':len(rows),'checks':checks,'failures':0,'results':rows},indent=2)+'\n');(HERE/'shadow-audit.json').write_text(json.dumps({'scope':'Exact alpha>=1 own shadow coverage; unchanged original overlay pixels; excludes body union.','results':shadow_audit},indent=2)+'\n');print('FC_REAL_INK_METADATA_PROOF',len(rows),checks,len(shadow_audit),flush=True)
