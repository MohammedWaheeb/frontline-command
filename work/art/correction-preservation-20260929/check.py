"""Read-only complete historical handoff graph preservation receipt."""
from pathlib import Path
import json,hashlib,sys,datetime
B=Path(__file__).resolve().parent;R=B.parents[2]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 return h.hexdigest()
paths=['work/art/legacy-us-rifle-ui-v1/runtime-handoff.json','work/art/building-runtime-handoffs-v1/building.SY.hq/runtime-handoff.json','work/art/building-runtime-handoffs-v1/building.SA.hq/runtime-handoff.json','work/art/vehicle-runtime-handoffs-v1/unit.IR.launcher/runtime-handoff.json']+[f'work/art/ground-launcher-charge-contract-v1/production-v2/runtime-handoff/unit.{f}.launcher.json'for f in ['US','IR','SY']];rows=[]
for name in paths:
 p=R/name;h=json.loads(p.read_text());checked={}
 for key,row in h['files'].items():
  source=R/row['source'];assert source.stat().st_size==row['bytes'] and sha(source)==row['sha256'],(h['id'],key);checked[row['source']]=row['sha256']
 for key,want in h['receipts'].items():assert sha(R/key)==want,(h['id'],key);checked[key]=want
 for field in ['model','spec']:
  if field in h and field+'_sha256'in h:assert sha(R/h[field])==h[field+'_sha256'];checked[h[field]]=h[field+'_sha256']
 rows.append({'id':h['id'],'handoff':name,'handoff_sha256':sha(p),'export_files':len(h['files']),'export_bytes':sum(x['bytes']for x in h['files'].values()),'checked_sources':checked})
name=sys.argv[1];assert '/'not in name and name.endswith('.json');out=B/name;assert not out.exists();out.write_text(json.dumps({'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Historical accepted handoff export files, pinned receipts and declared model/spec hashes verified byte-exact. Does not claim a new render or validate unpinned files.','script_sha256':sha(Path(__file__)),'rows':rows,'failures':0},indent=2)+'\n');print('FC_PRIOR_HANDOFFS_UNCHANGED',len(rows),sum(x['export_files']for x in rows),sum(x['export_bytes']for x in rows))
