from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,os,subprocess,uuid
ROOT=Path(__file__).resolve().parents[3]
BASE=Path(__file__).resolve().parent
MODEL='claude-opus-5-5'
sha=lambda b:hashlib.sha256(b).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('kind');args=parser.parse_args()
job=json.loads((BASE/'assignments.json').read_text())[args.kind]
for rel,digest in job['files'].items():assert sha((ROOT/rel).read_bytes())==digest,rel
assert not (ROOT/job['report']).exists(),'Preserve existing report; assign a new run instead'
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');prefix=BASE/args.kind/('run-'+stamp);session=str(uuid.uuid4())
def put(suffix,data):
 with Path(str(prefix)+suffix).open('x') as f:f.write(data if isinstance(data,str) else json.dumps(data,indent=2)+'\n')
put('.dispatch.json',{'at':datetime.now(timezone.utc).isoformat(),'model':MODEL,'fallback':False,'session':session,'assignment':job})
env=dict(os.environ)
for name in ['ANTHROPIC_MODEL','ANTHROPIC_DEFAULT_OPUS_MODEL','ANTHROPIC_DEFAULT_SONNET_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL']:env.pop(name,None)
env['CLAUDE_CODE_SUBAGENT_MODEL']=MODEL
command=['claude','--model',MODEL,'--fallback-model','','--setting-sources','','--settings',json.dumps({'model':MODEL,'availableModels':[MODEL],'fallbackModel':[],'switchModelsOnFlag':False}),'--permission-mode','acceptEdits','--allowedTools','Read,Write,Edit,Glob,Grep','--disallowedTools','Agent,Task,SendMessage,Bash','--output-format','stream-json','--verbose','--session-id',session,'--print']
with (ROOT/job['brief']).open() as inp,Path(str(prefix)+'.jsonl').open('x') as out,Path(str(prefix)+'.err').open('x') as err:
 p=subprocess.Popen(command,cwd=ROOT,env=env,stdin=inp,stdout=out,stderr=err)
 print(json.dumps({'prefix':str(prefix.relative_to(ROOT)),'pid':p.pid,'session':session}),flush=True);code=p.wait()
put('.exit.json',{'code':code,'at':datetime.now(timezone.utc).isoformat()})
rows=[json.loads(line) for line in Path(str(prefix)+'.jsonl').read_text().splitlines() if line.strip()]
models=sorted(set(r['message'].get('model') for r in rows if r.get('type')=='assistant' and r['message'].get('model')!='<synthetic>'))
result=next((r for r in reversed(rows) if r.get('type')=='result'),{});usage=sorted(result.get('modelUsage',{}))
changed=[rel for rel,h in job['files'].items() if not (ROOT/rel).is_file() or sha((ROOT/rel).read_bytes())!=h]
outputs={rel:sha((ROOT/rel).read_bytes()) for rel in job['outputs'] if (ROOT/rel).is_file()}
complete=code==0 and not result.get('is_error',True) and result.get('terminal_reason')=='completed' and models==[MODEL] and usage==[MODEL] and not changed and job['report'] in outputs
audit={'status':'completed-exact-model' if complete else 'incomplete-or-rejected','requested_model':MODEL,'fallback':False,'generated_models':models,'usage_models':usage,'terminal_reason':result.get('terminal_reason'),'is_error':result.get('is_error'),'exit_code':code,'inputs_changed':changed,'outputs':outputs,'validation':'Source authoring only; no numerical, test, render or browser acceptance implied'}
put('.model-audit.json',audit);print(json.dumps(audit),flush=True)
if not complete:raise SystemExit(code or 1)
