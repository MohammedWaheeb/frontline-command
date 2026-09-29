#!/usr/bin/env python3
"""Capture current live preconditions and reversible backups; never promote."""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = HERE/'source'
BUILD = HERE/'runtime-builds/20260929T081745Z'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def read(p):
    return json.loads(p.read_text())

def digest(p):
    return sha(p) if p.is_file() else None

locked = read(HERE/'source-lock.json')['files']
assert {str(p.relative_to(SOURCE)):sha(p) for p in SOURCE.rglob('*') if p.is_file()} == locked
assert sha(HERE/'source-lock.json') == '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
receipt = read(BUILD/'receipt.json')
assert receipt['status'] == 'passed' and read(BUILD/'audit.json')['status'] == 'passed'
assert read(BUILD/'audit.json')['receipt_sha256'] == sha(BUILD/'receipt.json')
prior = read(ROOT/'work/go-promotion-audit/selective-files.json')
integration = read(HERE/'integration-receipt.json')
commander = set(integration['commander_changed'] + integration['commander_added'])
prior_entries = {e['path']:e for e in prior['changed_or_added'] if e['category'] != 'excluded_old_fixture'}
expected = set(prior_entries) | commander
entries = []
unchanged = {}
for rel, desired in sorted(locked.items()):
    current = digest(ROOT/rel)
    if current == desired:
        unchanged[rel] = current
        continue
    assert rel in expected, 'Unexpected live drift: '+rel
    if rel in prior_entries:
        assert current == prior_entries[rel]['live_sha256'], 'Reviewed live input changed: '+rel
    elif rel in integration['commander_changed']:
        assert current == sha(HERE/'inputs/live-authored-tests'/Path(rel).name)
    else:
        assert current is None
    entries.append(dict(path=rel, action='replace' if current else 'add', category='commander_test' if rel in commander else prior_entries[rel]['category'],
                        live_sha256=current, source_sha256=desired, bytes=(SOURCE/rel).stat().st_size,
                        source=str((SOURCE/rel).relative_to(ROOT))))
assert {e['path'] for e in entries} == expected
assert len(entries) == 83 and len(unchanged) == 272
runtime = []
for name, target in [('frontline.wasm','client/public/runtime/frontline.wasm'), ('wasm_exec.js','client/public/runtime/wasm_exec.js'),
                     ('worker.js','client/public/runtime/worker.js'), ('worker.js.map','client/public/runtime/worker.js.map'),
                     ('version.json','client/public/runtime/version.json'), ('bin/runtime-native','bin/runtime-native'), ('bin/frontline-host','bin/frontline')]:
    p = BUILD/'runtime'/name
    assert sha(p) == receipt['files'][name]['sha256']
    runtime.append(dict(path=target,source=str(p.relative_to(ROOT)),live_sha256=digest(ROOT/target),source_sha256=sha(p),bytes=p.stat().st_size))
assert sha(BUILD/'runtime/frontline_pb.ts') == locked['client/src/protocol/frontline_pb.ts']
all_live_go = {str(p.relative_to(ROOT)):sha(p) for folder in ('cmd','internal','pkg','protocol') for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix in ('.go','.proto')}
outside = {name:val for name,val in all_live_go.items() if name not in locked}
old_source_version = re.search(r'const Version = "([^"]+)"', (ROOT/'pkg/sim/state.go').read_text()).group(1)
old_runtime_version = read(ROOT/'client/public/runtime/version.json')
old_adapter_version = json.loads(subprocess.check_output([str(ROOT/'bin/runtime-native'),'-version'],cwd=ROOT,text=True))
assert old_source_version == old_runtime_version['simulation'] == old_adapter_version['simulation'] == '0.3.3'
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = HERE/'promotion-review'/stamp
out.mkdir(parents=True,exist_ok=False)
backup_names = {e['path'] for e in entries+runtime if e['live_sha256'] is not None}
backup_names.update(('client/public/service-worker.js','client/public/service-worker.js.map'))
backup = {}
for rel in sorted(backup_names):
    p = ROOT/rel
    target = out/'prior-live'/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,target)
    assert sha(p) == sha(target)
    backup[rel] = dict(sha256=sha(p),bytes=p.stat().st_size,mode=p.stat().st_mode & 0o777)
manifest = dict(status='prepared_only_not_promoted',prepared_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                source_lock_sha256=sha(HERE/'source-lock.json'),build_receipt_sha256=sha(BUILD/'receipt.json'),build_audit_sha256=sha(BUILD/'audit.json'),
                source_changes=entries,unchanged_source=unchanged,retained_live_go_outside_lock=outside,
                excluded_historical_artifacts=[e['path'] for e in prior['changed_or_added'] if e['category']=='excluded_old_fixture'],
                runtime_copies=runtime,generated_ts_copy='Already included in source_changes; runtime/frontline_pb.ts is byte-identical.',
                categories=dict(collections.Counter(e['category'] for e in entries)),old_source_version=old_source_version,
                old_runtime_version=old_runtime_version,old_native_adapter_version=old_adapter_version,new_runtime_version=receipt['version'],
                source_additions_absent_before=[e['path'] for e in entries if e['action']=='add'],prior_live_backup=backup,
                untouched='No live file copied, deleted or regenerated. No host/WASM build/test or browser run. Prior product freezes and c7 source/runtime are unchanged.')
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for entry in entries+runtime:
    assert digest(ROOT/entry['path']) == entry['live_sha256']
for rel, val in unchanged.items():
    assert sha(ROOT/rel) == val
print(json.dumps(dict(output=str(out),manifest_sha256=sha(out/'manifest.json'),source_paths=len(entries),runtime_paths=len(runtime),
                      categories=manifest['categories'],unchanged=len(unchanged),retained_outside_lock=len(outside),backed_up=len(backup)),indent=2))
