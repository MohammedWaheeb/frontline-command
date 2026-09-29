"""Verify and copy exact unchanged raw poses under the evaluated source proof."""
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
target=stage/'work/reuse'/(aid+'.json');target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(receipt,indent=2)+'\n')
print('FC_SOURCE_PROVEN_RAW_SEEDED',aid,832,len(audit['files']))
