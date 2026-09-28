#!/usr/bin/env python3
"""Run only after an explicit quiet-window release; no source edits or compile."""
from pathlib import Path
import datetime,hashlib,json,os,shutil,subprocess,time
root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=root/'source-lock.json'
expected_source='9313438021d25fe211e214b50d516c3ee4b5827c8cf90148663a09f141042aa3'
expected_binary='8791a92ca420ab997ca3bc7c9943299f716b336de9ea5367ae5ede3840f04edb'
binary=root/'runs/20260928T161842Z/sim.test'
assert sha(lock)==expected_source and sha(binary)==expected_binary
files=json.loads(lock.read_text())['files']
def verify():
 actual={str(p.relative_to(root/'source')):sha(p) for p in sorted((root/'source').rglob('*')) if p.is_file()}
 return actual==files
assert verify()
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out=root/'pilots'/(stamp+'-sa05-hard-unchanged');out.mkdir(parents=True,exist_ok=False)
shutil.copyfile(lock,out/'source-lock.json');shutil.copyfile(Path(__file__),out/'run-sa05-unchanged.py')
selector='^TestAuthoredCampaignCaptureCompletion$/^sa-05-three-positions$/^hard$'
command=[str(binary),'-test.run='+selector,'-test.count=1','-test.timeout=30m','-test.v']
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_FATAL_') and k not in ['FRONTLINE_TEST_FATAL_DIAGNOSTICS','FRONTLINE_MISSION_CHECKPOINTS']}
env.update(GOMAXPROCS='2',FRONTLINE_MISSION_EVIDENCE=str(out/'evidence'))
receipt={'scope':'Unchanged SA05 Hard tactics with proven failure-only cleanup; no production/content/resource/deadline edits','simulation':'0.3.4','source_lock_sha256':expected_source,'binary_sha256':expected_binary,'original_pilot':'work/runtime-034-tactics/pilots/20260928T153224Z-sa05-hard-readiness','command':command,'cwd':str(root/'source/pkg/sim'),'host_conditions':'One native GOMAXPROCS=2 correctness leaf; sole Blender IR producer active on shared Apple M4 desktop. No throughput or quiet-host timing conclusion.','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running'}
(out/'run.json').write_text(json.dumps(receipt,indent=2)+'\n');print(out,flush=True)
start=time.monotonic()
with (out/'test.log').open('w') as log:result=subprocess.run(command,cwd=root/'source/pkg/sim',env=env,stdout=log,stderr=subprocess.STDOUT)
receipt.update(status='passed' if result.returncode==0 else 'failed',exit_code=result.returncode,elapsed_seconds=round(time.monotonic()-start,3),completed=datetime.datetime.now(datetime.timezone.utc).isoformat(),source_verified_after=verify(),binary_verified_after=sha(binary)==expected_binary)
receipt['artifacts']={str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted((out/'evidence').rglob('*')) if p.is_file()}
(out/'run.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='artifacts'},indent=2),flush=True);print('artifacts',len(receipt['artifacts']),flush=True)
assert receipt['source_verified_after'] and receipt['binary_verified_after']
raise SystemExit(result.returncode)
