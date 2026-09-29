"""Focused serial correctness checks only; never starts the actor timing course."""
from pathlib import Path
import datetime, json, os, signal, subprocess, sys, time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'work/maximum-load-034-course'))
from runner_guard import digest, verify_source, save_report, finalize_report

LOCK = '36a7a73678c71dc57709ab4a655e545382e24ae808900b784832f747292c6444'
assert sys.argv[1].startswith('checks-') and '/' not in sys.argv[1]
OUT = HERE / sys.argv[1]; OUT.mkdir()
source = HERE / 'source'
report = {'status': 'running', 'started': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Serial focused native/WASM/race correctness, shared host with rendering; no timing qualification or actor course.', 'stages': []}
def guard(): return verify_source(source, HERE / 'source-lock.json', LOCK)
env = {k:v for k,v in os.environ.items() if not k.startswith('FRONTLINE_')}
env.update(GOMAXPROCS='1', GOFLAGS='-p=1')
def run(name, cmd, overrides=None, limit=120):
    taskenv = dict(env, **(overrides or {})); start = time.monotonic()
    with (OUT / (name+'.log')).open('wb') as f:
        proc = subprocess.Popen(cmd, cwd=source, env=taskenv, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
        try: code = proc.wait(timeout=limit)
        except BaseException:
            try: os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            proc.wait(); raise
    row = {'stage':name, 'command':cmd, 'environment_overrides':overrides or {}, 'seconds':time.monotonic()-start, 'exit':code, 'log_sha256':digest(OUT/(name+'.log'))}
    report['stages'].append(row); save_report(OUT,report); print(json.dumps(row),flush=True)
    assert code == 0, name
try:
    save_report(OUT, report); report['initial_source_guard'] = guard()
    assert digest(ROOT/'work/maximum-load-034-course/runner_guard.py') == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
    report['runner_sha256'] = digest(Path(__file__))
    saved = ROOT/'work/maximum-load-034-course/server-01/evidence/final.save.json'
    assert digest(saved) == 'dd8de215f6a2f67d0d9a558f5ee1f5ba2b520dd98c4ffdc51836fbce82f9876a'
    report['actual_input_save_sha256'] = digest(saved)
    common = ['/opt/homebrew/bin/go','test','-p=1','-count=1','-v','-timeout=90s']
    selected = '^Test(CaptureCheckpoint.*|RecordReplayCheckpointPreservesSaveAndFailureFallback|ReplaySeekMatchesLiveHash|ReplayCompressedExportImport)$'
    run('native', common+['-run='+selected,'./pkg/sim','./internal/server'], {'FRONTLINE_CHECKPOINT_INPUT':str(saved),'FRONTLINE_CHECKPOINT_OUTPUT':str(OUT/'native-files')})
    run('wasm', common+['-exec=/opt/homebrew/Cellar/go/1.27.1/libexec/lib/wasm/go_js_wasm_exec','-run='+selected,'./pkg/sim'], {'GOOS':'js','GOARCH':'wasm','FRONTLINE_CHECKPOINT_INPUT':str(saved),'FRONTLINE_CHECKPOINT_OUTPUT':str(OUT/'wasm-files')})
    pairs = {}
    for name in ('boundary.save.json','boundary.replay.gz','checkpoint.gz'):
        native, wasm = digest(OUT/'native-files'/name), digest(OUT/'wasm-files'/name)
        assert native == wasm, name
        pairs[name] = {'sha256':native,'bytes':(OUT/'native-files'/name).stat().st_size}
    report['native_wasm_exact_artifacts'] = pairs
    run('race', common+['-race','-run=^Test(CaptureCheckpointOriginal.*|RecordReplayCheckpointPreservesSaveAndFailureFallback)$','./pkg/sim','./internal/server'])
    report['status'] = 'passed'
except BaseException as error:
    report['status']='failed';report['failure']=repr(error);raise
finally:
    final_ok = finalize_report(OUT, report, guard)
if not final_ok: raise SystemExit(1)
