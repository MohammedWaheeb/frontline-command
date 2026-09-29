from pathlib import Path
import json,hashlib,sys
BASE=Path(__file__).resolve().parent;STAGE=BASE/'stage';REPO=BASE.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=json.loads((BASE/'preparation.json').read_text());a=json.loads((BASE/'parent-native-approval.json').read_text());lockpath=STAGE/'work/art/vehicle-production/production-lock.json';lock=json.loads(lockpath.read_text())
assert sha(lockpath)==p['production_lock_sha256']
assert STAGE.resolve()==(REPO/p['stage']).resolve() and STAGE.resolve().is_relative_to(BASE.resolve())
for rel,want in lock['sources'].items():assert sha(STAGE/rel)==want,rel
for rel,want in a['inspected_native_images'].items():assert sha(REPO/rel)==want,rel
for aid in sys.argv[1:]:
 assert aid in a['accepted_assets'] and aid in lock['assets'] and aid not in a['excluded_assets']
 row=next(r for r in p['assets'] if r['id']==aid);rp=STAGE/'work/reuse'/(aid+'.json');assert sha(rp)==row['reuse_sha256']
 reuse=json.loads(rp.read_text())
 for rel,want in reuse['files'].items():assert sha(STAGE/'assets/build/frames'/aid/rel)==want['sha256'],rel
print('FC_CHARGE_PRODUCTION_PREFLIGHT_OK',*sys.argv[1:])
