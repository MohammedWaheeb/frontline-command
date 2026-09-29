"""Read-only exact completed handoff inventory; not a product/build plan."""
from pathlib import Path
import hashlib,json,subprocess
B=Path(__file__).resolve().parent;R=B.parents[3]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def read(rel):return json.loads((R/rel).read_text())
oldrel='work/art/roster-runtime-overlay-v1/prepared-forty-three-v25-plan.json';old=read(oldrel);byid={};history=[]
for rel in old['handoffs']:
 assert sha(R/rel)==old['receipts_sha256'][rel],rel
 h=read(rel);assert h['id']not in byid;byid[h['id']]=rel
latest=['work/art/us-rifle-style-candidate-v1/production-v1/runtime-handoff/unit.US.rifle.json']+[f'work/art/hq-role-candidate-v1/production-v1/runtime-handoff/building.{f}.hq.json'for f in ['SY','SA']]+[f'work/art/ground-launcher-charge-contract-v1/production-v2/runtime-handoff/unit.{f}.launcher.json'for f in ['US','IR','SY']]+['work/art/ground-launcher-charge-contract-v1/production-sa-v1/runtime-handoff/unit.SA.launcher.json']
for rel in latest:
 h=read(rel);aid=h['id'];previous=byid.get(aid);history.append({'id':aid,'previous':previous,'previous_sha256':sha(R/previous)if previous else None,'replacement':rel,'replacement_sha256':sha(R/rel)});byid[aid]=rel
assert len(byid)==46
rows=[]
for aid,rel in sorted(byid.items()):
 h=read(rel);sidekey=f'sprites/{aid}/{aid}.sprite.json';side=read(h['files'][sidekey]['source']);rows.append({'id':aid,'handoff':rel,'handoff_sha256':sha(R/rel),'poses':side['frame_count'],'files':len(h['files']),'bytes':sum(v['bytes']for v in h['files'].values()),'model_sha256':h.get('model_sha256')})
# Existing audited adapter checks every source/receipt/export SHA and closes graphs.
cmd=['node','work/art/roster-runtime-overlay-v1/overlay-v3.mjs','--base-lock','work/art/aircraft-runtime-overlay-v1/base-locks/integration-v25.json','--check',*[byid[k]for k in sorted(byid)]]
res=subprocess.run(cmd,cwd=R,text=True,capture_output=True);(B/'adapter-check.log').write_text(res.stdout+res.stderr);assert res.returncode==0,res.stderr
indexrel='work/art/effects-opus-v2/integration-v25/product/art/index.json';baseids=set(read(indexrel)['sprites']);union=baseids|set(byid);expected={p.stem for p in (R/'assets/pipeline/specs').glob('*.json')if p.stem.startswith(('unit.','building.','prop.'))};assert len(expected)==162 and union<=expected
result={'scope':'Read-only completed private handoff catalog. Does not build/publish a product or claim v25 runtime compatibility. New charge assets require the matching tested owner/private-state resolver in an explicitly selected later base. Original43 plan and every old handoff stay immutable.','source_plan':oldrel,'source_plan_sha256':sha(R/oldrel),'replacements':history,'assets':rows,'totals':{'handoffs':len(rows),'files':sum(x['files']for x in rows),'bytes':sum(x['bytes']for x in rows),'poses':sum(x['poses']for x in rows)},'adapter_check':{'path':str((B/'adapter-check.log').relative_to(R)),'sha256':sha(B/'adapter-check.log')},'reference_base_only':{'index':indexrel,'sha256':sha(R/indexrel),'sprite_ids':len(baseids),'union_ids':len(union),'base_only_ids':sorted(baseids-set(byid)),'missing_ids':sorted(expected-union)},'script_sha256':sha(Path(__file__))}
p=B/'result.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print(result['totals']);print('Reference union',len(union),'/162; missing',len(expected-union))
