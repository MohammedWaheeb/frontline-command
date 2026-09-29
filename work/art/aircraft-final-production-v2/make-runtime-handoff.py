"""Describe a fully checked staged export; never publish or claim runtime QA."""
from pathlib import Path
import hashlib,json,sys
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((BASE/'production-lock.json').read_text());stage=REPO/lock['stage'];aid=sys.argv[1]
assert aid in (BASE/'completed-assets.txt').read_text().splitlines()
check=BASE/('check-'+aid+'.json');ui=BASE/('ui-check-'+aid+'.json');native=BASE/'contacts'/aid/'native-review.json'
assert not json.loads(check.read_text())['failures'];assert not json.loads(ui.read_text())['failures'];assert json.loads(native.read_text())['accepted']
for rel,want in lock['sources'].items():assert sha(stage/rel)==want,rel
spec=stage/'assets/pipeline/specs'/(aid+'.json');data=json.loads(spec.read_text());role=data['role_id'];sprite=stage/'assets/build/sprites'/aid
paths=sorted(p for p in sprite.rglob('*') if p.is_file())
for folder in ['portraits','icons/build']:
 for scale in ['1x','2x']:
  for layer in ['beauty','team']:
   paths.append(stage/'assets/build/ui'/folder/(role+'@'+scale+'.'+layer+'.png'))
assert all(p.exists() for p in paths)
records={str(p.relative_to(stage/'assets/build')):{'source':str(p.relative_to(REPO)),'sha256':sha(p),'bytes':p.stat().st_size} for p in paths}
result={'id':aid,'scope':'Checked full staged asset for diagnostic product integration; no shipping or runtime lifecycle acceptance inferred','stage':str(stage.relative_to(REPO)),'model_sha256':lock['model_sha256'],'spec_sha256':sha(spec),'state_pose_count':sum(s['directions']*s['frames'] for s in data['states']),'canonical_empty_variants':[s['name'] for s in data['states'] if s['name'].endswith('_empty')],'checks':{str(p.relative_to(REPO)):sha(p) for p in [check,ui,native,BASE/'production-lock.json',BASE/'pilot-reuse-audit.json']},'files':records,'editable_blend':str((stage/'assets/source/blender'/(aid+'.blend')).relative_to(REPO)),'reviewed_source':str((stage/'assets/pipeline/blender/models/aircraft_roster.py').relative_to(REPO)),'prior_stages_untouched':True}
out=BASE/'runtime-handoff';out.mkdir(exist_ok=True);target=out/(aid+'.json');assert not target.exists();target.write_text(json.dumps(result,indent=2)+'\n');print('FC_CHECKED_AIRCRAFT_RUNTIME_HANDOFF',aid,len(records),'files',sum(r['bytes'] for r in records.values()),'bytes')
