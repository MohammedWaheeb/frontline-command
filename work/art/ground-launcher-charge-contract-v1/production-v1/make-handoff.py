"""Freeze a completed staged launcher after explicit whole-asset native review."""
from pathlib import Path
import hashlib,json,shutil,sys
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[3];STAGE=BASE/'stage';FAMILY=STAGE/'work/art/vehicle-production';aid=sys.argv[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(REPO));dump=lambda p,j:p.write_text(json.dumps(j,indent=2)+'\n')
lock=json.loads((FAMILY/'production-lock.json').read_text());assert aid in lock['assets']
assert aid in (FAMILY/'completed-assets.txt').read_text().splitlines()
for p,w in lock['sources'].items():assert sha(STAGE/p)==w,p
specpath=STAGE/'assets/pipeline/specs'/(aid+'.json');spec=json.loads(specpath.read_text());poses=sum(s['directions']*s['frames'] for s in spec['states'])
assert f'FC_RENDER_DONE {aid} poses={poses} ' in (FAMILY/f'full-{aid}.log').read_text()
checks_to_copy=[]
for kind in ['check','ui-check']:
 source=FAMILY/f'{kind}-{aid}.json';assert json.loads(source.read_text())['failures']==0
 target=BASE/source.name;assert not target.exists();checks_to_copy.append((source,target))
review=FAMILY/'contacts'/aid/'native-review.json';native=json.loads(review.read_text());assert native.get('accepted_bounded_export') is True
for p,w in native['images'].items():assert sha(REPO/p)==w,p
outcontact=BASE/'contacts'/aid;assert not outcontact.exists()
for source,target in checks_to_copy:shutil.copy2(source,target)
outcontact.mkdir(parents=True)
shutil.copy2(review,outcontact/'native-review.json')
prodpath=BASE/'production-lock.json';production={'stage':rel(STAGE),'sources':lock['sources'],'source_lock_sha256':sha(FAMILY/'production-lock.json'),'preparation_sha256':sha(BASE/'preparation.json'),'scope':'Private completed US/IR/SY charge exports only, no live promotion. SA excluded.'}
if prodpath.exists():assert json.loads(prodpath.read_text())==production
else:dump(prodpath,production)
raw=STAGE/'assets/build/frames'/aid;rawfile=BASE/f'raw-identity-{aid}.json';assert not rawfile.exists();dump(rawfile,{'id':aid,'files':{str(p.relative_to(raw)):sha(p) for p in sorted(raw.rglob('*')) if p.is_file()}})
role=spec.get('role_id') or aid;paths=sorted(p for p in (STAGE/'assets/build/sprites'/aid).iterdir() if p.is_file())
paths += [STAGE/'assets/build/ui'/folder/f'{role}@{scale}.{layer}.png' for folder in ['portraits','icons/build'] for scale in ['1x','2x'] for layer in ['beauty','team']]
files={str(p.relative_to(STAGE/'assets/build')):{'source':rel(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in paths}
checks=[BASE/f'check-{aid}.json',BASE/f'ui-check-{aid}.json',outcontact/'native-review.json',prodpath,BASE/'parent-native-approval.json',BASE/'preparation.json',rawfile]
model=STAGE/'assets/pipeline/blender/models/vehicle_roster.py';blend=STAGE/'assets/source/blender'/(aid+'.blend');assert blend.stat().st_size>1024
handoff={'id':aid,'stage':rel(STAGE),'poses':poses,'model':rel(model),'model_sha256':sha(model),'spec':rel(specpath),'spec_sha256':sha(specpath),'editable_blend':rel(blend),'files':files,'receipts':{rel(p):sha(p) for p in checks},'scope':'Full private charge-state candidate; original Claude chassis/model with bounded Codex charge-state correction and pipeline operation. Generic IR raw poses and accepted partial pilot preserved exactly. No live, final roster/style or actual-game acceptance implied.'}
out=BASE/'runtime-handoff';out.mkdir(exist_ok=True);target=out/(aid+'.json');assert not target.exists();dump(target,handoff)
print('FC_FULL_CHARGE_HANDOFF',aid,poses,len(files),sum(x['bytes'] for x in files.values()))
