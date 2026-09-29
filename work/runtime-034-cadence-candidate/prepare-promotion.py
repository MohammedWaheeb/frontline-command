"""Prepare exact reversible live preconditions only after all fresh gates pass."""
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
COMBINED = ROOT / 'work/maximum-server-combined-v1'
SOURCE = COMBINED / 'clean-source'
BUILD = HERE / 'runtime-builds/20260929T182132Z'
BASE = ROOT / 'work/runtime-034-integrated-source'
LOCK = 'a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):
    return json.loads(path.read_text())
def digest(path):
    return sha(path) if path.is_file() else None
assert sha(COMBINED / 'runner_guard.py') == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
spec = importlib.util.spec_from_file_location('guard', COMBINED / 'runner_guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
source_guard = guard.verify_source(SOURCE, HERE / 'source-lock.json', LOCK)
assert sha(BASE / 'source-lock.json') == '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
baseline = read(BASE / 'source-lock.json')['files']
locked = read(HERE / 'source-lock.json')['files']
assert sha(COMBINED / 'production-inventory.json') == '5e245676eaf690224ee9ddc941abbff0889c7a3219819ea549dc5cb373f5fe77'
inventory = read(COMBINED / 'production-inventory.json')['files']
assert len(inventory) == 7
assert {p for p, v in locked.items() if baseline.get(p) != v} == {r['path'] for r in inventory}
assert all(digest(ROOT / p) == v for p, v in baseline.items()), 'Live source drift from reviewed baseline; reconcile before promotion'

receipt = read(BUILD / 'receipt.json')
audit = read(BUILD / 'audit.json')
assert receipt['status'] == audit['status'] == 'passed'
assert sha(BUILD / 'receipt.json') == audit['receipt_sha256'] == '48b920bbeb1ed8096f7c99f964cb3ee5ebff94b1720da5678e44a67732e6731d'
assert sha(COMBINED / 'checks-02/receipt.json') == '804bd749daf05d6f051f72cc6ba415cc144475634704ce817b87593b6f15e4d3'
assert read(COMBINED / 'checks-02/receipt.json')['status'] == 'passed'
assert read(COMBINED / 'server-01/receipt.json')['status'] == 'passed'
assert read(COMBINED / 'server-01/postrun-audit.json')['status'] == 'passed'
missions = read(HERE / 'completed-mission-audit.json')
assert missions['source_lock_sha256'] == LOCK
assert [(p['phase'], p['passed'], p['failed'], p['unrun']) for p in missions['phases']] == [('main', 102, 0, 0), ('optional', 21, 0, 0)]
assert all(not p['historical_final_hash_differences'] and not p['historical_order_ledger_differences'] for p in missions['phases'])
for phase in missions['phases']:
    assert sha(HERE / phase['directory'] / 'run.json') == phase['run_sha256']
bot_runs = sorted((HERE / 'skirmish-runs').glob('*/receipt-audit.json'))
assert bot_runs
bot_audit_path = bot_runs[-1]
bots = read(bot_audit_path)
assert bots['source_lock_sha256'] == LOCK and len(bots['cases']) == 13 and not bots['differences']
assert all(all(c['baseline_equality'].values()) for c in bots['cases'])
assert sha(bot_audit_path.parent / 'run.json') == bots['run_sha256']
bot_run = read(bot_audit_path.parent / 'run.json')
assert (bot_run['passed'], bot_run['failed'], bot_run['unrun']) == (13, 0, 0)

changes = []
for item in inventory:
    rel = item['path']
    assert digest(ROOT / rel) == item['baseline_sha256']
    assert sha(SOURCE / rel) == locked[rel] == item['candidate_sha256']
    changes.append(dict(path=rel, source=str((SOURCE / rel).relative_to(ROOT)),
                        action='replace' if item['baseline_sha256'] else 'add', category=item['kind'],
                        live_sha256=item['baseline_sha256'], source_sha256=item['candidate_sha256'], bytes=item['bytes']))
runtime = []
runtime_unchanged = {}
targets = [('frontline.wasm', 'client/public/runtime/frontline.wasm'),
           ('wasm_exec.js', 'client/public/runtime/wasm_exec.js'), ('worker.js', 'client/public/runtime/worker.js'),
           ('worker.js.map', 'client/public/runtime/worker.js.map'), ('version.json', 'client/public/runtime/version.json'),
           ('frontline_pb.ts', 'client/src/protocol/frontline_pb.ts'),
           ('bin/runtime-native', 'bin/runtime-native'), ('bin/frontline-host', 'bin/frontline')]
old = read(BASE / 'runtime-builds/20260929T081745Z/receipt.json')
for name, target in targets:
    path = BUILD / 'runtime' / name
    assert sha(path) == receipt['files'][name]['sha256']
    assert sha(ROOT / target) == old['files'][name]['sha256'], 'Live runtime drift: ' + target
    if sha(ROOT / target) == sha(path):
        runtime_unchanged[target] = sha(path)
    else:
        runtime.append(dict(path=target, source=str(path.relative_to(ROOT)), live_sha256=sha(ROOT / target),
                            source_sha256=sha(path), bytes=path.stat().st_size, action='replace'))
assert len(runtime) == 3 and len(runtime_unchanged) == 5
assert read(ROOT / 'client/public/runtime/version.json') == receipt['version']
assert 'const Version = "0.3.4"' in (ROOT / 'pkg/sim/state.go').read_text()
extra_go = {str(p.relative_to(ROOT)): sha(p) for folder in ('cmd', 'internal', 'pkg', 'protocol')
            for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix in ('.go', '.proto') and str(p.relative_to(ROOT)) not in baseline}
assert not extra_go, 'Unexpected live Go/proto files outside baseline; review explicitly'
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = HERE / 'promotion-review' / stamp
out.mkdir(parents=True, exist_ok=False)
backup = {}
for entry in changes + runtime:
    if entry['live_sha256'] is None:
        continue
    src = ROOT / entry['path']
    target = out / 'prior-live' / entry['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, target)
    assert sha(target) == entry['live_sha256'] == sha(src)
    backup[entry['path']] = dict(sha256=sha(target), bytes=target.stat().st_size, mode=src.stat().st_mode & 0o777)
manifest = dict(status='prepared_only_not_promoted', prepared_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                source_guard=source_guard, source_changes=changes, runtime_copies=runtime,
                unchanged_locked_source={p: v for p, v in locked.items() if p not in {x['path'] for x in changes}},
                unchanged_runtime=runtime_unchanged, prior_live_backup=backup,
                additions_absent_before=[r['path'] for r in changes if r['action'] == 'add'],
                version=receipt['version'], simulation_compatibility='0.3.4 unchanged; no save migration or metadata relabeling',
                evidence={str(p.relative_to(ROOT)): sha(p) for p in (BUILD / 'receipt.json', BUILD / 'audit.json', HERE / 'completed-mission-audit.json', bot_audit_path, COMBINED / 'checks-02/receipt.json', COMBINED / 'server-01/receipt.json', COMBINED / 'server-01/postrun-audit.json')},
                untouched='No live writes, browser, host, build or deployment. All frozen products and original failed evidence remain unchanged.')
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
for entry in changes + runtime:
    assert digest(ROOT / entry['path']) == entry['live_sha256']
guard.verify_source(SOURCE, HERE / 'source-lock.json', LOCK)
print(json.dumps(dict(path=str(out), manifest_sha256=sha(out / 'manifest.json'), source_paths=len(changes), runtime_paths=len(runtime), backups=len(backup)), indent=2))
