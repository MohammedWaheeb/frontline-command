"""Prepare fresh two-strike production only after proof and native pilot pass."""
from pathlib import Path
import hashlib,json,shutil

BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2]
OLD=REPO/'work/art/aircraft-final-production-v3'
NEW=REPO/'work/art/aircraft-strike-final-production-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=BASE/'proof-v1.json';pr=json.loads(proof.read_text());assert pr['failures']==0
assert (pr['unchanged_poses'],pr['changed_poses'],pr['reverse_resets'])==(8992,128,9120)
review=BASE/'pilot-v2/native-review.json';assert json.loads(review.read_text())['accepted']
pilot=BASE/'pilot-v2/result.json';pi=json.loads(pilot.read_text());assert pi['failures']==0
model=BASE/'candidate-aircraft_roster.py';assert sha(model)==pr['candidate_sha256']==pi['source_sha256']
oldlock=json.loads((OLD/'production-lock.json').read_text());oldstage=REPO/oldlock['stage']
assert pi['helper_sha256']==oldlock['sources']['assets/pipeline/blender/fclib.py']
source_reuse=OLD/'pilot-reuse-audit.json';assert sha(source_reuse)==oldlock['reuse_audit_sha256'];prior=json.loads(source_reuse.read_text());assert not prior['failures']
sa_proof=REPO/'work/art/sa-fighter-crash-attachment-v1/proof-v1.json';sa=json.loads(sa_proof.read_text());assert sa['failures']==0 and sa['candidate_sha256']==pr['before_sha256'] and sa['before_sha256']==oldlock['model_sha256']
assert not NEW.exists(),'Preserve every old stage';NEW.mkdir();stage=NEW/'stage'
for rel,want in oldlock['sources'].items():
 p=oldstage/rel;assert sha(p)==want,rel;target=stage/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
shutil.copy2(model,stage/'assets/pipeline/blender/models/aircraft_roster.py')
rows=[]
for aid in ['unit.SA.strike','unit.US.strike']:
 specpath=stage/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(specpath.read_text());oldrow=next(r for r in prior['rows'] if r['id']==aid)
 assert oldrow['spec_sha256']==sha(specpath) and len(oldrow['reuse'])==40
 assert sha(REPO/oldrow['native_review'])==oldrow['native_review_sha256']
 files={};keys=set()
 for pose in oldrow['reuse']:
  assert pose['evaluated_original_opaque_path'] and not pose['key'].startswith('crash/')
  keys.add(pose['key'])
  for layer,record in pose['files'].items():
   source=REPO/record['path'];assert sha(source)==record['sha256'];files[layer+'/'+pose['key']+'.png']={'source':record['path'],'sha256':sha(source),'bytes':source.stat().st_size,'lineage':'prior accepted service/parked pilot; both bounded source proofs exact'}
 row=next(r for r in pi['assets'] if r['id']==aid);assert row['spec_sha256']==sha(specpath) and row['canvas']==spec['canvas'] and row['anchor']==spec['anchor']
 crash=next(s for s in spec['states'] if s['name']=='crash');assert crash['layers']==['beauty','shadow']
 for key in row['rendered_keys']:
  assert key.startswith('crash/') and key not in keys;keys.add(key)
  for layer in crash['layers']:
   rel='frames/'+aid+'/'+layer+'/'+key+'.png';source=BASE/'pilot-v2'/rel;assert sha(source)==pi['files'][rel]
   files[layer+'/'+key+'.png']={'source':str(source.relative_to(REPO)),'sha256':sha(source),'bytes':source.stat().st_size,'lineage':'exact corrected native pilot, same frozen spec/model/camera/lights/layer renderer'}
 assert len(keys)==48 and len(files)==136
 rows.append({'id':aid,'spec_sha256':sha(specpath),'poses':48,'files':files,'prior_native_review':oldrow['native_review'],'prior_native_review_sha256':oldrow['native_review_sha256']})
