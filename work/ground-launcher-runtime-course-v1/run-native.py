#!/usr/bin/env python3
"""Create a fresh immutable source/output pair for one real Go component course."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
BASE=ROOT/'work/runtime-034-integrated-source'
label=sys.argv[1]
assert label.startswith('native-') and label.replace('-','').isalnum()
out=HERE/label;out.mkdir()
source=out/'source';source.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE/'source-lock.json')=='3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
base=json.loads((BASE/'source-lock.json').read_text())['files']
for name,digest in base.items():
 assert sha(BASE/'source'/name)==digest,name
 p=source/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(BASE/'source'/name,p)
shutil.copy2(HERE/'launcher_payload_course_test.go',source/'pkg/sim/launcher_payload_course_test.go')
files={str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()}
assert len(files)==len(base)+1
lock=dict(base_lock_sha256=sha(BASE/'source-lock.json'),production_exact=True,files=files)
(out/'source-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ('GOOS','GOARCH')}
env.update(GOMAXPROCS='1',GOFLAGS='-p=1',FRONTLINE_GROUND_PAYLOAD_COURSE=str(out/'evidence'))
r=dict(status='running',source_lock_sha256=sha(out/'source-lock.json'),source_file_count=len(files),conditions='One GOMAXPROCS1 native process on shared Blender/browser host; correctness only.',commands=[])
(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
for stage,command in [('compile',['/opt/homebrew/bin/go','test','-c','-o',str(out/'course.test'),'./pkg/sim']),('native',[str(out/'course.test'),'-test.run','^TestGroundLauncherPayloadCourse$','-test.v','-test.timeout','3m'])]:
 with (out/(stage+'.log')).open('w') as log:result=subprocess.run(command,cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
 r['commands'].append(dict(stage=stage,command=command,exit_code=result.returncode,log_sha256=sha(out/(stage+'.log'))))
 r['status']='failed' if result.returncode else 'running'
 (out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(stage,result.returncode,flush=True)
 if result.returncode:sys.exit(result.returncode)
assert {str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()}==files
results=[json.loads(p.read_text()) for p in (out/'evidence').glob('*/result.json')]
assert len(results)==9 and all(x['status']=='passed' for x in results)
r.update(status='passed',source_verified_after=True,scenarios=len(results),points=sum(x['points'] for x in results),binary_sha256=sha(out/'course.test'),evidence={str(p.relative_to(out)):sha(p) for p in (out/'evidence').rglob('*') if p.is_file()})
(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(out,flush=True)
