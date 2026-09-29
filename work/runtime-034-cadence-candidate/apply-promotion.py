"""Apply only the exact root-authorized ten-path manifest, then bounded smoke."""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import shutil
import subprocess
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
REVIEW = HERE / 'promotion-review/20260929T185739Z'
MANIFEST = REVIEW / 'manifest.json'
EXPECTED = '2beefa9d34397de10a07692a3d6fd6c66b11558aa8fe16f40c34a9c92ad5474d'
COMBINED = ROOT / 'work/maximum-server-combined-v1'
SOURCE = COMBINED / 'clean-source'
REPORT = REVIEW / 'promotion.json'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def digest(path):
    return sha(path) if path.is_file() else None
def read(path):
    return json.loads(path.read_text())
assert not REPORT.exists(), 'Refuse to repeat or overwrite a prior transaction'
report = dict(status='preflight', manifest_sha256=EXPECTED, copied=[],
              started_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              authorization='Root independently reviewed the exact manifest and authorized these ten paths plus one loopback smoke.')
def save():
    temporary = REVIEW / '.promotion-receipt.partial'
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    os.replace(temporary, REPORT)
host = None
try:
    save()
    assert sha(MANIFEST) == EXPECTED
    manifest = read(MANIFEST)
    assert manifest['status'] == 'prepared_only_not_promoted'
    assert sha(COMBINED / 'runner_guard.py') == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
    spec = importlib.util.spec_from_file_location('guard', COMBINED / 'runner_guard.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    report['clean_source_guard'] = guard.verify_source(SOURCE, HERE / 'source-lock.json', manifest['source_guard']['source_lock_sha256'])
    locked = read(HERE / 'source-lock.json')['files']
    entries = manifest['source_changes'] + manifest['runtime_copies']
    assert len(entries) == 10 and len(manifest['source_changes']) == 7 and len(manifest['runtime_copies']) == 3
    for row in entries:
        target = ROOT / row['path']
        assert not target.is_symlink()
        assert digest(target) == row['live_sha256'], 'Immediate live precondition: ' + row['path']
        assert sha(ROOT / row['source']) == row['source_sha256']
    for rel, value in manifest['unchanged_locked_source'].items():
        assert sha(ROOT / rel) == value
    for rel, value in manifest['unchanged_runtime'].items():
        assert sha(ROOT / rel) == value
    for rel, value in manifest['evidence'].items():
        assert sha(ROOT / rel) == value
    for rel, value in manifest['prior_live_backup'].items():
        assert sha(REVIEW / 'prior-live' / rel) == value['sha256']
        assert (ROOT / rel).stat().st_mode & 0o777 == value['mode']
    static_pins = {rel: sha(ROOT / rel) for rel in ('client/public/service-worker.js', 'client/public/service-worker.js.map')}
    report['service_worker_before'] = static_pins
    report['status'] = 'copying'
    save()
    for row in entries:
        target = ROOT / row['path']
        assert not target.is_symlink() and digest(target) == row['live_sha256']
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.cadence-promotion-temporary')
        assert not temporary.exists()
        shutil.copy2(ROOT / row['source'], temporary)
        mode = manifest['prior_live_backup'][row['path']]['mode'] if row['live_sha256'] is not None else (ROOT / row['source']).stat().st_mode & 0o777
        os.chmod(temporary, mode)
        assert sha(temporary) == row['source_sha256']
        assert digest(target) == row['live_sha256']
        os.replace(temporary, target)
        assert sha(target) == row['source_sha256'] and target.stat().st_mode & 0o777 == mode
        report['copied'].append(dict(path=row['path'], sha256=sha(target), mode=mode))
        save()
    def postcheck():
        assert {rel: sha(ROOT / rel) for rel in locked} == locked
        runtimes = dict(manifest['unchanged_runtime'])
        runtimes.update({r['path']: r['source_sha256'] for r in manifest['runtime_copies']})
        assert len(runtimes) == 8 and all(sha(ROOT / rel) == value for rel, value in runtimes.items())
        assert all(sha(ROOT / rel) == value for rel, value in static_pins.items())
        guard.verify_source(SOURCE, HERE / 'source-lock.json', manifest['source_guard']['source_lock_sha256'])
        return dict(locked_live_source_files=359, exact_runtime_files=8, source_and_runtime_exact=True, service_worker_unchanged=True)
    report['postcopy'] = postcheck()
    env = {k: v for k, v in os.environ.items() if not k.startswith('FRONTLINE_')}
    env['GOMAXPROCS'] = '1'
    version = json.loads(subprocess.check_output([str(ROOT / 'bin/runtime-native'), '-version'], cwd=ROOT, env=env, text=True, timeout=20))
    assert version == manifest['version'] == read(ROOT / 'client/public/runtime/version.json')
    report['native_version'] = version
    data = REVIEW / 'smoke-data'
    assert not data.exists(), 'Smoke must use fresh isolated data'
    assert (ROOT / 'content/maps').is_dir() and (ROOT / 'content/missions').is_dir()
    assert list((ROOT / 'content/maps').glob('*.json')) and list((ROOT / 'content/missions').glob('*.json'))
    command = [str(ROOT / 'bin/frontline'), '-addr', '127.0.0.1:0', '-data', str(data),
               '-static', str(ROOT / 'client/public'), '-maps', str(ROOT / 'content/maps'), '-missions', str(ROOT / 'content/missions')]
    report['smoke_command'] = command
    host = subprocess.Popen(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert select.select([host.stdout], [], [], 20)[0], 'Host startup timeout'
        line = host.stdout.readline()
        match = re.search(r'http://127\.0\.0\.1:\d+', line)
        assert match, 'Missing actual loopback listener address'
        origin = match.group(0)
        report['host_startup'] = line.strip()
        report['http'] = []
        def get(route):
            with urllib.request.urlopen(origin + route, timeout=10) as response:
                body = response.read()
                assert response.status == 200
                report['http'].append(dict(route=route, status=response.status, bytes=len(body), content_type=response.headers.get('Content-Type'), sha256=hashlib.sha256(body).hexdigest()))
                return body
        health = json.loads(get('/api/v1/health'))
        assert health == dict(status='ok', simulation='0.3.4', protocol=1, content_hash=version['content_hash'], tick_rate=20, local=True)
        report['host_health'] = health
        assert json.loads(get('/runtime/version.json')) == version
        report['served_wasm_sha256'] = hashlib.sha256(get('/runtime/frontline.wasm')).hexdigest()
        assert report['served_wasm_sha256'] == sha(ROOT / 'client/public/runtime/frontline.wasm')
        assert report['http'][-1]['content_type'].split(';')[0] == 'application/wasm'
    finally:
        host.terminate()
        try:
            output, errors = host.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            host.kill()
            output, errors = host.communicate(timeout=5)
        report['host_exit_code'] = host.returncode
        report['host_remaining_stdout'] = output
        report['host_stderr'] = errors
        save()
    assert host.returncode == 0 and errors == ''
    report['final_postcheck'] = postcheck()
    report.update(status='passed', limitations='Exact selective source/runtime promotion and isolated loopback health/version/WASM smoke only. No client/art package build, browser, save migration, deployment, broad test repetition or new performance claim.')
except BaseException as error:
    report['status'] = 'failed'
    report['failure'] = repr(error)
    raise
finally:
    if host is not None and host.poll() is None:
        host.kill()
        host.communicate(timeout=5)
    report['finished_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
print(json.dumps(report, indent=2))
