"""Read-only process-RSS sample of the already authorized streaming IR launcher pack."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,subprocess,time
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2];out=HERE/'streaming-ir-charge-pack-memory.json';assert not out.exists()
needle='production-v2/stage/assets/pipeline/tools/pack_sprites.py unit.IR.launcher';start=time.monotonic();samples=[];pid=None
while time.monotonic()-start<1800:
 rows=subprocess.check_output(['ps','-axo','pid=,rss=,command='],text=True).splitlines();matches=[]
 for row in rows:
  a=row.strip().split(None,2)
  if len(a)==3 and needle in a[2] and Path(a[2].split()[0]).name.lower().startswith('python'):matches.append((int(a[0]),int(a[1])*1024,a[2]))
 if matches:
  assert len(matches)==1
  current,rss,cmd=matches[0]
  if pid is None:pid=current;print('FC_STREAMING_IR_PACK_STARTED',pid,datetime.now(timezone.utc).isoformat(),flush=True)
  assert current==pid
  samples.append({'utc':datetime.now(timezone.utc).isoformat(),'rss_bytes':rss})
 elif pid is not None:break
 time.sleep(2)
helper=REPO/'work/art/ground-launcher-charge-contract-v1/production-v2/stage/assets/pipeline/tools/pack_sprites.py'
report={'scope':'Read-only sampled RSS of the streaming IR launcher packing process after Blender exits. Shared host; not a paired timing comparison. Samples can miss a brief peak.','pid':pid,'helper_sha256':hashlib.sha256(helper.read_bytes()).hexdigest(),'samples':samples,'max_sampled_rss_bytes':max((x['rss_bytes'] for x in samples),default=None),'completed_observation':pid is not None and bool(samples)}
out.write_text(json.dumps(report,indent=2)+'\n');print('FC_STREAMING_IR_PACK_CLOSED',report['max_sampled_rss_bytes'],flush=True)
