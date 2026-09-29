from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys
HERE=Path(__file__).resolve().parent;native=HERE/sys.argv[1];out=HERE/sys.argv[2];assert not out.exists();out.mkdir();source=out/'source';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();receipt=json.loads((native/'receipt.json').read_text());assert receipt['status']=='passed';lock=json.loads((native/'source-lock.json').read_text())
for rel,h in lock['files'].items():
 p=native/'source'/rel;assert sha(p)==h;q=source/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
shutil.copy2(HERE/'apc-lifecycle-oracle_test.go',source/'cmd/wasm/apc_lifecycle_oracle_test.go');subprocess.run(['/opt/homebrew/bin/gofmt','-w',str(source/'cmd/wasm/apc_lifecycle_oracle_test.go')],check=True)
files={str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()};newlock={'base_source_lock_sha256':sha(native/'source-lock.json'),'base_files_exact':True,'files':files};(out/'source-lock.json').write_text(json.dumps(newlock,indent=2)+'\n')
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ['GOOS','GOARCH']};env.update(GOMAXPROCS='1',GOFLAGS='-p=1',FRONTLINE_APC_INPUT=str(native),FRONTLINE_APC_ORACLE=str(out));r={'status':'running','input_receipt_sha256':sha(native/'receipt.json'),'source_lock_sha256':sha(out/'source-lock.json'),'commands':[]}
for stage,cmd in [('compile',['/opt/homebrew/bin/go','test','-c','-o',str(out/'oracle.test'),'./cmd/wasm']),('native',[str(out/'oracle.test'),'-test.run','^TestAPCLifecycleAdapterOracle$','-test.v','-test.timeout','2m'])]:
 with (out/(stage+'.log')).open('w') as f:p=subprocess.run(cmd,cwd=source,env=env,stdout=f,stderr=subprocess.STDOUT)
 r['commands'].append({'stage':stage,'command':cmd,'exit_code':p.returncode,'log_sha256':sha(out/(stage+'.log'))});r['status']='failed' if p.returncode else 'running';(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(stage,p.returncode,flush=True)
 if p.returncode:sys.exit(p.returncode)
assert {str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()}==files
for rel,h in receipt['artifacts'].items():assert sha(native/rel)==h
r.update(status='passed',source_verified_after=True,input_verified_after=True,wire_records=len(list(out.glob('*/*.pb'))),binary_sha256=sha(out/'oracle.test'),artifacts={str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and 'source' not in p.relative_to(out).parts and p.name not in ['receipt.json','oracle.test']});(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
