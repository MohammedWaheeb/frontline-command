from pathlib import Path
from contextlib import closing
import datetime,hashlib,json,os,shutil,sqlite3,subprocess,sys

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUT=HERE/sys.argv[1]
OUT.mkdir()
for name in ['run.py','seed.go','verify.go']:shutil.copyfile(HERE/name,OUT/('original-'+name))
sha=lambda data:hashlib.sha256(data).hexdigest()
receipt={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Private synthetic profile/record fixtures written by actual historical storage source, current schema8 upgrade, stopped-directory backup/restore and corruption/future-version rejection. Real saved/replay payload bytes are preserved only; no game/simulation-version migration, host, browser or personal data.','commands':[],'cases':[],'pins':{}}
def save(): (OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
def pin(path):
 data=path.read_bytes();receipt['pins'][str(path.relative_to(ROOT))]=sha(data);return data
def run(args,cwd,label):
 env=dict(os.environ,GOMAXPROCS='1',GOOS='darwin',GOARCH='arm64',CGO_ENABLED='0')
 result=subprocess.run([str(v) for v in args],cwd=cwd,env=env,capture_output=True,timeout=120)
 log=OUT/(label+'.log');log.write_bytes(result.stdout+result.stderr)
 receipt['commands'].append({'name':label,'exit':result.returncode,'log_sha256':sha(log.read_bytes())});save()
 if result.returncode:raise RuntimeError(label+' failed; original log retained')
 return result.stdout
def source(revision,name,helper):
 dest=OUT/name;dest.mkdir();files=[]
 if revision:
  names=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'internal/storage','go.mod','go.sum'],cwd=ROOT,text=True).splitlines()
  for rel in names:
   if rel.endswith('_test.go'):continue
   data=subprocess.check_output(['git','show',revision+':'+rel],cwd=ROOT);p=dest/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);files.append({'path':rel,'sha256':sha(data)})
 else:
  for p in [ROOT/'go.mod',ROOT/'go.sum',*sorted((ROOT/'internal/storage').glob('*.go'))]:
   if p.name.endswith('_test.go'):continue
   rel=p.relative_to(ROOT);data=pin(p);q=dest/rel;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(data);files.append({'path':str(rel),'sha256':sha(data)})
 p=dest/'cmd/rehearsal/main.go';p.parent.mkdir(parents=True);p.write_bytes(pin(HERE/helper));files.append({'path':'cmd/rehearsal/main.go','sha256':sha(p.read_bytes())})
 (dest/'source-lock.json').write_text(json.dumps({'revision':revision or 'current','files':files},indent=2)+'\n')
 binary=OUT/(name+'.bin');run(['/opt/homebrew/bin/go','build','-p=1','-o',binary,'./cmd/rehearsal'],dest,name+'-build');return binary
def database(path):
 with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as db:
  assert db.execute('PRAGMA integrity_check').fetchone()==('ok',)
  assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
  version=db.execute('PRAGMA user_version').fetchone()[0]
  tables={}
  for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
   assert name.replace('_','').isalnum()
   rows=db.execute('SELECT * FROM "'+name+'"').fetchall()
   encoded=[json.dumps([{'blob_hex':v.hex()} if isinstance(v,bytes) else v for v in row],sort_keys=True,separators=(',',':')) for row in rows]
   tables[name]={'rows':len(rows),'sha256':sha('\n'.join(sorted(encoded)).encode())}
 return {'version':version,'tables':tables,'db_sha256':sha(path.read_bytes())}
def files(directory):return {str(p.relative_to(directory)):sha(p.read_bytes()) for p in sorted(directory.rglob('*')) if p.is_file()}
def stopped(directory):
 for p in directory.glob('*-wal'):assert p.stat().st_size==0,'Nonempty WAL after process closed'
def copy(source,destination):
 stopped(source);shutil.copytree(source,destination);assert files(source)==files(destination)

