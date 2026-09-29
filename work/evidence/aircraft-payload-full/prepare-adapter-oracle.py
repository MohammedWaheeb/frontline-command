#!/usr/bin/env python3
"""One isolated, locked Session delivery oracle; no browser or shipping writes."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess
HERE=Path(__file__).resolve().parent
BASE=HERE/'source'; ORIGINAL=HERE/'native-20260929T083415Z'
OUT=HERE/'adapter-oracle-01'; SOURCE=OUT/'source'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(HERE/'source-lock.json')=='6cd1adb63bf12026a496355cc2d5f44a72322e5ba61bee1cb762a1c5960c9387'
lock=json.loads((HERE/'source-lock.json').read_text())
assert {str(p.relative_to(BASE)):sha(p) for p in BASE.rglob('*') if p.is_file()}==lock['files']
receipt=json.loads((ORIGINAL/'receipt.json').read_text())
assert receipt['status']=='passed'
for name,digest in receipt['artifacts'].items():assert sha(ORIGINAL/name)==digest
OUT.mkdir(); SOURCE.mkdir()
for name,digest in lock['files'].items():
 p=SOURCE/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(BASE/name,p)
shutil.copy2(HERE/'adapter_oracle_test.go',SOURCE/'cmd/wasm/full_art_payload_adapter_oracle_test.go')
files={str(p.relative_to(SOURCE)):sha(p) for p in SOURCE.rglob('*') if p.is_file()}
assert len(files)==358
newlock=dict(base_source_lock_sha256=sha(HERE/'source-lock.json'),base_files_exact=True,files=files)
(OUT/'source-lock.json').write_text(json.dumps(newlock,indent=2)+'\n')
r=dict(status='running',source_lock_sha256=sha(OUT/'source-lock.json'),input_receipt_sha256=sha(ORIGINAL/'receipt.json'),conditions='One serial GOMAXPROCS=1 adapter fixture on shared host; correctness only.',commands=[])
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ('GOOS','GOARCH')}
env.update(GOMAXPROCS='1',GOFLAGS='-p=1',FRONTLINE_PAYLOAD_INPUT=str(ORIGINAL),FRONTLINE_PAYLOAD_ORACLE=str(OUT))
for stage,cmd in [('compile',['/opt/homebrew/bin/go','test','-c','-o',str(OUT/'adapter.test'),'./cmd/wasm']),('native',[str(OUT/'adapter.test'),'-test.run','^TestFullArtPayloadAdapterOracle$','-test.v','-test.timeout','2m'])]:
 with (OUT/(stage+'.log')).open('w') as stream:run=subprocess.run(cmd,cwd=SOURCE,env=env,stdout=stream,stderr=subprocess.STDOUT)
 r['commands'].append(dict(stage=stage,command=cmd,exit_code=run.returncode,log_sha256=sha(OUT/(stage+'.log'))))
 r['status']='failed' if run.returncode else 'running'
 (OUT/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
 print(stage,run.returncode,flush=True)
 if run.returncode:raise SystemExit(run.returncode)
assert {str(p.relative_to(SOURCE)):sha(p) for p in SOURCE.rglob('*') if p.is_file()}==files
for name,digest in receipt['artifacts'].items():assert sha(ORIGINAL/name)==digest
pb=list(OUT.glob('*/*.pb'));assert len(pb)==84
r.update(status='passed',source_verified_after=True,original_artifacts_verified_after=True,wire_records=len(pb),binary_sha256=sha(OUT/'adapter.test'),artifacts={str(p.relative_to(OUT)):sha(p) for p in OUT.rglob('*') if p.is_file() and 'source' not in p.relative_to(OUT).parts and p.name not in ('receipt.json','adapter.test')})
(OUT/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
print(OUT,flush=True)
