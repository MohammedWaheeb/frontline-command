"""Prepare a private three-launcher stage; no rendering or live publication."""
from pathlib import Path
import copy,hashlib,json,shutil
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];C=HERE/'candidate-v1';OUT=HERE/'production-v1';STAGE=OUT/'stage'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
dump=lambda p,j:p.write_text(json.dumps(j,indent=2)+'\n')
IDS=['unit.IR.launcher','unit.US.launcher','unit.SY.launcher']
lock=json.loads((C/'source-lock.json').read_text());proof=json.loads((C/'proof-v2.json').read_text())
assert proof['failures']==0 and proof['source_lock_sha256']==sha(C/'source-lock.json')
assert sha(C/'candidate-vehicle_roster.py')==lock['candidate_model_sha256']
assert sha(REPO/'assets/pipeline/blender/fclib.py')==lock['fclib_sha256']
for aid in IDS:
 review=json.loads((C/'pilot-v1'/aid/'native-review.json').read_text());assert review.get('visual_gate','bounded_pass')=='bounded_pass'
 assert review['check_sha256']==sha(C/'pilot-v1'/aid/'check.json') and review['render_sha256']==sha(C/'pilot-v1'/aid/'render.json')
assert not OUT.exists(),'Preserve previous stages'
STAGE.mkdir(parents=True); EVIDENCE=OUT/'evidence';EVIDENCE.mkdir()
helpers=['assets/pipeline/blender/fclib.py','assets/pipeline/blender/team_mask_png.py','assets/pipeline/blender/render_ui_shots.py','assets/pipeline/tools/pack_sprites.py','assets/pipeline/tools/shadow_alpha.py','assets/pipeline/tools/sprite_ink_bounds.py','assets/pipeline/tools/check_assets.py','assets/pipeline/tools/composite.py']
source_provenance={};sources={}
def put(source,relative):
 target=STAGE/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);assert sha(source)==sha(target);sources[relative]=sha(target);source_provenance[relative]={'path':str(source.relative_to(REPO)),'sha256':sha(source)}
for rel in helpers:put(REPO/rel,rel)
put(C/'candidate-vehicle_roster.py','assets/pipeline/blender/models/vehicle_roster.py')
put(REPO/'work/art/aircraft-final-production-v2/stage-v4/assets/pipeline/blender/render_reuse.py','assets/pipeline/blender/render_reuse.py')
for name in ['model-audit.py','check-one.py','ui-and-contacts.py']:
 put(REPO/'work/art/vehicle-production'/name,'work/art/vehicle-production/'+name)
