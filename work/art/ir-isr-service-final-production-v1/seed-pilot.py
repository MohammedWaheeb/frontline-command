"""Seed only locked, complete source-proven tuples into a fresh export."""
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
p=stage/'work/reuse'/(aid+'.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(receipt,indent=2)+'\n');print('FC_ISR_ACCEPTED_REUSE',aid,row['poses'],len(row['files']))
