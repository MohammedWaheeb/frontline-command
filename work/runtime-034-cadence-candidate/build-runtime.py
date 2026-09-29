"""Reuse the accepted build/parity workflow on the exact clean candidate only."""
from pathlib import Path
import datetime, json, os, shutil, signal, subprocess, sys, time

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
COMBINED=ROOT/'work/maximum-server-combined-v1';SOURCE=COMBINED/'clean-source'
OLD=ROOT/'work/runtime-034-integrated-source/runtime-builds/20260929T081745Z'
LOCK='a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0'
sys.path.insert(0,str(COMBINED));from runner_guard import digest,verify_source,save_report,finalize_report
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
OUT=HERE/'runtime-builds'/stamp;OUT.mkdir(parents=True);RUNTIME=OUT/'runtime';(RUNTIME/'bin').mkdir(parents=True)
for name in ('logs','inputs','parity/native','fixtures/service'):(OUT/name).mkdir(parents=True)
report={'status':'running','started':stamp,'scope':'Serial GOMAXPROCS1 production-equivalent builds and actual WASM parity on clean source. Shared-host correctness only, no browser or listening host.','stages':[]}
env={k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ('GOOS','GOARCH')};env.update(GOMAXPROCS='1',GOFLAGS='-p=1')
shipping={str(p.relative_to(ROOT)):digest(p) for p in (ROOT/'client/public/runtime').rglob('*') if p.is_file()}
shipping['client/src/protocol/frontline_pb.ts']=digest(ROOT/'client/src/protocol/frontline_pb.ts')
input_pins={}
def pin(p):input_pins[str(p.relative_to(ROOT))]=digest(p)
def guard():
    source=verify_source(SOURCE,HERE/'source-lock.json',LOCK)
    for name,sha in shipping.items():assert digest(ROOT/name)==sha,name
    for name,sha in input_pins.items():assert digest(ROOT/name)==sha,name
    return source
