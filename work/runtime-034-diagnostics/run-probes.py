#!/usr/bin/env python3
from pathlib import Path
import datetime,hashlib,json,os,subprocess,time,difflib,shutil
root=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((root/'base-source-lock.json').read_text())['files']
source={str(p.relative_to(root/'source')):sha(p) for p in sorted((root/'source').rglob('*')) if p.is_file()}
allowed={'pkg/sim/authored_tutorial_acceptance_test.go','pkg/sim/authored_failure_diagnostics_test.go','pkg/sim/authored_failure_diagnostics_probe_test.go'}
assert {p for p in source if source[p]!=base.get(p)}==allowed
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');out=root/'runs'/stamp;out.mkdir(parents=True)
lock={'base_source_lock_sha256':sha(root/'base-source-lock.json'),'scope':'Failure-only diagnostics; no tactics/rules/deadline/resource changes','files':source};(out/'source-lock.json').write_text(json.dumps(lock,indent=2)+'\n');shutil.copyfile(out/'source-lock.json',root/'source-lock.json')
for rel in allowed:
 p=out/'source'/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/'source'/rel,p)
binary=out/'sim.test';env=os.environ.copy();env.update(GOMAXPROCS='2',FRONTLINE_TEST_FATAL_DIAGNOSTICS='1',FRONTLINE_FATAL_PROBE_EVIDENCE_ROOT=str(out/'probes'))
receipt={'source_lock_sha256':sha(out/'source-lock.json'),'runner_sha256':sha(Path(__file__)),'scope':'Small subprocess diagnostic tests only; no full mission pilot','commands':[]}
for name,command,cwd in [('build',['/opt/homebrew/bin/go','test','-c','./pkg/sim','-o',str(binary)],root/'source'),('probes',[str(binary),'-test.run=^TestAuthoredFatalDiagnostics$','-test.count=1','-test.v','-test.timeout=2m'],root/'source/pkg/sim')]:
 start=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 receipt['commands'].append({'name':name,'command':command,'exit_code':r.returncode,'seconds':round(time.time()-start,3)})
 if name=='build' and r.returncode==0:receipt['binary_sha256']=sha(binary)
 if r.returncode:break
receipt['source_verified_after']=all(sha(root/'source'/p)==h for p,h in source.items());(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(out);print(json.dumps(receipt,indent=2));assert receipt['source_verified_after'];raise SystemExit(r.returncode)