try:
 pin(Path(__file__).resolve())
 native=ROOT/'work/ground-launcher-runtime-course-v1/native-03';native_receipt=json.loads(pin(native/'receipt.json'))
 save_path=native/'evidence/US.launcher/01-initial.save.json';replay_path=native/'evidence/US.launcher/course.fcr'
 for p in [save_path,replay_path]:assert sha(pin(p))==native_receipt['evidence'][str(p.relative_to(native))]
 verify=source(None,'current-source','verify.go')
 for revision,version in [('2774b38',6),('d316398',7)]:
  seed=source(revision,'historical-'+str(version),'seed.go')
  original=OUT/('original schema '+str(version));run([seed,original,save_path,replay_path],ROOT,'seed-'+str(version));stopped(original)
  before=database(original/'frontline.db');assert before['version']==version
  original_hashes=files(original);restored=OUT/('restore schema '+str(version));copy(original,restored)
  run([verify,restored,save_path,replay_path,'check'],ROOT,'upgrade-'+str(version));stopped(restored);after=database(restored/'frontline.db');assert after['version']==8
  for table,value in before['tables'].items():assert after['tables'][table]==value,(version,table,'Migration changed existing rows')
  run([verify,restored,save_path,replay_path,'check'],ROOT,'reopen-'+str(version));assert database(restored/'frontline.db')['tables']==after['tables']
  backup=OUT/('vacuum backup '+str(version)+'.db');run([verify,restored,save_path,replay_path,'backup',backup],ROOT,'backup-'+str(version));stopped(restored)
  backup_data=database(backup);assert backup_data['tables']==after['tables']
  final=OUT/('restored backup '+str(version));copy(restored,final);shutil.copyfile(backup,final/'frontline.db')
  run([verify,final,save_path,replay_path,'check'],ROOT,'verify-backup-'+str(version));assert database(final/'frontline.db')['tables']==after['tables']
  run([verify,final,save_path,replay_path,'write'],ROOT,'verify-tombstone-'+str(version))
  for mode in ['future','corrupt']:
   invalid=OUT/(mode+' schema '+str(version));copy(restored,invalid);p=invalid/'frontline.db'
   if mode=='future':
    with closing(sqlite3.connect(p)) as db:
     with db:db.execute('PRAGMA user_version=9')
   else:p.write_bytes(b'not a SQLite database\x00'+p.read_bytes()[:100])
   stopped(invalid);invalid_hashes=files(invalid);run([verify,invalid,save_path,replay_path,'reject-'+mode],ROOT,mode+'-'+str(version));stopped(invalid);assert files(invalid)==invalid_hashes,'Rejected directory changed including WAL/SHM/object files'
  assert files(original)==original_hashes,'Historical original changed'
  receipt['cases'].append({'historical_commit':subprocess.check_output(['git','rev-parse',revision],cwd=ROOT,text=True).strip(),'from_schema':version,'to_schema':8,'original':before,'upgraded':after,'backup':backup_data,'original_unchanged':True,'closed_copy_exact':True,'restore_reopen_rows_exact':True,'tombstone_and_stale_CAS_pass':True,'corrupt_and_future_preserved':True});save()
 for rel,digest in receipt['pins'].items():assert sha((ROOT/rel).read_bytes())==digest,rel
 receipt['staged_sources_verified_after']=[]
 for name in ['current-source','historical-6','historical-7']:
  directory=OUT/name;lock=json.loads((directory/'source-lock.json').read_text())
  for item in lock['files']:assert sha((directory/item['path']).read_bytes())==item['sha256'],(name,item['path'])
  receipt['staged_sources_verified_after'].append({'source':name,'files':len(lock['files'])})
 receipt['source_verified_after']=True;receipt['status']='passed'
except BaseException as error:
 receipt['status']='failed';receipt['failure']=str(error);raise
finally:
 receipt['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps({'status':receipt['status'],'cases':len(receipt['cases']),'out':str(OUT)}),flush=True)