def run(name,cmd,extra=None,cwd=SOURCE,limit=180):
    guard();start=time.monotonic();log=OUT/'logs'/(name+'.log')
    with log.open('wb') as f:
        proc=subprocess.Popen([str(x) for x in cmd],cwd=cwd,env=dict(env,**(extra or {})),stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        try:code=proc.wait(timeout=limit)
        except BaseException:
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            proc.wait();raise
    row={'stage':name,'command':[str(x) for x in cmd],'environment':extra or {},'cwd':str(cwd),'exit':code,'seconds':time.monotonic()-start,'log_sha256':digest(log)}
    report['stages'].append(row);save_report(OUT,report);print(json.dumps(row),flush=True)
    assert code==0,name;guard();return log.read_text()
try:
    save_report(OUT,report)
    assert digest(COMBINED/'runner_guard.py')=='55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
    assert digest(OLD/'receipt.json')=='cc990ac7f78d5a1094dd635d06bff0cb04d2c055ce413dbd114a7233bb176e69'
    old=json.loads((OLD/'receipt.json').read_text());pin(OLD/'receipt.json')
    for name,item in old['files'].items():assert digest(OLD/'runtime'/name)==item['sha256'];pin(OLD/'runtime'/name)
    for name in ('build-runtime.py','production-wasm-parity.mjs','checkpoint_adapter_oracle_test.go'):
        pin(HERE/name);shutil.copy2(HERE/name,OUT/'inputs'/name)
    for name,sha in old['worker_inputs'].items():assert digest(OLD/'inputs'/name)==sha;pin(OLD/'inputs'/name);shutil.copy2(OLD/'inputs'/name,OUT/'inputs'/name)
    service=OLD/'fixtures/native/service'
    fixtures=sorted(service.iterdir());assert len(fixtures)==18
    for path in fixtures:
        assert digest(path)==old['fixture_files_equal']['service/'+path.name];pin(path);shutil.copy2(path,OUT/'fixtures/service'/path.name)
    checkpoint=COMBINED/'server-01/evidence/final.save.json';assert digest(checkpoint)=='dd8de215f6a2f67d0d9a558f5ee1f5ba2b520dd98c4ffdc51836fbce82f9876a';pin(checkpoint);shutil.copy2(checkpoint,OUT/'fixtures/checkpoint.save.json')
    for path in (OLD/'parity/native-adapter/service').glob('*.json'):pin(path)
    baseline=json.loads((ROOT/'work/runtime-034-integrated-source/source-lock.json').read_text())['files']
    unchanged=[name for name in baseline if name.startswith(('protocol/','client/src/protocol/','internal/viewproto/'))]
    assert all(digest(SOURCE/name)==baseline[name] for name in unchanged)
    report.update(input_pins=input_pins,shipping_inputs=shipping,initial_source_guard=guard(),unchanged_protocol_mapper_files=unchanged)
    save_report(OUT,report)
    go='/opt/homebrew/bin/go';assert 'go1.27.1 darwin/arm64' in run('go-version',[go,'version'])
    run('build-wasm',[go,'build','-trimpath','-o',RUNTIME/'frontline.wasm','./cmd/wasm'],{'GOOS':'js','GOARCH':'wasm'})
    run('build-native-adapter',[go,'build','-trimpath','-o',RUNTIME/'bin/runtime-native','./cmd/wasm'])
    run('build-native-host',[go,'build','-trimpath','-o',RUNTIME/'bin/frontline-host','./cmd/frontline'])
    for name in ('worker.js','worker.js.map','wasm_exec.js','frontline_pb.ts'):shutil.copy2(OLD/'runtime'/name,RUNTIME/name)
    goroot=Path(run('goroot',[go,'env','GOROOT']).strip());assert digest(goroot/'lib/wasm/wasm_exec.js')==digest(RUNTIME/'wasm_exec.js')
    version=json.loads(run('native-version',[RUNTIME/'bin/runtime-native','-version']));assert version==old['version'];report['version']=version
    (RUNTIME/'version.json').write_text(json.dumps(version,indent=2)+'\n')
    assert digest(SOURCE/'client/src/protocol/frontline_pb.ts')==digest(RUNTIME/'frontline_pb.ts')
    for name in ('runtime-native','frontline-host'):run('build-info-'+name,[go,'version','-m',RUNTIME/'bin'/name])
    report['files']={name:{'sha256':digest(RUNTIME/name),'bytes':(RUNTIME/name).stat().st_size,'equals_prior':digest(RUNTIME/name)==item['sha256']} for name,item in old['files'].items()};save_report(OUT,report)
    synthetic=SOURCE/'cmd/wasm/checkpoint_runtime_oracle_test.go';assert not synthetic.exists()
    overlay={'Replace':{str(synthetic):str(OUT/'inputs/checkpoint_adapter_oracle_test.go')}}
    (OUT/'inputs/overlay.json').write_text(json.dumps(overlay,indent=2)+'\n');report['test_overlay_sha256']=digest(OUT/'inputs/overlay.json')
    selected=['TestCandidateServiceSessionAdapterParity','TestRuntimeCheckpointSessionOracle']
    extra={'FRONTLINE_SERVICE_INPUT':str(OUT/'fixtures/service'),'FRONTLINE_SERVICE_ADAPTER_OUTPUT':str(OUT/'parity/native/service'),'FRONTLINE_CHECKPOINT_ADAPTER_INPUT':str(OUT/'fixtures/checkpoint.save.json'),'FRONTLINE_CHECKPOINT_ADAPTER_OUTPUT':str(OUT/'parity/native/checkpoint')}
    log=run('native-session-oracles',[go,'test','-p=1','-overlay='+str(OUT/'inputs/overlay.json'),'-count=1','-timeout=90s','-json','-run=^('+'|'.join(selected)+')$','./cmd/wasm'],extra)
    outcomes={}
    for line in log.splitlines():
        try:event=json.loads(line)
        except json.JSONDecodeError:continue
        if event.get('Action') in ('pass','skip','fail') and event.get('Test'):outcomes[event['Test']]=event['Action']
    assert all(outcomes.get(name)=='pass' for name in selected) and not any(v!='pass' for v in outcomes.values()),outcomes
    assert len(outcomes)==8,outcomes;report['oracle_selected_outcomes']=outcomes
    for path in (OUT/'parity/native/service').glob('*.json'):assert path.read_bytes()==(OLD/'parity/native-adapter/service'/path.name).read_bytes(),path.name
    report['service_records_equal_original']=6;save_report(OUT,report)
    run('actual-production-wasm',['node',HERE/'production-wasm-parity.mjs',OUT],cwd=ROOT)
    proof=json.loads((OUT/'parity/production-wasm.json').read_text());assert proof['status']=='passed' and len(proof['cases'])==6 and len(proof['checkpoint'])==3 and proof['goExited']
    report.update(status='passed',shipping_unchanged=True,prior_runtime_unchanged=True,production_wasm_proof_sha256=digest(OUT/'parity/production-wasm.json'))
except BaseException as error:
    report['status']='failed';report['failure']=repr(error);raise
finally:
    final_ok=finalize_report(OUT,report,guard)
if not final_ok:raise SystemExit(1)
print(str(OUT),flush=True)
