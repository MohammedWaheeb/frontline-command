#!/usr/bin/env python3
"""Freeze one test-only full-art course; optionally execute one native fixture."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = ROOT/'work/navigation-lookup-candidate'
SOURCE = HERE/'source'
GO = '/opt/homebrew/bin/go'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

assert sha(BASE/'source-lock.json') == 'c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122'
base = json.loads((BASE/'source-lock.json').read_text())['files']
assert {str(p.relative_to(BASE/'source')):sha(p) for p in (BASE/'source').rglob('*') if p.is_file()} == base
assert not SOURCE.exists(), 'Preserve prior source and outputs'
for name, digest in base.items():
    target = SOURCE/name;target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(BASE/'source'/name,target)
shutil.copy2(HERE/'full_art_payload_course_test.go',SOURCE/'pkg/sim/full_art_payload_course_test.go')
locked = {str(p.relative_to(SOURCE)):sha(p) for p in SOURCE.rglob('*') if p.is_file()}
assert len(locked)==357
assert {name:locked[name] for name in base} == base
receipt = dict(base_lock_sha256=sha(BASE/'source-lock.json'),base_production_exact=True,
               scope='Exact frozen c7e0 production plus one test-only course derived from preserved go-run-02. Prepared infrastructure/one round; ordinary subsequent Submit/Advance. No paid-opening claim.',files=locked)
(HERE/'source-lock.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Prepared source',sha(HERE/'source-lock.json'),flush=True)
if '--run-native' not in sys.argv:sys.exit(0)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out=HERE/('native-'+stamp);out.mkdir()
shutil.copy2(HERE/'source-lock.json',out/'source-lock.json')
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ('GOOS','GOARCH')}
env.update(GOMAXPROCS='1',GOFLAGS='-p=1',FRONTLINE_FULL_PAYLOAD_COURSE=str(out))
r=dict(status='running',source_lock_sha256=sha(HERE/'source-lock.json'),conditions='One GOMAXPROCS1 fixture process, shared browser/Blender host; correctness only.',commands=[])
for stage,command in [('compile',[GO,'test','-c','-o',str(out/'course.test'),'./pkg/sim']),('native',[str(out/'course.test'),'-test.run','^TestFullArtAircraftPayloadCourse$','-test.v','-test.timeout','2m'])]:
    log=out/(stage+'.log')
    with log.open('w') as stream:process=subprocess.run(command,cwd=SOURCE,env=env,stdout=stream,stderr=subprocess.STDOUT)
    r['commands'].append(dict(stage=stage,command=command,exit_code=process.returncode,log_sha256=sha(log)))
    if (out/'course.test').exists():r['binary_sha256']=sha(out/'course.test')
    r['status']='failed' if process.returncode else 'running'
    (out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
    print(stage,process.returncode,flush=True)
    if process.returncode:sys.exit(process.returncode)
assert {str(p.relative_to(SOURCE)):sha(p) for p in SOURCE.rglob('*') if p.is_file()} == locked
for typ in ('US.fighter','IR.strike'):
    result=json.loads((out/typ/'result.json').read_text())
    assert result['status']=='passed' and result['points']==10 and result['replay_checkpoints_removed']
    assert len(list((out/typ).glob('*.save.json')))==10
r.update(status='passed',source_verified_after=True,artifacts={str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and p.name not in ('receipt.json','course.test')})
(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
print(out,flush=True)
