"""Create a fresh one-asset stage; preserve the rejected complete export."""
from pathlib import Path
import hashlib,json,shutil

REPO=Path(__file__).resolve().parents[3]
BASE=Path(__file__).resolve().parent
OLD=REPO/'work/art/aircraft-final-production-v3'
NEW=REPO/'work/art/sa-fighter-crash-production-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=BASE/'proof-v1.json'; data=json.loads(proof.read_text())
assert data['failures']==0 and (data['unchanged_poses'],data['changed_poses'],data['reverse_resets'])==(9056,64,9120)
assert sha(BASE/'candidate-aircraft_roster.py')==data['candidate_sha256']
assert not NEW.exists(), 'Never overwrite an earlier correction stage'
lock=json.loads((OLD/'production-lock.json').read_text()); oldstage=REPO/lock['stage']
NEW.mkdir(); stage=NEW/'stage'
for rel,want in lock['sources'].items():
 source=oldstage/rel;assert sha(source)==want,rel
 target=stage/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
model=stage/'assets/pipeline/blender/models/aircraft_roster.py'
shutil.copy2(BASE/'candidate-aircraft_roster.py',model)
oldrel=str(OLD.relative_to(REPO));newrel=str(NEW.relative_to(REPO))
for name in ['preflight.py','check-one.py','ui-and-contacts.py','run-staged.sh','make-runtime-handoff.py']:
 text=(OLD/name).read_text().replace(oldrel,newrel).replace('pilot-reuse-audit.json','raw-reuse-audit.json')
 (NEW/name).write_text(text)
seed='''"""Verify and copy exact unchanged raw poses under the evaluated source proof."""
from pathlib import Path
import hashlib,json,shutil,sys
REPO=Path(__file__).resolve().parents[3];BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((BASE/'production-lock.json').read_text());stage=REPO/lock['stage'];aid=sys.argv[1]
assert aid=='unit.SA.fighter'
path=BASE/'raw-reuse-audit.json';assert sha(path)==lock['reuse_audit_sha256'];audit=json.loads(path.read_text())
assert audit['failures']==0 and audit['poses']==832 and audit['model_sha256']==lock['model_sha256']
for rel,want in audit['proof_inputs'].items():assert sha(REPO/rel)==want,rel
out=stage/'assets/build/frames'/aid;assert not out.exists(),'Preserve prior raw output'
for rel,r in audit['files'].items():
 source=REPO/r['source'];assert sha(source)==r['sha256'];target=out/rel
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);assert sha(target)==r['sha256']
receipt={'id':aid,'model_sha256':lock['model_sha256'],'spec_sha256':audit['spec_sha256'],'poses':832,'files':audit['files'],'proof':str(path.relative_to(REPO)),'proof_sha256':sha(path),'all_prior_stages_untouched':True}
target=stage/'work/reuse'/(aid+'.json');target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(receipt,indent=2)+'\\n')
print('FC_SOURCE_PROVEN_RAW_SEEDED',aid,832,len(audit['files']))
'''
(NEW/'seed-pilot.py').write_text(seed)
aid='unit.SA.fighter';spec=stage/'assets/pipeline/specs'/(aid+'.json');specdata=json.loads(spec.read_text())
files={};retained={};changed=[]
for state in specdata['states']:
 for d in range(state['directions']):
  for f in range(state['frames']):
   key=f"{state['name']}/d{d:02d}_f{f:02d}"
   if state['name']=='crash':changed.append(key)
   for layer in state.get('layers',specdata.get('passes',['beauty','team','shadow'])):
    rel=layer+'/'+key+'.png';source=oldstage/'assets/build/frames'/aid/rel
    r={'source':str(source.relative_to(REPO)),'sha256':sha(source),'bytes':source.stat().st_size}
    retained[rel]=r
    if state['name']!='crash':files[rel]=r
assert len(files)==832*3 and len(changed)==64
native=OLD/'contacts'/aid/'native-review.json';assert json.loads(native.read_text())['accepted'] is False
audit={'id':aid,'failures':0,'poses':832,'fresh_poses':64,'changed_keys':changed,'model_sha256':sha(model),'spec_sha256':sha(spec),'files':files,'proof_inputs':{str(p.relative_to(REPO)):sha(p) for p in [proof,BASE/'prove.py',BASE/'before-aircraft_roster.py',BASE/'candidate-aircraft_roster.py',OLD/'production-lock.json',native]},'scope':'Reuse all and only evaluated-equal non-crash tuples verbatim. Original full export failed crash visual review, not these 832 source-proven tuples. All 64 crash tuples fresh; full pack/UI/check/native required.'}
(NEW/'raw-reuse-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
(NEW/'original-raw-inventory.json').write_text(json.dumps({'files':retained,'scope':'Immutable original complete raw export, including rejected crash'},indent=2)+'\n')
lock['scope']='Isolated SA fighter 64-crash attachment correction. 832 unchanged tuples reused exactly; no shipping or runtime acceptance.'
lock['stage']=str(stage.relative_to(REPO));lock['model_sha256']=sha(model);lock['assets']=[aid]
lock['sources']['assets/pipeline/blender/models/aircraft_roster.py']=sha(model)
lock['drivers']={str((NEW/n).relative_to(REPO)):sha(NEW/n) for n in ['check-one.py','preflight.py','run-staged.sh','seed-pilot.py','ui-and-contacts.py','make-runtime-handoff.py']}
lock['reuse_audit_sha256']=sha(NEW/'raw-reuse-audit.json')
lock['crash_attachment_amendment']={'before_lock':str((OLD/'production-lock.json').relative_to(REPO)),'before_lock_sha256':sha(OLD/'production-lock.json'),'before_model_sha256':data['before_sha256'],'proof':str(proof.relative_to(REPO)),'proof_sha256':sha(proof),'changed_poses':64,'verbatim_unchanged_poses':832,'author':'Codex, explicit parent-authorized post-quota correction; original aircraft authorship retained','geometry_material_transform_hardpoint_exact':True,'prior_full_failed_export_preserved':True}
(NEW/'production-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
(NEW/'README.md').write_text('SA fighter crash correction only. Original source/full export remains immutable in aircraft-final-production-v3. Hide the two fittings owned by the missing wing; no geometry, material, transform, timing, or hardpoint changes. Production uses 832 SHA-exact original tuples and 64 newly rendered crash tuples, fresh UI/editable blend, full checks and native review. No live publication.\n')
print('FC_SA_CORRECTION_STAGE_READY',len(files),sha(NEW/'production-lock.json'))