manifestpath=REPO/'assets/manifest/asset-manifest.json';original=json.loads(manifestpath.read_text());manifest=copy.deepcopy(original);rows=[]
for aid in IDS:
 source=C/'specs'/(aid+'.json');assert sha(source)==lock['candidate_specs'][str(source.relative_to(REPO))]
 put(source,'assets/pipeline/specs/'+source.name);spec=json.loads(source.read_text());states={s['name']:s for s in spec['states']};poses=sum(s['directions']*s['frames'] for s in spec['states'])
 entry=next(e for e in manifest['entries'] if e['id']==aid);entry['spec']['states']=spec['states'];entry['spec']['total_poses']=poses
 raw=STAGE/'assets/build/frames'/aid; raw.mkdir(parents=True);files={};input_receipts={}
 def reuse(source,key,want,lineage):
  assert sha(source)==want,key
  target=raw/key
  if key in files:
   assert files[key]['sha256']==want,('ambiguous reused frame',aid,key)
   return
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);assert sha(target)==want
  files[key]={'sha256':want,'source':str(source.relative_to(REPO)),'lineage':lineage}
 if aid=='unit.IR.launcher':
  old=REPO/'work/art/vehicle-runtime-handoffs-v1'/aid;h=json.loads((old/'runtime-handoff.json').read_text());oldlock=json.loads((old/'production-lock.json').read_text());assert h['model_sha256']==lock['original_model_sha256']
  assert oldlock['sources']['assets/pipeline/blender/fclib.py']==lock['fclib_sha256']
  rawid=old/'raw-identity.json';assert h['receipts'][str(rawid.relative_to(REPO))]==sha(rawid);identity=json.loads(rawid.read_text())['files']
  oldspec=json.loads((REPO/h['spec']).read_text());assert all(states[s['name']]==s for s in oldspec['states'])
  for s in oldspec['states']:
   for d in range(s['directions']):
    for f in range(s['frames']):
     for layer in s.get('layers',oldspec['passes']):
      key=f"{layer}/{s['name']}/d{d:02d}_f{f:02d}.png";reuse(REPO/'assets/build/frames'/aid/key,key,identity[key],'544 original poses exact in source proof-v2; original render helper exact')
  input_receipts[str(old/'runtime-handoff.json')]=sha(old/'runtime-handoff.json');input_receipts[str(rawid)]=sha(rawid)
 pilot=C/'pilot-v1'/aid;render=json.loads((pilot/'render.json').read_text())
 for rec in render['records']:
  for rel,want in rec['files'].items():
   key='/'.join(Path(rel).parts[1:]);reuse(pilot/rel,key,want,'same locked source/helper selected pilot; original poses exact in proof-v2')
 for name in ['render.json','check.json','native-review.json']:input_receipts[str(pilot/name)]=sha(pilot/name)
 reuseposes=len({('/'.join(Path(k).parts[1:])) for k in files});assert all(sum(k.endswith('/'+pose) for k in files)==len(states[pose.split('/')[0]].get('layers',spec['passes'])) for pose in {'/'.join(Path(k).parts[1:]) for k in files})
 reusefile=STAGE/'work/reuse'/(aid+'.json');reusefile.parent.mkdir(parents=True,exist_ok=True);dump(reusefile,{'id':aid,'model_sha256':lock['candidate_model_sha256'],'spec_sha256':sha(source),'files':files,'source_proof_sha256':sha(C/'proof-v2.json'),'input_receipts':input_receipts,'poses':reuseposes,'scope':'Byte-exact full old IR plus approved selected pilot reuse; helper unchanged, all original source poses exact. No regeneration of these PNGs.'})
 rows.append({'id':aid,'poses':poses,'reused_poses':reuseposes,'fresh_poses':poses-reuseposes,'reuse_sha256':sha(reusefile)})
# Verify that only the three manifest state/count fields changed in this stage.
for old,new in zip(original['entries'],manifest['entries']):
 back=copy.deepcopy(new)
 if old['id'] in IDS:
  for field in ['states','total_poses']:
   if field in old['spec']:back['spec'][field]=old['spec'][field]
   else:back['spec'].pop(field,None)
 assert old==back,old['id']
m=STAGE/'assets/manifest/asset-manifest.json';m.parent.mkdir(parents=True,exist_ok=True);dump(m,manifest);sources[str(m.relative_to(STAGE))]=sha(m)
family=STAGE/'work/art/vehicle-production';production={'assets':IDS,'sources':sources,'scope':'Prepared private source/exports only. SA excluded after native FAIL. Full rendering still requires parent native acceptance of the three selected pilots.','candidate_source_lock_sha256':sha(C/'source-lock.json'),'source_proof_sha256':sha(C/'proof-v2.json')};dump(family/'production-lock.json',production)
for q in [C/'source-lock.json',C/'proof-v2.json',C/'pilot-review.json',C/'pilot-review.md',Path(__file__)]:shutil.copy2(q,EVIDENCE/q.name)
result={'scope':production['scope'],'stage':str(STAGE.relative_to(REPO)),'model_sha256':lock['candidate_model_sha256'],'source_provenance':source_provenance,'manifest_original_sha256':sha(manifestpath),'manifest_stage_sha256':sha(m),'manifest_changed_fields':{aid:['spec.states','spec.total_poses'] for aid in IDS},'assets':rows,'production_lock_sha256':sha(family/'production-lock.json'),'prepared_inputs_unchanged':True}
assert sha(manifestpath)==result['manifest_original_sha256'];dump(OUT/'preparation.json',result)
print('FC_LAUNCHER_STAGE_PREPARED',sum(r['poses'] for r in rows),sum(r['reused_poses'] for r in rows),sum(r['fresh_poses'] for r in rows))