inputs=[proof,review,pilot,model,sa_proof,source_reuse,OLD/'production-lock.json',BASE/'pilot-v2.py']
audit={'scope':'Two-strike complete-tuple reuse:40 earlier opaque accepted service/parked tuples remain evaluated-exact through both source amendments;8 corrected crash native tuples use exact full-export model/spec/camera/lights/helper/layers. Full pack/check/fresh UI/native required.','failures':0,'model_sha256':sha(model),'helper_sha256':pi['helper_sha256'],'rows':rows,'proof_inputs':{str(p.relative_to(REPO)):sha(p) for p in inputs},'pilot_render_config_equivalence':{'canvas_anchor_spec_exact':True,'lights':'fclib.setup_lights(spec.get(sun_strength,3.3)) in both helpers','render_passes':'same frozen fclib; exact declared beauty/shadow crash passes','direction_frame_model_pose':'same frozen spec state object and requested direction/frame','full_export_metadata_regenerated':True,'no_png_reencoding_during_reuse':True}}
(NEW/'raw-reuse-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
oldrel=str(OLD.relative_to(REPO));newrel=str(NEW.relative_to(REPO))
for name in ['preflight.py','check-one.py','ui-and-contacts.py','run-staged.sh','make-runtime-handoff.py']:
 (NEW/name).write_text((OLD/name).read_text().replace(oldrel,newrel).replace('pilot-reuse-audit.json','raw-reuse-audit.json'))
seed='''"""Seed only locked, complete source-proven tuples into a fresh export."""
from pathlib import Path
import hashlib,json,shutil,sys
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((BASE/'production-lock.json').read_text());stage=REPO/lock['stage'];aid=sys.argv[1];assert aid in lock['assets']
path=BASE/'raw-reuse-audit.json';assert sha(path)==lock['reuse_audit_sha256'];audit=json.loads(path.read_text());assert audit['failures']==0 and audit['model_sha256']==lock['model_sha256']
for rel,want in audit['proof_inputs'].items():assert sha(REPO/rel)==want,rel
row=next(r for r in audit['rows'] if r['id']==aid);assert sha(stage/'assets/pipeline/specs'/(aid+'.json'))==row['spec_sha256'];assert sha(REPO/row['prior_native_review'])==row['prior_native_review_sha256']
out=stage/'assets/build/frames'/aid;assert not out.exists()
for rel,r in row['files'].items():
 source=REPO/r['source'];assert sha(source)==r['sha256'];target=out/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);assert sha(target)==r['sha256']
receipt={'id':aid,'model_sha256':lock['model_sha256'],'spec_sha256':row['spec_sha256'],'poses':row['poses'],'files':row['files'],'audit_sha256':sha(path),'prior_stages_untouched':True}
p=stage/'work/reuse'/(aid+'.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(receipt,indent=2)+'\\n');print('FC_STRIKE_ACCEPTED_REUSE',aid,row['poses'],len(row['files']))
'''
(NEW/'seed-pilot.py').write_text(seed)
lock=oldlock;lock['scope']='New isolated full US/SA strike family with bounded crash attachment correction; all original stages preserved. No live publication.';lock['stage']=str(stage.relative_to(REPO));lock['assets']=['unit.SA.strike','unit.US.strike'];lock['model_sha256']=sha(model);lock['sources']['assets/pipeline/blender/models/aircraft_roster.py']=sha(model);lock['reuse_audit_sha256']=sha(NEW/'raw-reuse-audit.json')
lock['drivers']={str((NEW/n).relative_to(REPO)):sha(NEW/n) for n in ['preflight.py','check-one.py','run-staged.sh','seed-pilot.py','ui-and-contacts.py','make-runtime-handoff.py']}
lock['strike_crash_amendment']={'before_family_lock':str((OLD/'production-lock.json').relative_to(REPO)),'before_family_lock_sha256':sha(OLD/'production-lock.json'),'proof_chain':[str(sa_proof.relative_to(REPO)),str(proof.relative_to(REPO))],'native_review':str(review.relative_to(REPO)),'changed_poses':128,'unchanged_poses_in_final_source_proof':8992,'author':'Original Codex aircraft authorship under user-authorized Claude quota fallback; Claude authored shared fclib. Bounded Codex visibility correction and pipeline operation under explicit user authorization.','only_removed_parts':['wing_team_-1','pylon_-1'],'us_tailplane_preserved':True}
(NEW/'production-lock.json').write_text(json.dumps(lock,indent=2)+'\n');(NEW/'README.md').write_text('Private complete US/SA strike exports after bounded crash correction.48 complete raw tuples reused per asset,848 rendered fresh, full metadata/UI/native gates required. No original stages or live assets changed.\n');print('FC_STRIKE_PRODUCTION_READY',sha(NEW/'production-lock.json'))
