"""Bounded exact-source native timing; no stale dense-apron selectors."""
from pathlib import Path
import datetime, hashlib, json, os, platform, subprocess, sys, time
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUT=HERE/sys.argv[1]
assert OUT.name.startswith('native-') and not OUT.exists()
OUT.mkdir()
BASE=ROOT/'work/runtime-034-integrated-source'
SOURCE=BASE/'source'
LOCK=BASE/'source-lock.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected='3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
assert sha(LOCK)==expected
files=json.loads(LOCK.read_text())['files']
def verify():
 for p,h in files.items():assert sha(SOURCE/p)==h,p
verify()
selectors=['TestMaximumActorTickBudget','TestMaximumActorsMovingAndFighting','TestExteriorMaximum64OrdinaryReturns','TestExteriorMaximumCombinedReturnsRoutesInterception']
report={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Native Engine.Advance timing only, exact integrated source, correct exterior apron selectors; no server-loop, browser, final-art or Intel reference claim.','source_lock_sha256':expected,'source_files':len(files),'runner_sha256':sha(Path(__file__)),'selectors':selectors,'count':3,'conditions':'Root explicitly released <=5min quiet window: all agent Blender/packing/browser/host/native workloads closed; root lightweight source edits only. Normal OS/background processes not excluded. GOMAXPROCS=1.','environment':{'GOMAXPROCS':'1','GOFLAGS':'-p=1','CGO_ENABLED':os.environ.get('CGO_ENABLED'),'GOGC':os.environ.get('GOGC'),'GOMEMLIMIT':os.environ.get('GOMEMLIMIT')},'host':{'platform':platform.platform(),'machine':platform.machine()},'stages':[]}
env=dict(os.environ,GOMAXPROCS='1',GOFLAGS='-p=1')
for key in list(env):
 if key.startswith('FRONTLINE_'):del env[key]
def save(): (OUT/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
def run(name,args,timeout):
 start=time.monotonic()
 with (OUT/(name+'.log')).open('wb') as f:
  p=subprocess.run(args,cwd=SOURCE,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=timeout)
 row={'stage':name,'args':args,'exit':p.returncode,'seconds':time.monotonic()-start,'log_sha256':sha(OUT/(name+'.log'))}
 report['stages'].append(row);save();print(json.dumps(row),flush=True)
 assert p.returncode==0,name
try:
 for name,args in [('go',['/opt/homebrew/bin/go','version']),('hardware',['/usr/sbin/sysctl','-n','machdep.cpu.brand_string','hw.memsize','hw.logicalcpu']),('power',['/usr/bin/pmset','-g','batt']),('processes-before',['/bin/ps','-axo','pid,ppid,pcpu,pmem,comm'])]:run(name,args,10)
 binary=OUT/'sim.test'
 run('compile',['/opt/homebrew/bin/go','test','-c','-p=1','-o',str(binary),'./pkg/sim'],90)
 report['binary_sha256']=sha(binary);save()
 run('native-gates',[str(binary),'-test.run=^('+'|'.join(selectors)+')$','-test.count=3','-test.v','-test.timeout=150s'],160)
 run('processes-after',['/bin/ps','-axo','pid,ppid,pcpu,pmem,comm'],10)
 verify();report['source_verified_after']=True
 text=(OUT/'native-gates.log').read_text(); report['passed_tests']=[line[9:].split(' (')[0] for line in text.splitlines() if line.startswith('--- PASS:')]
 assert len(report['passed_tests'])==12 and all(report['passed_tests'].count(s)==3 for s in selectors)
 report['status']='passed'
except BaseException as e:
 report['status']='failed';report['failure']=str(e);raise
finally:
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
