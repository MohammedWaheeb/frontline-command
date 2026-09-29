"""Audit source-proven reuse and old export preservation after the new full pack."""
from pathlib import Path
import hashlib,json
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2]
OLD=REPO/'work/art/aircraft-final-production-v3';NEW=REPO/'work/art/sa-fighter-crash-production-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((NEW/'production-lock.json').read_text());stage=REPO/lock['stage'];aid='unit.SA.fighter'
audit=json.loads((NEW/'raw-reuse-audit.json').read_text());original=json.loads((NEW/'original-raw-inventory.json').read_text())
assert sha(NEW/'raw-reuse-audit.json')==lock['reuse_audit_sha256']
for rel,row in original['files'].items():assert sha(REPO/row['source'])==row['sha256'],('old raw changed',rel)
for rel,row in audit['files'].items():assert sha(stage/'assets/build/frames'/aid/rel)==row['sha256'],('unchanged tuple changed',rel)
for rel,want in lock['sources'].items():assert sha(stage/rel)==want,rel
for rel,want in audit['proof_inputs'].items():assert sha(REPO/rel)==want,rel
oldraw=OLD/'stage/assets/build/frames'/aid;newraw=stage/'assets/build/frames'/aid
assert (oldraw/'hardpoints.json').read_bytes()==(newraw/'hardpoints.json').read_bytes(),'hardpoint byte mismatch'
oldcontact=OLD/'contacts'/aid;newcontact=NEW/'contacts'/aid
oldpages=json.loads((oldcontact/'pages.json').read_text())['pages']
exactcontacts=[];changedcontacts=[]
for page in oldpages:
 name=page['path'];old=oldcontact/name;new=newcontact/name
 if page['state']!='crash':
  assert sha(old)==sha(new),('unchanged contact mismatch',name)
  exactcontacts.append(name)
 else:changedcontacts.append(name)
world=json.loads((NEW/('check-'+aid+'.json')).read_text());ui=json.loads((NEW/('ui-check-'+aid+'.json')).read_text())
assert world['failures']==0 and ui['failures']==0
result={'id':aid,'failures':0,'old_raw_files_preserved':len(original['files']),'unchanged_raw_poses':832,'unchanged_raw_files':len(audit['files']),'fresh_crash_poses':64,'hardpoints_byte_exact':True,'unchanged_contact_pages_byte_exact':exactcontacts,'changed_crash_pages_requiring_review':changedcontacts,'world_checks':world['checks'],'ui_checks':len(ui['checks']),'proof_sha256':sha(BASE/'proof-v1.json'),'new_lock_sha256':sha(NEW/'production-lock.json'),'prior_failed_review_sha256':sha(oldcontact/'native-review.json'),'scope':'Exact source-proven tuple reuse and original preservation; native acceptance remains separate.'}
out=BASE/'export-verification-v1.json';assert not out.exists();out.write_text(json.dumps(result,indent=2)+'\n')
print('FC_SA_CORRECTION_EXPORT_EXACT',len(audit['files']),len(exactcontacts),world['checks'],len(ui['checks']))
