#!/usr/bin/env python3
"""Explicitly invoked only after the live multiplayer host closes."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,time,sys
root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((root/'base-source-lock.json').read_text())['files']
def manifest():return {str(p.relative_to(root/'source')):sha(p) for p in sorted((root/'source').rglob('*')) if p.is_file()}
source=manifest();assert set(source)-set(base)=={'pkg/sim/advice_path_profile_test.go'};assert all(source[k]==v for k,v in base.items())
for n,v in json.loads((root/'input-lock.json').read_text()).items():assert sha(root/'inputs'/n)==v['sha256']
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');out=root/'runs'/stamp;out.mkdir(parents=True)
(root/'source-lock.json').write_text(json.dumps({'base_source_lock_sha256':sha(root/'base-source-lock.json'),'scope':'Only added diagnostic test; unchanged production/navigation/protocol/content sources.','files':source},indent=2)+'\n')
env=os.environ.copy();env.update(GOMAXPROCS='2',FRONTLINE_ADVICE_PROFILE_INPUTS=str(root/'inputs'),FRONTLINE_ADVICE_PROFILE_OUTPUT=str(out));binary=out/'sim.test'
receipt={'source_lock_sha256':sha(root/'source-lock.json'),'input_lock_sha256':sha(root/'input-lock.json'),'runner_sha256':sha(Path(__file__)),'host_conditions':os.environ.get('FRONTLINE_PROFILE_HOST','Shared desktop; correctness/microprofile only, not quiet latency acceptance'),'commands':[]}
commands=[['/opt/homebrew/bin/go','test','-c','./pkg/sim','-o',str(binary)], [str(binary),'-test.run=^TestAdvicePathPreservedFixtures$|^TestAdviceProfileIsDiagnosticOnly$','-test.count=1','-test.v','-test.timeout=4m'],[str(binary),'-test.run=^$','-test.bench=^BenchmarkPreservedAdvicePath$','-test.benchtime=1x','-test.count=1','-test.timeout=4m']]
for name,command in zip(['build','correctness','diagnostic-bench'],commands):
 start=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(command,cwd=root/'source',env=env,stdout=log,stderr=subprocess.STDOUT)
 receipt['commands'].append({'name':name,'command':command,'exit_code':r.returncode,'seconds':round(time.time()-start,3)})
 if name=='build' and r.returncode==0:receipt['binary_sha256']=sha(binary)
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 if r.returncode:break
receipt['source_verified_after']=manifest()==source
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(out);print(json.dumps(receipt,indent=2));assert receipt['source_verified_after'];sys.exit(receipt['commands'][-1]['exit_code'])
