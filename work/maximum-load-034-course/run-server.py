"""One isolated actual-actor course; execute only after parent releases a quiet window."""
from pathlib import Path
import argparse, datetime, json, os, platform, signal, subprocess, time
from runner_guard import digest, verify_source, save_report, finalize_report

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EXPECTED_LOCK = '4671ae3aae65169d1824a84c200cdeadfe709a6ae821f773538e2e426e20836e'
p = argparse.ArgumentParser()
p.add_argument('name')
p.add_argument('--conditions', required=True)
args = p.parse_args()
assert args.name.startswith('server-') and '/' not in args.name
OUT = HERE / args.name
OUT.mkdir()  # Never overwrite a previous attempt.
source, lockpath = HERE / 'server-source', HERE / 'server-source-lock.json'
report = {'status': 'running', 'started': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'expected_source_lock_sha256': EXPECTED_LOCK, 'conditions': args.conditions,
          'environment': {'GOMAXPROCS': '1', 'GOFLAGS': '-p=1', 'GOGC': os.environ.get('GOGC'), 'GOMEMLIMIT': os.environ.get('GOMEMLIMIT')},
          'platform': platform.platform(), 'stages': []}
env = dict(os.environ, GOMAXPROCS='1', GOFLAGS='-p=1')
for k in list(env):
    if k.startswith('FRONTLINE_'):
        del env[k]
env['FRONTLINE_MAXIMUM_INPUT'] = str(ROOT / 'work/combined-load-current/run-02')
env['FRONTLINE_MAXIMUM_OUTPUT'] = str(OUT / 'evidence')
def verify():
    return verify_source(source, lockpath, EXPECTED_LOCK)
def save():
    save_report(OUT, report)
def run(stage, cmd, limit):
    start = time.monotonic()
    with (OUT / (stage + '.log')).open('wb') as f:
        child = subprocess.Popen(cmd, cwd=source, env=env, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=limit)
        except BaseException:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            raise
    row = {'stage': stage, 'cmd': cmd, 'exit': code, 'seconds': time.monotonic() - start, 'log_sha256': digest(OUT / (stage + '.log'))}
    report['stages'].append(row)
    save()
    print(json.dumps(row), flush=True)
    assert code == 0, stage
try:
    save()  # Initial guard failures still have an owned, finalized receipt.
    report['runner_sha256'] = digest(Path(__file__))
    report['guard_sha256'] = digest(HERE / 'runner_guard.py')
    report['initial_source_guard'] = verify()
    report.update({k: report['initial_source_guard'][k] for k in ('source_lock_sha256', 'base_lock_sha256')})
    save()
    for name, cmd in [('go', ['/opt/homebrew/bin/go', 'version']), ('hardware', ['/usr/sbin/sysctl', '-n', 'machdep.cpu.brand_string', 'hw.memsize', 'hw.logicalcpu']), ('power', ['/usr/bin/pmset', '-g', 'batt']), ('processes-before', ['/bin/ps', '-axo', 'pid,ppid,pcpu,pmem,comm'])]:
        run(name, cmd, 10)
    binary = OUT / 'server.test'
    run('compile', ['/opt/homebrew/bin/go', 'test', '-c', '-p=1', '-o', str(binary), './internal/server'], 60)
    report['binary_sha256'] = digest(binary)
    save()
    run('actor600', [str(binary), '-test.run=^TestMaximumActualServerActor600$', '-test.count=1', '-test.v', '-test.timeout=75s'], 80)
    result = json.loads((OUT / 'evidence/server.json').read_text())
    assert result['status'] == 'passed'
    report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'failed'
    report['failure'] = repr(error)
    raise
finally:
    final_ok = finalize_report(OUT, report, verify)
# A final-only guard failure must also produce a failing process exit.
if not final_ok:
    raise SystemExit(1)
