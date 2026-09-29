"""One bounded serial continuation, with explicit whole-asset pause points."""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,time

BASE=Path(__file__).resolve().parent;REPO=BASE.parents[2]
FAMILY=REPO/'work/art/aircraft-final-production-v3'
os.chdir(REPO)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
plan=json.loads((BASE/'boundary-plan.json').read_text())
for rel,want in plan['inputs'].items():assert sha(REPO/rel)==want,rel
status=BASE/'boundary-status.json';events=[]
def note(phase,**detail):
 event={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':phase,**detail};events.append(event)
 temp=status.with_suffix('.tmp');temp.write_text(json.dumps({'scope':'No native acceptance or handoff inferred from automated continuation.','events':events},indent=2)+'\n');temp.replace(status)
 print(json.dumps(event),flush=True)
def boundary():
 if (BASE/'pause-next').exists():
  note('held_at_whole_job_boundary');raise SystemExit(0)
 rows=subprocess.check_output(['ps','-axo','pid=,comm='],text=True).splitlines()
 blender=[r.strip() for r in rows if r.strip().endswith('/Blender') or r.strip().endswith(' Blender')]
 assert not blender,('Unexpected Blender at serial boundary',blender)
def job(label,cmd,log,footer):
 boundary();assert not log.exists(),('Preserve previous job',log)
 note(label,command=cmd)
 with log.open('w') as stream:
  result=subprocess.run(cmd,stdout=stream,stderr=subprocess.STDOUT,cwd=REPO)
 assert result.returncode==0,(label,result.returncode)
 assert footer in log.read_text(),(label,'required footer absent')

try:
 note('waiting_for_owned_whole_asset',pid=plan['wait_pid'],asset='unit.SA.gunship')
 while True:
  row=subprocess.run(['ps','-p',str(plan['wait_pid']),'-o','command='],capture_output=True,text=True)
  if row.returncode!=0 or not row.stdout.strip():break
  assert row.stdout.strip()==plan['wait_command'],('PID identity changed',row.stdout)
  time.sleep(10)
 driver=FAMILY/'driver-unit.SA.gunship.log'
 assert 'FC_STAGED_AIRCRAFT_COMPLETE unit.SA.gunship' in driver.read_text()
 for kind in ['check','ui-check']:
  assert json.loads((FAMILY/f'{kind}-unit.SA.gunship.json').read_text())['failures']==0
 note('gunship_mechanically_closed_native_review_pending')
 proof=BASE/'proof-v1.json'
 if not proof.exists():job('strike_source_proof',['blender','-b','-t','4','--factory-startup','-P',str(BASE/'prove.py')],BASE/'proof-v1.log','FC_STRIKE_CRASH_SOURCE_DONE 8992 128 9120')
 result=json.loads(proof.read_text());assert result['failures']==0 and (result['unchanged_poses'],result['changed_poses'],result['reverse_resets'])==(8992,128,9120)
 assert result['candidate_sha256']==sha(BASE/'candidate-aircraft_roster.py')
 pilot=BASE/'pilot-v1/result.json'
 if not pilot.exists():job('strike_native_pilot',['blender','-b','-t','4','--factory-startup','-P',str(BASE/'pilot.py')],BASE/'pilot-v1.log','FC_STRIKE_CRASH_PILOT_DONE 128')
 result=json.loads(pilot.read_text());assert result['failures']==0 and result['source_sha256']==sha(BASE/'candidate-aircraft_roster.py')
 if not (BASE/'pilot-v1/contacts/result.json').exists():
  boundary();subprocess.run([str(REPO/'work/art/.venv/bin/python'),str(BASE/'compose.py')],check=True)
 note('strike_pilot_ready_for_native_review',proof_sha256=sha(proof),pilot_sha256=sha(pilot))
 job('unchanged_scout_full_export',['zsh',str(FAMILY/'run-staged.sh'),'unit.SY.scout_drone'],FAMILY/'driver-unit.SY.scout_drone.log','FC_STAGED_AIRCRAFT_COMPLETE unit.SY.scout_drone')
 note('scout_mechanically_closed_native_review_pending')
except Exception as error:
 note('failed_preserved',error=repr(error));raise
