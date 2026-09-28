#!/usr/bin/env python3
from pathlib import Path
import datetime,hashlib,json,os,shutil,subprocess,time
root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((root/'base-source-lock.json').read_text())['files']
def manifest():return {str(p.relative_to(root/'source')):sha(p) for p in sorted((root/'source').rglob('*')) if p.is_file()}
source=manifest();assert set(source)-set(base)=={'pkg/sim/advice_build_batch_profile_test.go'};assert all(source[p]==v for p,v in base.items())
inputs=json.loads((root/'input-lock.json').read_text());assert all(sha(root/p)==v for p,v in inputs.items())
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');out=root/'runs'/stamp;out.mkdir(parents=True)
lock={'base_source_lock_sha256':sha(root/'base-source-lock.json'),'scope':'Test-only exact captured request over neighboring exact replay states; no production changes','files':source};(out/'source-lock.json').write_text(json.dumps(lock,indent=2)+'\n');shutil.copyfile(out/'source-lock.json',root/'source-lock.json');shutil.copyfile(root/'source/pkg/sim/advice_build_batch_profile_test.go',out/'advice_build_batch_profile_test.go');shutil.copyfile(Path(__file__),out/'run-profile.py')
receipt={'source_lock_sha256':sha(out/'source-lock.json'),'input_lock_sha256':sha(root/'input-lock.json'),'host_conditions':'GOMAXPROCS2 shared Apple M4 desktop; live 4H/browser/host/native audit closed. Art and parent work may continue; not quiet latency acceptance. Exact server capture tick unavailable.','commands':[]};env=os.environ.copy();env.update(GOMAXPROCS='2',FRONTLINE_BUILD_ADVICE_INPUTS=str(root),FRONTLINE_BUILD_ADVICE_OUTPUT=str(out));binary=out/'sim.test'
for name,command in [('build',['/opt/homebrew/bin/go','test','-c','./pkg/sim','-o',str(binary)]),('reconstruction',[str(binary),'-test.run=^TestCapturedBuildAdviceReconstruction$','-test.count=1','-test.v','-test.timeout=3m']),('benchmark',[str(binary),'-test.run=^$','-test.bench=^BenchmarkCapturedBuildAdvice$','-test.benchtime=3x','-test.count=1','-test.timeout=3m'])]:
 start=time.time()
 with (out/(name+'.log')).open('w') as log:result=subprocess.run(command,cwd=root/'source',env=env,stdout=log,stderr=subprocess.STDOUT)
 receipt['commands'].append({'name':name,'command':command,'exit_code':result.returncode,'seconds':round(time.time()-start,3)})
 if name=='build' and result.returncode==0:receipt['binary_sha256']=sha(binary)
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 if result.returncode:break
receipt['source_verified_after']=manifest()==source;receipt['inputs_verified_after']=all(sha(root/p)==v for p,v in inputs.items());(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(out);print(json.dumps(receipt,indent=2));assert receipt['source_verified_after'] and receipt['inputs_verified_after'];raise SystemExit(result.returncode)
