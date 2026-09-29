"""Copy only evaluated opaque, accepted same-source selected poses."""
from pathlib import Path
import hashlib,json,shutil,sys
REPO=Path(__file__).resolve().parents[3];BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((BASE/'production-lock.json').read_text());stage=REPO/lock['stage'];aid=sys.argv[1];assert aid in lock['assets']
auditpath=BASE/'pilot-reuse-audit.json';assert sha(auditpath)==lock['reuse_audit_sha256'];audit=json.loads(auditpath.read_text());assert not audit['failures']
assert audit['model_sha256']==lock['model_sha256'];assert audit['helper_sha256']==sha(stage/'assets/pipeline/blender/fclib.py')
row=next(r for r in audit['rows'] if r['id']==aid);spec=stage/'assets/pipeline/specs'/(aid+'.json');assert row['spec_sha256']==sha(spec)
assert sha(REPO/row['native_review'])==row['native_review_sha256']
out=stage/'assets/build/frames'/aid;assert not out.exists(),'Preserve earlier seeded/full output';files={}
for pose in row['reuse']:
 assert pose['evaluated_original_opaque_path']
 for layer,record in pose['files'].items():
  relative=layer+'/'+pose['key']+'.png';source=REPO/record['path'];assert sha(source)==record['sha256'];target=out/relative
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);assert sha(target)==record['sha256'];files[relative]={'sha256':sha(target),'source':record['path']}
receipt={'id':aid,'model_sha256':lock['model_sha256'],'spec_sha256':sha(spec),'reuse_audit_sha256':sha(auditpath),'native_review':row['native_review'],'poses':len(row['reuse']),'files':files,'opaque_same_source_only':True,'all_translucent_poses_rendered_fresh':True,'all_prior_stages_untouched':True}
target=stage/'work/reuse'/(aid+'.json');target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(receipt,indent=2)+'\n')
print('FC_ACCEPTED_PILOT_SEEDED',aid,len(row['reuse']),len(files))
