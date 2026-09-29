#!/usr/bin/env python3
"""Execute only the parent's reviewed exact manifest; no builds or migrations."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import select
import shutil
import subprocess
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
REVIEW = HERE/'promotion-review/20260929T082155Z'
MANIFEST = REVIEW/'manifest.json'
EXPECTED = '970dde9b71798e6a41888580918de0713446a42cd1260880ed10df9d83d56537'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def digest(p):
    return sha(p) if p.is_file() else None

assert sha(MANIFEST) == EXPECTED
m = json.loads(MANIFEST.read_text())
entries = m['source_changes']+m['runtime_copies']
lock = json.loads((HERE/'source-lock.json').read_text())['files']
assert sha(HERE/'source-lock.json') == m['source_lock_sha256']
assert {str(p.relative_to(HERE/'source')):sha(p) for p in (HERE/'source').rglob('*') if p.is_file()} == lock
for entry in entries:
    assert digest(ROOT/entry['path']) == entry['live_sha256'], 'Live drift '+entry['path']
    assert sha(ROOT/entry['source']) == entry['source_sha256'], 'Candidate drift '+entry['source']
for rel, expected in m['unchanged_source'].items():
    assert sha(ROOT/rel) == expected
for rel, expected in m['prior_live_backup'].items():
    assert sha(REVIEW/'prior-live'/rel) == expected['sha256']
assert not (REVIEW/'promotion.json').exists(), 'Do not rerun a transaction'
old_lock = json.loads((ROOT/'work/navigation-lookup-candidate/source-lock.json').read_text())['files']
assert {str(p.relative_to(ROOT/'work/navigation-lookup-candidate/source')):sha(p) for p in (ROOT/'work/navigation-lookup-candidate/source').rglob('*') if p.is_file()} == old_lock
report = dict(status='copying',started_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),manifest_sha256=EXPECTED,copied=[])

def save():
    (REVIEW/'promotion.json').write_text(json.dumps(report,indent=2)+'\n')

save()
for entry in entries:
    target = ROOT/entry['path']
    # Recheck immediately before each replacement as well as the full preflight.
    assert digest(target) == entry['live_sha256']
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary = target.with_name(target.name+'.promotion-temporary')
    assert not temporary.exists()
    shutil.copy2(ROOT/entry['source'],temporary)
    assert sha(temporary) == entry['source_sha256']
    os.replace(temporary,target)
    assert sha(target) == entry['source_sha256']
    report['copied'].append(dict(path=entry['path'],sha256=sha(target)))
    save()
assert {rel:sha(ROOT/rel) for rel in lock} == lock
assert {str(p.relative_to(ROOT/'work/navigation-lookup-candidate/source')):sha(p) for p in (ROOT/'work/navigation-lookup-candidate/source').rglob('*') if p.is_file()} == old_lock
report['all355_live_source_files_exact'] = True
report['all7_runtime_files_exact'] = True
report['source_version'] = re.search(r'const Version = "([^"]+)"', (ROOT/'pkg/sim/state.go').read_text()).group(1)
report['native_version'] = json.loads(subprocess.check_output([str(ROOT/'bin/runtime-native'),'-version'],cwd=ROOT,text=True))
assert report['source_version'] == '0.3.4'
assert report['native_version'] == m['new_runtime_version'] == json.loads((ROOT/'client/public/runtime/version.json').read_text())

# All current service-worker inputs are already represented byte-for-byte in
# its old source map. Runtime bytes are content-pack inputs, not embedded code.
sw = ROOT/'client/public/service-worker.js.map'
sourcemap = json.loads(sw.read_text())
report['service_worker_inputs'] = {}
for rel, text in zip(sourcemap['sources'],sourcemap['sourcesContent']):
    source = (sw.parent/rel).resolve()
    assert source.read_text() == text
    report['service_worker_inputs'][str(source.relative_to(ROOT))] = sha(source)
for rel in ('client/public/service-worker.js','client/public/service-worker.js.map'):
    assert sha(ROOT/rel) == m['prior_live_backup'][rel]['sha256']
report['service_worker'] = 'No regeneration needed: three embedded source-map inputs exactly equal current sources; files unchanged.'

env = dict(os.environ,GOMAXPROCS='1')
command = [str(ROOT/'bin/frontline'),'-addr','127.0.0.1:0','-data',str(REVIEW/'smoke-data'),'-static',str(ROOT/'client/public'),'-maps',str(ROOT/'content/maps'),'-missions',str(ROOT/'content/missions')]
host = subprocess.Popen(command,cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
    assert select.select([host.stdout],[],[],20)[0], 'Host startup timeout'
    line = host.stdout.readline()
    origin = re.search(r'http://127\.0\.0\.1:\d+',line).group(0)
    report['host_startup'] = line.strip()
    def get(route):
        with urllib.request.urlopen(origin+route,timeout=5) as response:
            assert response.status == 200
            return response.read()
    report['host_health'] = json.loads(get('/api/v1/health'))
    assert report['host_health'] == dict(status='ok',simulation='0.3.4',protocol=1,content_hash=m['new_runtime_version']['content_hash'],tick_rate=20,local=True)
    assert json.loads(get('/runtime/version.json')) == m['new_runtime_version']
    report['served_wasm_sha256'] = hashlib.sha256(get('/runtime/frontline.wasm')).hexdigest()
    assert report['served_wasm_sha256'] == sha(ROOT/'client/public/runtime/frontline.wasm')
finally:
    host.terminate()
    _, errors = host.communicate(timeout=10)
    report['host_exit_code'] = host.returncode
    report['host_stderr'] = errors
    save()
assert host.returncode == 0 and errors == ''
assert {rel:sha(ROOT/rel) for rel in lock} == lock
for entry in entries:
    assert sha(ROOT/entry['path']) == entry['source_sha256']
report.update(status='passed',finished_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              limitations='Selective source/runtime promotion and metadata/static-WASM smoke only. No browser, product/art pack publication, offline installation, save migration, deployment or new broad tests.')
save()
print(json.dumps({k:v for k,v in report.items() if k != 'copied'},indent=2))
