"""Continue one approved Blender lane after the exact aircraft controller closes.

Original-source diagnostics are measurements, never automatic visual acceptance.
Each command gets a fresh log; the first process or integrity failure stops us.
"""
from pathlib import Path
import datetime
import hashlib
import json
import shutil
import subprocess
import time

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
AIR = REPO / 'work/art/ir-isr-service-final-production-v1'
STRIKE = REPO / 'work/art/aircraft-strike-final-production-v1'
VEHICLE = REPO / 'work/art/vehicle-final-production-v1'
PYTHON = REPO / 'work/art/.venv/bin/python'
BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
plan = json.loads((BASE / 'plan.json').read_text())
status = BASE / 'status.json'
assert not status.exists(), 'Preserve the previous attempt.'
events = []


def note(phase, **fields):
    event = {'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'phase': phase, **fields}
    events.append(event)
    temporary = status.with_suffix('.tmp')
    temporary.write_text(json.dumps({'scope': plan['scope'], 'events': events}, indent=2) + '\n')
    temporary.replace(status)
    print(json.dumps(event), flush=True)


def verify_inputs():
    for relative, wanted in plan['inputs'].items():
        assert sha(REPO / relative) == wanted, relative


def boundary():
    flags = [BASE / 'pause-next', AIR / 'pause-next', STRIKE / 'pause-after-current',
             REPO / 'work/art/ir-isr-service-readability-candidate-v1/pause-next']
    present = [str(p.relative_to(REPO)) for p in flags if p.exists()]
    if present:
        note('paused_at_complete_boundary', flags=present)
        raise SystemExit(0)
    verify_inputs()
    rows = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True).splitlines()
    assert not [r for r in rows if r.strip().endswith('/Blender') or r.strip().endswith(' Blender')]
    power = subprocess.check_output(['pmset', '-g', 'batt'], text=True)
    assert "'AC Power'" in power, ('No AC power', power)
    assert shutil.disk_usage(REPO).free >= 8 * 1024**3, 'Less than8GiB free; stop before a new job.'


def run(label, command, footer=None):
    log = BASE / (label + '.log')
    assert not log.exists(), ('Preserve previous attempt', log)
    note('running', label=label, command=command)
    with log.open('w') as stream:
        process = subprocess.run(command, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT)
    assert process.returncode == 0, (label, process.returncode)
    if footer:
        assert footer in log.read_text(), (label, 'Missing completion footer')
    verify_inputs()
    note('closed', label=label, log_sha256=sha(log))


try:
    verify_inputs()
    note('waiting_for_exact_aircraft_controller', pid=plan['wait_pid'])
    while True:
        p = subprocess.run(['ps', '-p', str(plan['wait_pid']), '-o', 'command='],
                           text=True, capture_output=True)
        if p.returncode or not p.stdout.strip():
            break
        assert p.stdout.strip() == plan['wait_command'], ('PID identity changed', p.stdout)
        time.sleep(10)
    last = json.loads((AIR / 'boundary-status.json').read_text())['events'][-1]['phase']
    assert last == 'approved_pair_mechanically_closed', last
    for family, aid in [(STRIKE, 'unit.US.strike'), (AIR, 'unit.IR.isr')]:
        assert 'FC_STAGED_AIRCRAFT_COMPLETE ' + aid in (family / ('driver-' + aid + '.log')).read_text()
        for prefix in ['check-', 'ui-check-']:
            assert json.loads((family / (prefix + aid + '.json')).read_text())['failures'] == 0
    boundary()
    run('isr-exact-copy-postgate', [str(PYTHON), str(AIR / 'verify-completed-reuse.py')])
    for item in plan['diagnostics']:
        boundary()
        family = REPO / 'work/art' / item['family']
        assert not (family / 'original-v1').exists(), 'Preserve previous diagnostic output.'
        run(item['family'], [BLENDER, '-b', '-t', '4', '--factory-startup', '-P',
                            str(family / 'render-diagnostic.py')], item['footer'])
        report = json.loads((family / 'original-v1/result.json').read_text())
        assert report['failures'] == 0
        run(item['family'] + '-contacts', [str(PYTHON), str(REPO / item['compose']), item['family']])
        note('original_diagnostic_ready_for_native_review', family=item['family'])
    boundary()
    aid = 'unit.US.aa'
    run('full-' + aid, ['zsh', str(VEHICLE / 'run.sh'), aid], 'FC_REMAINING_GROUND_COMPLETE ' + aid)
    note('approved_us_aa_mechanically_closed_native_review_pending')
except Exception as error:
    note('failed_preserved', error=repr(error))
    raise
