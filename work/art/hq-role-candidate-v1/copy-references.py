"""Copy only hash-verified selected original HQ raw/UI files; no model/render."""
from pathlib import Path
import json,hashlib,shutil
B=Path(__file__).resolve().parent;R=B.parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();out=B/'references-v1';assert not out.exists();out.mkdir();plan=json.loads((B/'pilot-plan.json').read_text());rows=[]
for aid,tuples in plan.items():
 hfile=R/'work/art/building-runtime-handoffs-v1'/aid/'runtime-handoff.json';h=json.loads(hfile.read_text());rawfile=hfile.parent/'raw-identity.json';assert sha(rawfile)==h['receipts'][str(rawfile.relative_to(R))];raw=json.loads(rawfile.read_text())['files'];spec=json.loads((R/h['spec']).read_text());states={s['name']:s for s in spec['states']}
 for t in tuples:
  key=f"{t['state']}/d00_f{t['frame']:02d}";st=states[t['state']]
  for layer in st.get('layers',spec['passes']):
   rel=f'{layer}/{key}.png';p=R/'assets/build/frames'/aid/rel;assert sha(p)==raw[rel];d=out/aid/'raw'/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);rows.append({'source':str(p.relative_to(R)),'copy':str(d.relative_to(B)),'sha256':sha(d)})
 for key,v in h['files'].items():
  if not key.startswith('ui/') or '@2x.' not in key:continue
  p=R/v['source'];assert sha(p)==v['sha256'];d=out/aid/key;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);rows.append({'source':str(p.relative_to(R)),'copy':str(d.relative_to(B)),'sha256':sha(d)})
 rows.append({'handoff':str(hfile.relative_to(R)),'sha256':sha(hfile),'raw_identity_sha256':sha(rawfile)})
(out/'receipt.json').write_text(json.dumps({'scope':'Selected immutable original raw/UI controls; full original exports stay intact.','files':rows},indent=2)+'\n');print('FC_HQ_REFERENCE_COPY',len(rows))
