"""Read-only compatibility of old private UI derivatives with new exact handoffs."""
from pathlib import Path
import hashlib,json
B=Path(__file__).resolve().parent;R=B.parents[3];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();oldpath=B.parent/'normalized-roster-v2/result.json';old=json.loads(oldpath.read_text());catalog=R/'work/art/roster-runtime-overlay-v1/catalog-v53-v1/result.json';rows=json.loads(catalog.read_text())['assets'];prior={r['destination']:r for r in old['files']};result=[]
for row in rows:
 p=R/row['handoff'];assert sha(p)==row['handoff_sha256'];h=json.loads(p.read_text())
 for dest,r in h['files'].items():
  if not dest.startswith('ui/')or not dest.endswith('.team.png'):continue
  assert sha(R/r['source'])==r['sha256'];previous=prior.get(dest);status='absent_from_original_private_candidate'
  if previous:
   assert sha(R/previous['candidate'])==previous['candidate_sha256']
   status='exact_source_match'if previous['original_sha256']==r['sha256']else'stale_source_do_not_apply'
  result.append({'id':h['id'],'destination':dest,'current_source':r['source'],'current_sha256':r['sha256'],'status':status,'old_original_sha256':previous['original_sha256']if previous else None,'old_candidate':previous['candidate']if previous else None})
assert len(result)==212
counts={k:sum(x['status']==k for x in result)for k in sorted({x['status']for x in result})};out=B/'result.json';assert not out.exists();out.write_text(json.dumps({'scope':'Compatibility inventory only. No private or shipping image changed. Original136 derivatives are not automatically applicable to the current53 handoffs.','inputs':{str(oldpath.relative_to(R)):sha(oldpath),str(catalog.relative_to(R)):sha(catalog)},'counts':counts,'rows':result,'script_sha256':sha(Path(__file__))},indent=2)+'\n');print(counts)
