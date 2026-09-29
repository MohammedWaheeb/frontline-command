from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((HERE/'source-lock.json').read_text());assert all(sha(REPO/p)==h for p,h in lock['files'].items())
cases=[('actual-small-fuel-v1',REPO/'assets/build/sprites'),('actual-launcher-v1',REPO/'work/art/vehicle-runtime-handoffs-v1/unit.IR.launcher/stage/assets/build/sprites'),('actual-airlift-v1',REPO/'work/art/aircraft-final-production-v2/stage-v4/assets/build/sprites'),('synthetic-after-v1',HERE/'synthetic-before-v1')]
rows=[]
for folder,reference in cases:
 root=HERE/folder;result=json.loads((root/'result.json').read_text());outputs=result['outputs'];aid=result['asset']
 expected={str(p.relative_to(reference)) for p in (reference/aid).iterdir() if p.is_file()}
 assert set(outputs)==expected,folder
 for rel,want in outputs.items():assert sha(root/rel)==sha(reference/rel)==want,(folder,rel)
 rows.append({'case':folder,'asset':aid,'files':len(outputs),'all_output_file_bytes_exact':True,'reference':str(reference.relative_to(REPO)),'peak_rss_bytes_shared_host':result['peak_rss_bytes_macos'],'wall_seconds_shared_host':result['wall_seconds_shared_host'],'result_sha256':sha(root/'result.json')})
report={'scope':'Optimization-only isolated candidate. Three existing complete exports plus a forced multi-page alpha/layer/hardpoint fixture; every PNG, descriptor, sidecar and content hash byte exact. No universal render tolerance, metadata change or production mutation.','failures':0,'file_comparisons':sum(r['files'] for r in rows),'cases':rows,'candidate_sha256':sha(HERE/'candidate/pack_sprites.py'),'baseline_sha256':sha(HERE/'before/pack_sprites.py'),'helper_sha256':sha(Path(__file__))}
(HERE/'result.json').write_text(json.dumps(report,indent=2)+'\n');print('FC_STREAMING_EQUIVALENCE_DONE',report['file_comparisons'])
