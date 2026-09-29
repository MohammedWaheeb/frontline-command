"""One isolated actual-actor course; execute only after parent releases a quiet window."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,platform,signal,subprocess,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('--conditions',required=True);args=p.parse_args()
assert args.name.startswith('server-') and '/' not in args.name
OUT=HERE/args.name;OUT.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lockpath=HERE/'server-source-lock.json';lock=json.loads(lockpath.read_text());source=HERE/'server-source'
def verify():
 for rel,digest in lock['files'].items():assert sha(source/rel)==digest,rel
verify()
report={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_lock_sha256':sha(lockpath),'base_lock_sha256':lock['base_lock_sha256'],'runner_sha256':sha(Path(__file__)),'conditions':args.conditions,'environment':{'GOMAXPROCS':'1','GOFLAGS':'-p=1','GOGC':os.environ.get('GOGC'),'GOMEMLIMIT':os.environ.get('GOMEMLIMIT')},'platform':platform.platform(),'stages':[]}
env=dict(os.environ,GOMAXPROCS='1',GOFLAGS='-p=1')
for k in list(env):
 if k.startswith('FRONTLINE_'):del env[k]
env['FRONTLINE_MAXIMUM_INPUT']=str(ROOT/'work/combined-load-current/run-02')
env['FRONTLINE_MAXIMUM_OUTPUT']=str(OUT/'evidence')
def save():(OUT/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
def run(stage,cmd,limit):
 start=time.monotonic()
 with (OUT/(stage+'.log')).open('wb') as f:
  child=subprocess.Popen(cmd,cwd=source,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=limit)
  except BaseException:
   os.killpg(child.pid,signal.SIGKILL);child.wait();raise
 row={'stage':stage,'cmd':cmd,'exit':code,'seconds':time.monotonic()-start,'log_sha256':sha(OUT/(stage+'.log'))};report['stages'].append(row);save();print(json.dumps(row),flush=True)
 assert code==0,stage
try:
 for name,cmd in [('go',['/opt/homebrew/bin/go','version']),('hardware',['/usr/sbin/sysctl','-n','machdep.cpu.brand_string','hw.memsize','hw.logicalcpu']),('power',['/usr/bin/pmset','-g','batt']),('processes-before',['/bin/ps','-axo','pid,ppid,pcpu,pmem,comm'])]:run(name,cmd,10)
 binary=OUT/'server.test';run('compile',['/opt/homebrew/bin/go','test','-c','-p=1','-o',str(binary),'./internal/server'],60)
 report['binary_sha256']=sha(binary);save()
 run('actor600',[str(binary),'-test.run=^TestMaximumActualServerActor600$','-test.count=1','-test.v','-test.timeout=75s'],80)
 result=json.loads((OUT/'evidence/server.json').read_text());assert result['status']=='passed'
 report['status']='passed'
except BaseException as error:
 report['status']='failed';report['failure']=str(error);raise
finally:
 verify();report['source_verified_after']=True
 report['artifacts']={str(p.relative_to(OUT)):sha(p) for p in OUT.rglob('*') if p.is_file() and p.name not in ('receipt.json','server.test')}
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
