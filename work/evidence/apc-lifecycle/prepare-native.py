from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,datetime
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];BASE=ROOT/'work/runtime-034-integrated-source'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE/'source-lock.json')=='3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
name=sys.argv[1];out=HERE/name;assert not out.exists();out.mkdir();source=out/'source';base=json.loads((BASE/'source-lock.json').read_text())['files']
for rel,h in base.items():
 p=BASE/'source'/rel;assert sha(p)==h,rel;q=source/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
shutil.copy2(HERE/'apc-lifecycle-course_test.go',source/'pkg/sim/apc_lifecycle_course_test.go')
subprocess.run(['/opt/homebrew/bin/gofmt','-w',str(source/'pkg/sim/apc_lifecycle_course_test.go')],check=True)
files={str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()};lock={'base_lock_sha256':sha(BASE/'source-lock.json'),'base_files_exact':all(files[k]==h for k,h in base.items()),'scope':'Exact integrated0.3.4 plus one test-only prepared APC course. No production changes.','files':files};(out/'source-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ['GOOS','GOARCH']};env.update(GOMAXPROCS='1',GOFLAGS='-p=1',FRONTLINE_APC_COURSE=str(out))
r={'status':'running','source_lock_sha256':sha(out/'source-lock.json'),'base_lock_sha256':lock['base_lock_sha256'],'conditions':'Shared host, single GOMAXPROCS1 native process; correctness only.','commands':[]}
for stage,cmd in [('compile',['/opt/homebrew/bin/go','test','-c','-o',str(out/'course.test'),'./pkg/sim']),('native',[str(out/'course.test'),'-test.run','^TestAPCLifecycleCourse$','-test.v','-test.timeout','2m'])]:
 with (out/(stage+'.log')).open('w') as f:p=subprocess.run(cmd,cwd=source,env=env,stdout=f,stderr=subprocess.STDOUT)
 r['commands'].append({'stage':stage,'command':cmd,'exit_code':p.returncode,'log_sha256':sha(out/(stage+'.log'))});r['status']='failed' if p.returncode else 'running';(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(stage,p.returncode,flush=True)
 if p.returncode:sys.exit(p.returncode)
assert {str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file()}==files
r.update(status='passed',source_verified_after=True,binary_sha256=sha(out/'course.test'),artifacts={str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and 'source' not in p.relative_to(out).parts and p.name not in ['receipt.json','course.test']});(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n')
